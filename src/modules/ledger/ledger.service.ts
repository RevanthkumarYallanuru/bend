import { Decimal } from "@prisma/client/runtime/client";

import { prisma } from "../../config/database";
import type { Prisma } from "../../../generated/prisma/client";

import type { LedgerQuery, OpeningBalanceInput } from "./ledger.validation";

export class LedgerError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "LedgerError";
    this.statusCode = statusCode;
  }
}

function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function decimalFrom(
  value: number | string | Decimal | null
): Decimal {
  return new Decimal((value ?? 0).toString());
}

async function ensureCustomer(
  businessId: bigint,
  customerId: bigint
) {
  const customer = await prisma.customers.findFirst({
    where: {
      id: customerId,
      business_id: businessId,
    },
  });

  if (!customer) {
    throw new LedgerError("Customer not found", 404);
  }

  return customer;
}

function buildLedgerWhere(
  businessId: bigint,
  customerId: bigint,
  query: Pick<LedgerQuery, "entry_type" | "start_date" | "end_date">
): Prisma.ledger_entriesWhereInput {
  const where: Prisma.ledger_entriesWhereInput = {
    business_id: businessId,
    customer_id: customerId,
  };

  if (query.entry_type) {
    where.entry_type = query.entry_type;
  }

  if (query.start_date || query.end_date) {
    where.transaction_at = {};

    if (query.start_date) {
      const startDateStr = query.start_date.includes("T")
        ? query.start_date
        : `${query.start_date}T00:00:00.000Z`;
      where.transaction_at.gte = new Date(startDateStr);
    }

    if (query.end_date) {
      const endDateStr = query.end_date.includes("T")
        ? query.end_date
        : `${query.end_date}T23:59:59.999Z`;
      where.transaction_at.lte = new Date(endDateStr);
    }
  }

  return where;
}

export async function getCustomerLedger(
  businessId: bigint,
  customerId: bigint,
  query: LedgerQuery
) {
  await ensureCustomer(businessId, customerId);

  const where = buildLedgerWhere(businessId, customerId, query);

  const skip = (query.page - 1) * query.limit;

  const [entries, total] = await Promise.all([
    prisma.ledger_entries.findMany({
      where,
      orderBy: [
        { transaction_at: "asc" },
        { id: "asc" },
      ],
      skip,
      take: query.limit,
    }),
    prisma.ledger_entries.count({ where }),
  ]);

  return {
    entries,
    total,
    page: query.page,
    limit: query.limit,
  };
}

/**
 * Full (unpaginated) ledger for a customer, for XLSX export.
 */
export async function getCustomerLedgerForExport(
  businessId: bigint,
  customerId: bigint,
  query: Pick<LedgerQuery, "entry_type" | "start_date" | "end_date">
) {
  await ensureCustomer(businessId, customerId);

  const where = buildLedgerWhere(businessId, customerId, query);

  return prisma.ledger_entries.findMany({
    where,
    orderBy: [{ transaction_at: "asc" }, { id: "asc" }],
  });
}

/**
 * Mirrors the `customer_balances` view formula
 * (SUM(debit) - SUM(credit)), computed via Prisma so it also
 * covers deactivated customers, which the view excludes.
 */
export async function getCustomerBalance(
  businessId: bigint,
  customerId: bigint
) {
  await ensureCustomer(businessId, customerId);

  const aggregate = await prisma.ledger_entries.aggregate({
    where: {
      business_id: businessId,
      customer_id: customerId,
    },
    _sum: {
      debit: true,
      credit: true,
    },
  });

  const totalDebit = decimalFrom(aggregate._sum.debit);
  const totalCredit = decimalFrom(aggregate._sum.credit);

  const balance = roundMoney(totalDebit.minus(totalCredit));

  return {
    customer_id: customerId,
    balance: balance.toString(),
  };
}

/**
 * One-time opening balance for a customer being onboarded into the
 * system with pre-existing dues from before it was in use. Recorded
 * as a single ADJUSTMENT ledger entry (never a fake SALE) so it shows
 * up correctly everywhere the ledger already does — customer profile,
 * ledger view, reports. Only allowed while the customer has no ledger
 * history yet, since inserting a balance mid-history would require
 * recomputing every later entry's balance_after.
 */
export async function setCustomerOpeningBalance(
  businessId: bigint,
  customerId: bigint,
  data: OpeningBalanceInput
) {
  await ensureCustomer(businessId, customerId);

  const existingCount = await prisma.ledger_entries.count({
    where: { business_id: businessId, customer_id: customerId },
  });

  if (existingCount > 0) {
    throw new LedgerError(
      "Opening balance can only be set for a customer with no existing transaction history",
      409
    );
  }

  const amount = roundMoney(decimalFrom(data.amount));

  return prisma.ledger_entries.create({
    data: {
      business_id: businessId,
      customer_id: customerId,
      entry_type: "ADJUSTMENT",
      debit: amount,
      credit: 0,
      balance_after: amount,
      description: data.notes?.trim()
        ? `Opening balance — ${data.notes.trim()}`
        : "Opening balance",
    },
  });
}
