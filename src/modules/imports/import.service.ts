import { Decimal } from "@prisma/client/runtime/client";

import { prisma } from "../../config/database";
import { rangeToBounds } from "../../utils/dateRange";
import { createPayable } from "../payables/payable.service";
import { recordStockMovement } from "../inventory/inventory.service";
import type { Prisma } from "../../../generated/prisma/client";

import type { CreateImportInput, ListImportsQuery } from "./import.validation";

/**
 * Lightweight purchase-record feature — no stock-on-hand tracking.
 * Every import that leaves a pending balance auto-creates (atomically,
 * in the same transaction) an ordinary payable for that supplier via
 * payable.service.ts's createPayable — no separate payment/balance
 * logic lives here.
 */
export class ImportError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ImportError";
    this.statusCode = statusCode;
  }
}

function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function decimalFrom(value: number | string | Decimal): Decimal {
  return new Decimal(value.toString());
}

const importInclude = {
  suppliers: true,
  items: true,
  payables: {
    include: {
      payable_payments: true,
    },
  },
};

export async function createImport(
  businessId: bigint,
  userId: bigint,
  data: CreateImportInput
) {
  return prisma.$transaction(
    async (tx) => {
      const supplierId = BigInt(data.supplier_id);
      const itemId = BigInt(data.item_id);

      const supplier = await tx.suppliers.findFirst({
        where: { id: supplierId, business_id: businessId },
      });

      if (!supplier) {
        throw new ImportError("Supplier not found", 404);
      }

      const item = await tx.items.findFirst({
        where: { id: itemId, business_id: businessId, is_active: true },
      });

      if (!item) {
        throw new ImportError("Item not found", 404);
      }

      const amount = roundMoney(decimalFrom(data.amount));
      const paidAmount = roundMoney(decimalFrom(data.paid_amount));
      const pending = roundMoney(amount.minus(paidAmount));

      const importDate = data.import_date
        ? new Date(`${data.import_date}T00:00:00.000Z`)
        : new Date();

      const importRecord = await tx.imports.create({
        data: {
          business_id: businessId,
          supplier_id: supplierId,
          item_id: itemId,
          quantity: decimalFrom(data.quantity),
          unit: data.unit,
          amount,
          paid_amount: paidAmount,
          import_date: importDate,
          notes: data.notes ?? null,
          created_by: userId,
        },
      });

      // Stock in — the entire imported quantity, regardless of how much
      // of it has been paid for.
      await recordStockMovement(tx, {
        businessId,
        itemId,
        movementType: "IMPORT",
        quantityIn: data.quantity,
        importId: importRecord.id,
        transactionAt: importDate,
        description: `Import from ${supplier.name}`,
        userId,
      });

      // Only the pending remainder becomes a payable — the paid
      // portion was settled outside the payables system (cash at
      // purchase), so it's never double-counted as an "outstanding"
      // amount. See imports.paid_amount's doc comment in schema.prisma.
      if (pending.greaterThan(0)) {
        await createPayable(
          businessId,
          userId,
          {
            supplier_id: data.supplier_id,
            total_amount: pending.toNumber(),
            reason: `Import - ${item.english_name} - ${data.quantity} ${data.unit}`,
            payable_date: data.import_date,
          },
          { importId: importRecord.id, client: tx }
        );
      }

      return tx.imports.findFirst({
        where: { id: importRecord.id },
        include: importInclude,
      });
    },
    {
      maxWait: 10000,
      timeout: 20000,
    }
  );
}

export async function getImports(
  businessId: bigint,
  query: ListImportsQuery
) {
  const where: Prisma.importsWhereInput = { business_id: businessId };

  if (query.supplier_id) {
    where.supplier_id = BigInt(query.supplier_id);
  }

  const dateBounds = rangeToBounds(query);

  if (dateBounds) {
    where.import_date = dateBounds;
  }

  return prisma.imports.findMany({
    where,
    include: importInclude,
    orderBy: [{ import_date: "desc" }, { id: "desc" }],
  });
}

export async function getImportById(businessId: bigint, importId: bigint) {
  return prisma.imports.findFirst({
    where: { id: importId, business_id: businessId },
    include: importInclude,
  });
}
