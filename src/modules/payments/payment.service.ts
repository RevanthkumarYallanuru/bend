import { Decimal } from "@prisma/client/runtime/client";

import { prisma } from "../../config/database";
import type { Prisma } from "../../../generated/prisma/client";

import type {
  CreatePaymentInput,
  ListPaymentsQuery,
} from "./payment.validation";

export class PaymentError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PaymentError";
    this.statusCode = statusCode;
  }
}

type TransactionClient = Prisma.TransactionClient;

const paymentInclude = {
  customers: true,
  payment_allocations: {
    include: {
      bills: true,
    },
    orderBy: {
      id: "asc" as const,
    },
  },
  ledger_entries: true,
};

function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function decimalFrom(
  value: number | string | Decimal
): Decimal {
  return new Decimal(value.toString());
}

function toAuditJson(data: unknown) {
  return JSON.parse(
    JSON.stringify(data, (_key, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }

      if (Decimal.isDecimal(value)) {
        return value.toString();
      }

      return value;
    })
  );
}

async function generatePaymentNumber(
  tx: TransactionClient
): Promise<string> {
  const rows = await tx.$queryRaw<
    { generate_payment_number: string }[]
  >`SELECT generate_payment_number() AS generate_payment_number`;

  const paymentNumber = rows[0]?.generate_payment_number;

  if (!paymentNumber) {
    throw new PaymentError(
      "Failed to generate payment number",
      500
    );
  }

  return paymentNumber;
}

