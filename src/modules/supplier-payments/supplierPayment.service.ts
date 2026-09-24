import { Decimal } from "@prisma/client/runtime/client";

import { prisma } from "../../config/database";
import { applyPayableAllocation } from "../payables/payable.service";
import type { Prisma } from "../../../generated/prisma/client";

import type { CreateSupplierBulkPaymentInput } from "./supplierPayment.validation";

/**
 * Supplier bulk payments — a single amount automatically allocated
 * across a supplier's oldest unpaid/partially-paid payables first
 * (FIFO). Deliberately independent of the customer payments/ledger
 * system, mirroring how payable.service.ts's "My Pays" already stays
 * independent of it: no relation to customers, bills, or ledger_entries
 * anywhere in this file.
 */
export class SupplierPaymentError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "SupplierPaymentError";
    this.statusCode = statusCode;
  }
}

type TransactionClient = Prisma.TransactionClient;

function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function decimalFrom(value: number | string | Decimal): Decimal {
  return new Decimal(value.toString());
}

const supplierPaymentInclude = {
  suppliers: true,
  payable_payments: {
    include: { payables: true },
    orderBy: { id: "asc" as const },
  },
};

/**
 * Locks every open (non-PAID) payable for this supplier — same
 * lock-then-refetch shape as payment.service.ts's getBillOutstandingMap
 * (lock first via a raw FOR UPDATE, then re-fetch through the normal
 * client so the read reflects whatever just got committed by whichever
 * concurrent transaction was blocking it) — so two concurrent bulk
 * payments to the same supplier can never double-allocate.
 */
async function lockOpenPayables(
  tx: TransactionClient,
  businessId: bigint,
  supplierId: bigint
) {
  await tx.$queryRaw`
    SELECT id FROM payables
    WHERE business_id = ${businessId}
      AND supplier_id = ${supplierId}
      AND status != 'PAID'
    ORDER BY payable_date ASC, id ASC
    FOR UPDATE
  `;

  return tx.payables.findMany({
    where: {
      business_id: businessId,
      supplier_id: supplierId,
      status: { not: "PAID" },
    },
    orderBy: [{ payable_date: "asc" }, { id: "asc" }],
  });
}

export async function createSupplierBulkPayment(
  businessId: bigint,
  userId: bigint,
  supplierId: bigint,
  data: CreateSupplierBulkPaymentInput
) {
  return prisma.$transaction(
    async (tx) => {
      const supplier = await tx.suppliers.findFirst({
        where: { id: supplierId, business_id: businessId },
      });

      if (!supplier) {
        throw new SupplierPaymentError("Supplier not found", 404);
      }

      const openPayables = await lockOpenPayables(tx, businessId, supplierId);

      const balance = roundMoney(
        openPayables.reduce(
          (sum, payable) =>
            sum.plus(
              decimalFrom(payable.total_amount).minus(
                decimalFrom(payable.amount_paid)
              )
            ),
          new Decimal(0)
        )
      );

      if (balance.lessThanOrEqualTo(0)) {
        throw new SupplierPaymentError(
          "Supplier has no outstanding balance to pay",
          409
        );
      }

      const amount = roundMoney(decimalFrom(data.amount));

      if (amount.greaterThan(balance)) {
        throw new SupplierPaymentError(
          `Payment amount (${amount.toString()}) cannot exceed supplier outstanding balance (${balance.toString()})`,
          409
        );
      }

      const paymentDate = data.payment_date
        ? new Date(data.payment_date)
        : new Date();

      const supplierPayment = await tx.supplier_payments.create({
        data: {
          business_id: businessId,
          supplier_id: supplierId,
          amount,
          payment_date: paymentDate,
          reason: "Bulk pay to supplier",
          created_by: userId,
        },
      });

      let amountLeft = amount;

      for (const payable of openPayables) {
        if (amountLeft.lessThanOrEqualTo(0)) break;

        const remaining = roundMoney(
          decimalFrom(payable.total_amount).minus(
            decimalFrom(payable.amount_paid)
          )
        );

        if (remaining.lessThanOrEqualTo(0)) continue;

        const toApply = Decimal.min(remaining, amountLeft);

        await applyPayableAllocation(tx, payable, toApply, paymentDate, userId, {
          supplierPaymentId: supplierPayment.id,
        });

        amountLeft = roundMoney(amountLeft.minus(toApply));
      }

      return tx.supplier_payments.findFirst({
        where: { id: supplierPayment.id },
        include: supplierPaymentInclude,
      });
    },
    {
      maxWait: 10000,
      timeout: 20000,
    }
  );
}

export async function getSupplierPayments(
  businessId: bigint,
  supplierId: bigint
) {
  const supplier = await prisma.suppliers.findFirst({
    where: { id: supplierId, business_id: businessId },
  });

  if (!supplier) {
    return null;
  }

  return prisma.supplier_payments.findMany({
    where: { business_id: businessId, supplier_id: supplierId },
    include: supplierPaymentInclude,
    orderBy: { payment_date: "desc" },
  });
}
