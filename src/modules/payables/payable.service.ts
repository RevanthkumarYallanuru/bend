import { Decimal } from "@prisma/client/runtime/client";

import { prisma } from "../../config/database";
import { resolveDateRange } from "../../utils/dateRange";
import type { Prisma } from "../../../generated/prisma/client";

import type {
  CreatePayableInput,
  ListPayablesQuery,
  PayablesInsightsQuery,
  RecordPayablePaymentInput,
} from "./payable.validation";

/**
 * "My Pays" — money the business owes to others (suppliers,
 * transporters, etc.). Deliberately independent of the customer
 * payments/ledger system: no relation to customers, bills, or
 * ledger_entries anywhere in this file.
 */
export class PayableError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PayableError";
    this.statusCode = statusCode;
  }
}

type TransactionClient = Prisma.TransactionClient;

const payableInclude = {
  payable_payments: {
    orderBy: {
      payment_date: "asc" as const,
    },
  },
};

function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function decimalFrom(value: number | string | Decimal): Decimal {
  return new Decimal(value.toString());
}

export async function createPayable(
  businessId: bigint,
  userId: bigint,
  data: CreatePayableInput
) {
  const totalAmount = roundMoney(decimalFrom(data.total_amount));

  return prisma.payables.create({
    data: {
      business_id: businessId,
      payee_name: data.payee_name,
      total_amount: totalAmount,
      amount_paid: new Decimal(0),
      reason: data.reason,
      status: "PENDING",
      created_by: userId,
    },
    include: payableInclude,
  });
}

export async function getPayables(
  businessId: bigint,
  query: ListPayablesQuery
) {
  const where: Prisma.payablesWhereInput = {
    business_id: businessId,
  };

  if (query.status) {
    where.status = query.status;
  }

  if (query.search) {
    where.OR = [
      {
        payee_name: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        reason: {
          contains: query.search,
          mode: "insensitive",
        },
      },
    ];
  }

  return prisma.payables.findMany({
    where,
    include: payableInclude,
    orderBy: { created_at: "desc" },
  });
}

export async function getPayableById(
  businessId: bigint,
  payableId: bigint
) {
  return prisma.payables.findFirst({
    where: { id: payableId, business_id: businessId },
    include: payableInclude,
  });
}

export async function getPayablesInsights(
  businessId: bigint,
  range: PayablesInsightsQuery
) {
  const { start, end } = resolveDateRange(range);

  const rows = await prisma.$queryRaw<
    {
      count: bigint;
      total_amount: string;
      total_paid: string;
      pending_count: bigint;
      partially_paid_count: bigint;
      paid_count: bigint;
    }[]
  >`
    SELECT
      COUNT(*) AS count,
      COALESCE(SUM(total_amount), 0)::numeric(14,2) AS total_amount,
      COALESCE(SUM(amount_paid), 0)::numeric(14,2) AS total_paid,
      COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_count,
      COUNT(*) FILTER (WHERE status = 'PARTIALLY_PAID') AS partially_paid_count,
      COUNT(*) FILTER (WHERE status = 'PAID') AS paid_count
    FROM payables
    WHERE business_id = ${businessId}
      AND created_at >= ${start}
      AND created_at <= ${end}
  `;

  const row = rows[0];
  const totalAmount = decimalFrom(row.total_amount);
  const totalPaid = decimalFrom(row.total_paid);
  const totalRemaining = roundMoney(totalAmount.minus(totalPaid));

  return {
    range: { start: start.toISOString(), end: end.toISOString() },
    count: Number(row.count),
    total_amount: roundMoney(totalAmount).toString(),
    total_paid: roundMoney(totalPaid).toString(),
    total_remaining: totalRemaining.toString(),
    by_status: {
      PENDING: Number(row.pending_count),
      PARTIALLY_PAID: Number(row.partially_paid_count),
      PAID: Number(row.paid_count),
    },
  };
}

async function lockPayable(
  tx: TransactionClient,
  businessId: bigint,
  payableId: bigint
): Promise<void> {
  // Serialises concurrent payments against the same payable so the
  // running amount_paid/status cannot be read stale.
  await tx.$queryRaw`SELECT id FROM payables WHERE id = ${payableId} AND business_id = ${businessId} FOR UPDATE`;
}

export async function recordPayablePayment(
  businessId: bigint,
  userId: bigint,
  payableId: bigint,
  data: RecordPayablePaymentInput
) {
  return prisma.$transaction(
    async (tx) => {
      await lockPayable(tx, businessId, payableId);

      const payable = await tx.payables.findFirst({
        where: { id: payableId, business_id: businessId },
      });

      if (!payable) {
        throw new PayableError("Payable not found", 404);
      }

      if (payable.status === "PAID") {
        throw new PayableError(
          "This payable is already fully paid",
          409
        );
      }

      const amount = roundMoney(decimalFrom(data.amount));
      const currentPaid = decimalFrom(payable.amount_paid);
      const totalAmount = decimalFrom(payable.total_amount);
      const remaining = roundMoney(totalAmount.minus(currentPaid));

      if (amount.greaterThan(remaining)) {
        throw new PayableError(
          `Payment amount (${amount.toString()}) exceeds remaining balance (${remaining.toString()})`,
          409
        );
      }

      const paymentDate = data.payment_date
        ? new Date(data.payment_date)
        : new Date();

      await tx.payable_payments.create({
        data: {
          payable_id: payableId,
          amount,
          payment_date: paymentDate,
          payment_method: data.payment_method ?? null,
          reference_number: data.reference_number ?? null,
          notes: data.notes ?? null,
          created_by: userId,
        },
      });

      const newPaid = roundMoney(currentPaid.plus(amount));
      const newRemaining = roundMoney(totalAmount.minus(newPaid));
      const newStatus = newRemaining.lessThanOrEqualTo(0)
        ? "PAID"
        : "PARTIALLY_PAID";

      await tx.payables.update({
        where: { id: payableId },
        data: {
          amount_paid: newPaid,
          status: newStatus,
          ...(newStatus === "PAID" ? { paid_at: paymentDate } : {}),
        },
      });

      return tx.payables.findFirst({
        where: { id: payableId },
        include: payableInclude,
      });
    },
    {
      maxWait: 10000,
      timeout: 20000,
    }
  );
}