async function lockCustomer(
  tx: TransactionClient,
  customerId: bigint
): Promise<void> {
  // Serialises concurrent payments for the same customer so the
  // running ledger balance cannot be read stale.
  await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customerId} FOR UPDATE`;
}

async function getCustomerBalance(
  tx: TransactionClient,
  businessId: bigint,
  customerId: bigint
): Promise<Decimal> {
  const latest = await tx.ledger_entries.findFirst({
    where: {
      business_id: businessId,
      customer_id: customerId,
    },
    orderBy: [
      { transaction_at: "desc" },
      { id: "desc" },
    ],
  });

  if (!latest) {
    return new Decimal(0);
  }

  return decimalFrom(latest.balance_after);
}

/**
 * Payments never mutate their own ledger effect; a reversal is a
 * compensating ADJUSTMENT entry keyed by payment_id. Its presence is
 * the durable marker that a payment has been reversed.
 */
async function getReversedPaymentIds(
  tx: TransactionClient,
  paymentIds: bigint[]
): Promise<Set<string>> {
  if (paymentIds.length === 0) {
    return new Set();
  }

  const rows = await tx.ledger_entries.findMany({
    where: {
      entry_type: "ADJUSTMENT",
      payment_id: { in: paymentIds },
    },
    select: {
      payment_id: true,
    },
  });

  return new Set(
    rows
      .map((row) => row.payment_id)
      .filter((id): id is bigint => id !== null)
      .map((id) => id.toString())
  );
}

async function lockBills(
  tx: TransactionClient,
  businessId: bigint,
  billIds: bigint[]
): Promise<void> {
  if (billIds.length === 0) return;

  // Locks every target bill in one round trip instead of one per bill.
  // ORDER BY id keeps lock acquisition in the same ascending order the
  // caller already processes allocations in (validated distinct per
  // bill_id — see createPaymentSchema), so this preserves the same
  // deadlock-avoidance property as locking them one at a time.
  await tx.$queryRaw`SELECT id FROM bills WHERE id = ANY(${billIds}) AND business_id = ${businessId} ORDER BY id FOR UPDATE`;
}

/**
 * Batched replacement for calling a per-bill outstanding-balance
 * lookup once per allocation — a payment split across N bills used to
 * cost ~3N sequential round trips (lock + fetch + reversed-payments
 * check, each done separately per bill). This does the same locking
 * and math but in 3 round trips total regardless of N.
 */
async function getBillOutstandingMap(
  tx: TransactionClient,
  businessId: bigint,
  billIds: bigint[]
) {
  const map = new Map<
    string,
    { bill: Prisma.billsGetPayload<{ include: { payment_allocations: true } }>; outstanding: Decimal }
  >();

  if (billIds.length === 0) {
    return map;
  }

  await lockBills(tx, businessId, billIds);

  const bills = await tx.bills.findMany({
    where: {
      id: { in: billIds },
      business_id: businessId,
    },
    include: {
      payment_allocations: true,
    },
  });

  const allPaymentIds = bills.flatMap((bill) =>
    bill.payment_allocations.map((allocation) => allocation.payment_id)
  );

  const reversedPaymentIds = await getReversedPaymentIds(
    tx,
    allPaymentIds
  );

  for (const bill of bills) {
    let allocatedTotal = new Decimal(0);

    for (const allocation of bill.payment_allocations) {
      if (!reversedPaymentIds.has(allocation.payment_id.toString())) {
        allocatedTotal = allocatedTotal.plus(
          decimalFrom(allocation.allocated_amount)
        );
      }
    }

    const outstanding = roundMoney(
      decimalFrom(bill.grand_total).minus(allocatedTotal)
    );

    map.set(bill.id.toString(), { bill, outstanding });
  }

  return map;
}

export async function createPayment(
  businessId: bigint,
  userId: bigint,
  data: CreatePaymentInput
) {
  return prisma.$transaction(
    async (tx) => {
      const customerId = BigInt(data.customer_id);

      const customer = await tx.customers.findFirst({
        where: {
          id: customerId,
          business_id: businessId,
        },
      });

      if (!customer) {
        throw new PaymentError("Customer not found", 404);
      }

      await lockCustomer(tx, customerId);

      const currentBalance = await getCustomerBalance(
        tx,
        businessId,
        customerId
      );

      const amount = roundMoney(decimalFrom(data.amount));

      if (amount.greaterThan(currentBalance)) {
        throw new PaymentError(
          `Payment amount (${amount.toString()}) cannot exceed customer outstanding balance (${currentBalance.toString()})`,
          409
        );
      }

      const allocationInputs = [...data.allocations].sort(
        (a, b) =>
          a.bill_id.localeCompare(b.bill_id, undefined, {
            numeric: true,
          })
      );

      let allocatedSum = new Decimal(0);

      for (const allocation of allocationInputs) {
        allocatedSum = allocatedSum.plus(
          decimalFrom(allocation.amount)
        );
      }

      allocatedSum = roundMoney(allocatedSum);

      if (allocatedSum.greaterThan(amount)) {
        throw new PaymentError(
          "Sum of allocations cannot exceed the payment amount"
        );
      }

      const paymentAt = data.payment_at
        ? new Date(data.payment_at)
        : new Date();

      const paymentNumber = await generatePaymentNumber(tx);

      const payment = await tx.payments.create({
        data: {
          business_id: businessId,
          payment_number: paymentNumber,
          customer_id: customerId,
          payment_at: paymentAt,
          amount,
          payment_method: data.payment_method,
          reference_number: data.reference_number ?? null,
          notes: data.notes ?? null,
          created_by: userId,
        },
      });

      const billOutstandingMap = await getBillOutstandingMap(
        tx,
        businessId,
        allocationInputs.map((allocation) => BigInt(allocation.bill_id))
      );

      for (const allocation of allocationInputs) {
        const billId = BigInt(allocation.bill_id);
        const allocationAmount = roundMoney(
          decimalFrom(allocation.amount)
        );

        const entry = billOutstandingMap.get(billId.toString());

        if (!entry) {
          throw new PaymentError("Bill not found", 404);
        }

        const { bill, outstanding } = entry;

        if (
          bill.customer_id === null ||
          bill.customer_id !== customerId
        ) {
          throw new PaymentError(
            `Bill ${bill.bill_number} does not belong to this customer`
          );
        }

        if (bill.status !== "COMPLETED") {
          throw new PaymentError(
            `Bill ${bill.bill_number} is not eligible for payment allocation (status: ${bill.status})`,
            409
          );
        }

        if (allocationAmount.greaterThan(outstanding)) {
          throw new PaymentError(
            `Allocation amount (${allocationAmount.toString()}) exceeds outstanding balance (${outstanding.toString()}) for bill ${bill.bill_number}`,
            409
          );
        }

        await tx.payment_allocations.create({
          data: {
            payment_id: payment.id,
            bill_id: billId,
            allocated_amount: allocationAmount,
          },
        });
      }

      const newBalance = roundMoney(
        currentBalance.minus(amount)
      );

      const description =
        allocationInputs.length > 0
          ? `Payment ${paymentNumber} allocated to ${allocationInputs.length} bill(s)`
          : `Payment ${paymentNumber} (unallocated)`;

      await tx.ledger_entries.create({
        data: {
          business_id: businessId,
          customer_id: customerId,
          entry_type: "PAYMENT",
          bill_id: null,
          payment_id: payment.id,
          transaction_at: paymentAt,
          debit: new Decimal(0),
          credit: amount,
          balance_after: newBalance,
          description,
        },
      });

      await tx.audit_logs.create({
        data: {
          business_id: businessId,
          user_id: userId,
          action: "CREATE",
          entity_type: "payment",
          entity_id: payment.id,
          new_data: toAuditJson(payment),
        },
      });

      return tx.payments.findFirst({
        where: { id: payment.id },
        include: paymentInclude,
      });
    },
    {
      maxWait: 10000,
      timeout: 20000,
    }
  );
}

export async function cancelPayment(
  businessId: bigint,
  userId: bigint,
  paymentId: bigint,
  reason?: string
) {
  return prisma.$transaction(
    async (tx) => {
      const payment = await tx.payments.findFirst({
        where: {
          id: paymentId,
          business_id: businessId,
        },
      });

      if (!payment) {
        throw new PaymentError("Payment not found", 404);
      }

      await lockCustomer(tx, payment.customer_id);

      const existingReversal = await tx.ledger_entries.findFirst({
        where: {
          business_id: businessId,
          payment_id: payment.id,
          entry_type: "ADJUSTMENT",
        },
      });

      if (existingReversal) {
        throw new PaymentError(
          "Payment has already been reversed",
          409
        );
      }

      const currentBalance = await getCustomerBalance(
        tx,
        businessId,
        payment.customer_id
      );

      const reversedAt = new Date();

      const newBalance = roundMoney(
        currentBalance.plus(decimalFrom(payment.amount))
      );

      const reversalEntry = await tx.ledger_entries.create({
        data: {
          business_id: businessId,
          customer_id: payment.customer_id,
          entry_type: "ADJUSTMENT",
          bill_id: null,
          payment_id: payment.id,
          transaction_at: reversedAt,
          debit: decimalFrom(payment.amount),
          credit: new Decimal(0),
          balance_after: newBalance,
          description: reason
            ? `Reversal of payment ${payment.payment_number} — Reason: ${reason}`
            : `Reversal of payment ${payment.payment_number}`,
        },
      });

      await tx.audit_logs.create({
        data: {
          business_id: businessId,
          user_id: userId,
          action: "CANCEL",
          entity_type: "payment",
          entity_id: payment.id,
          old_data: toAuditJson(payment),
          new_data: toAuditJson({
            ...reversalEntry,
            cancellation_reason: reason ?? null,
          }),
        },
      });

      return tx.payments.findFirst({
        where: { id: payment.id },
        include: paymentInclude,
      });
    },
    {
      maxWait: 10000,
      timeout: 20000,
    }
  );
}

export async function getPayments(
  businessId: bigint,
  query: ListPaymentsQuery
) {
  const where: Prisma.paymentsWhereInput = {
    business_id: businessId,
  };

  if (query.customer_id) {
    where.customer_id = BigInt(query.customer_id);
  }

  if (query.payment_method) {
    where.payment_method = query.payment_method;
  }

  if (query.start_date || query.end_date) {
    where.payment_at = {};

    if (query.start_date) {
      const startDateStr = query.start_date.includes("T")
        ? query.start_date
        : `${query.start_date}T00:00:00.000Z`;
      where.payment_at.gte = new Date(startDateStr);
    }

    if (query.end_date) {
      const endDateStr = query.end_date.includes("T")
        ? query.end_date
        : `${query.end_date}T23:59:59.999Z`;
      where.payment_at.lte = new Date(endDateStr);
    }
  }

  if (query.search) {
    const search = query.search;

    where.OR = [
      {
        payment_number: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        reference_number: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        customers: {
          customer_code: {
            contains: search,
            mode: "insensitive",
          },
        },
      },
      {
        customers: {
          english_name: {
            contains: search,
            mode: "insensitive",
          },
        },
      },
      {
        customers: {
          phone: {
            contains: search,
            mode: "insensitive",
          },
        },
      },
    ];
  }

  return prisma.payments.findMany({
    where,
    include: paymentInclude,
    orderBy: {
      payment_at: "desc",
    },
  });
}

export async function getPaymentById(
  businessId: bigint,
  paymentId: bigint
) {
  return prisma.payments.findFirst({
    where: {
      id: paymentId,
      business_id: businessId,
    },
    include: paymentInclude,
  });
}

export async function getPaymentByNumber(
  businessId: bigint,
  paymentNumber: string
) {
  return prisma.payments.findFirst({
    where: {
      payment_number: paymentNumber,
      business_id: businessId,
    },
    include: paymentInclude,
  });
}

export async function getCustomerPayments(
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
    return null;
  }

  return prisma.payments.findMany({
    where: {
      business_id: businessId,
      customer_id: customerId,
    },
    include: paymentInclude,
    orderBy: {
      payment_at: "desc",
    },
  });
}
