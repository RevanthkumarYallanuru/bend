import { Decimal } from "@prisma/client/runtime/client";

import { prisma } from "../../config/database";
import { rangeToBounds, resolveDateRange } from "../../utils/dateRange";
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
  suppliers: true,
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

/**
 * `options.client` lets the Imports module run this inside its own
 * `$transaction` (atomic with the import row) instead of on the default
 * `prisma` client — same function, same validation, either way.
 * `options.importId` is internal-only (never exposed via the public Zod
 * schema): set only when this payable is being auto-created for an
 * import's pending balance.
 */
export async function createPayable(
  businessId: bigint,
  userId: bigint,
  data: CreatePayableInput,
  options?: { importId?: bigint; client?: TransactionClient }
) {
  const client = options?.client ?? prisma;

  const supplierId = BigInt(data.supplier_id);

  const supplier = await client.suppliers.findFirst({
    where: { id: supplierId, business_id: businessId },
  });

  if (!supplier) {
    throw new PayableError("Supplier not found", 404);
  }

  const totalAmount = roundMoney(decimalFrom(data.total_amount));

  const payableDate = data.payable_date
    ? new Date(`${data.payable_date}T00:00:00.000Z`)
    : new Date();

  return client.payables.create({
    data: {
      business_id: businessId,
      supplier_id: supplierId,
      import_id: options?.importId ?? null,
      total_amount: totalAmount,
      amount_paid: new Decimal(0),
      reason: data.reason,
      payable_date: payableDate,
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

  if (query.supplier_id) {
    where.supplier_id = BigInt(query.supplier_id);
  }

  if (query.search) {
    where.OR = [
      {
        suppliers: {
          name: {
            contains: query.search,
            mode: "insensitive",
          },
        },
      },
      {
        suppliers: {
          telugu_name: {
            contains: query.search,
            mode: "insensitive",
          },
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

  const dateBounds = rangeToBounds(query);

  if (dateBounds) {
    where.payable_date = dateBounds;
  }

  return prisma.payables.findMany({
    where,
    include: payableInclude,
    // payable_date alone isn't a reliable sort key on its own — many
    // payables share the same calendar date (it's admin-picked, not a
    // timestamp), so without a tiebreaker the most recently created
    // one among same-date rows wasn't guaranteed to land first. created_at
    // (always a real timestamp) breaks the tie deterministically.
    orderBy: [{ payable_date: "desc" }, { created_at: "desc" }],
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
      AND payable_date >= ${start}
      AND payable_date <= ${end}
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

/**
 * Applies one payment amount to one already-locked, already-validated
 * payable: creates its `payable_payments` row and updates
 * `amount_paid`/`status`/`paid_at`. Shared by the single-payable payment
 * path below and the supplier bulk-payment module (which calls this once
 * per payable it allocates to, inside its own transaction) — the one
 * place this math lives, so both paths can never drift apart.
 * Caller is responsible for locking the payable and validating that
 * `amount` does not exceed its remaining balance before calling this.
 */
export async function applyPayableAllocation(
  tx: TransactionClient,
  payable: { id: bigint; amount_paid: Decimal | string; total_amount: Decimal | string },
  amount: Decimal,
  paymentDate: Date,
  userId: bigint,
  options?: {
    supplierPaymentId?: bigint;
    paymentMethod?: Prisma.payable_paymentsCreateInput["payment_method"];
    referenceNumber?: string;
    notes?: string;
  }
) {
  const currentPaid = decimalFrom(payable.amount_paid);
  const totalAmount = decimalFrom(payable.total_amount);

  await tx.payable_payments.create({
    data: {
      payable_id: payable.id,
      amount,
      payment_date: paymentDate,
      payment_method: options?.paymentMethod ?? null,
      reference_number: options?.referenceNumber ?? null,
      notes: options?.notes ?? null,
      supplier_payment_id: options?.supplierPaymentId ?? null,
      created_by: userId,
    },
  });

  const newPaid = roundMoney(currentPaid.plus(amount));
  const newRemaining = roundMoney(totalAmount.minus(newPaid));
  const newStatus = newRemaining.lessThanOrEqualTo(0)
    ? "PAID"
    : "PARTIALLY_PAID";

  return tx.payables.update({
    where: { id: payable.id },
    data: {
      amount_paid: newPaid,
      status: newStatus,
      ...(newStatus === "PAID" ? { paid_at: paymentDate } : {}),
    },
  });
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

      // Every payment to a supplier gets a supplier_payments header (the
      // supplier's Payment History), not just bulk ones — a single-payable
      // payment is simply a header with one allocation.
      const header = await tx.supplier_payments.create({
        data: {
          business_id: businessId,
          supplier_id: payable.supplier_id,
          amount,
          payment_date: paymentDate,
          reason: `Payment - ${payable.reason}`.slice(0, 200),
          payment_method: data.payment_method ?? null,
          reference_number: data.reference_number ?? null,
          notes: data.notes ?? null,
          created_by: userId,
        },
      });

      await applyPayableAllocation(tx, payable, amount, paymentDate, userId, {
        supplierPaymentId: header.id,
        paymentMethod: data.payment_method ?? undefined,
        referenceNumber: data.reference_number ?? undefined,
        notes: data.notes ?? undefined,
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
