import { Decimal } from "@prisma/client/runtime/client";

import { prisma } from "../../config/database";
import type { Prisma } from "../../../generated/prisma/client";

export class InventoryError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "InventoryError";
    this.statusCode = statusCode;
  }
}

type TransactionClient = Prisma.TransactionClient;
type DbClient = TransactionClient | typeof prisma;

function decimalFrom(value: number | string | Decimal | null): Decimal {
  return new Decimal((value ?? 0).toString());
}

function roundQty(value: Decimal): Decimal {
  return value.toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}

/**
 * The inventory mirror of billing.service.ts's getCustomerPreviousBalance
 * — latest running balance for an item, or 0 if it's never had a
 * movement. Reused by both Imports (stock in) and Billing (stock out /
 * cancellation reversal) so the running balance is always read fresh
 * inside the same transaction that's about to append to it.
 */
export async function getItemStockBalance(
  client: DbClient,
  businessId: bigint,
  itemId: bigint
): Promise<Decimal> {
  const latest = await client.stock_movements.findFirst({
    where: { business_id: businessId, item_id: itemId },
    orderBy: [{ transaction_at: "desc" }, { id: "desc" }],
  });

  if (!latest) {
    return new Decimal(0);
  }

  return decimalFrom(latest.balance_after);
}

/**
 * One row per stock-affecting event — never mutates a prior row, always
 * appends (same discipline as ledger_entries). Callers pass whichever
 * of quantityIn/quantityOut applies; the other defaults to 0.
 */
export async function recordStockMovement(
  client: DbClient,
  params: {
    businessId: bigint;
    itemId: bigint;
    movementType: "IMPORT" | "SALE" | "ADJUSTMENT";
    quantityIn?: Decimal | number | string;
    quantityOut?: Decimal | number | string;
    billId?: bigint;
    importId?: bigint;
    transactionAt: Date;
    description?: string;
    userId: bigint;
  }
) {
  const previousBalance = await getItemStockBalance(
    client,
    params.businessId,
    params.itemId
  );

  const quantityIn = roundQty(decimalFrom(params.quantityIn ?? 0));
  const quantityOut = roundQty(decimalFrom(params.quantityOut ?? 0));
  const balanceAfter = roundQty(
    previousBalance.plus(quantityIn).minus(quantityOut)
  );

  return client.stock_movements.create({
    data: {
      business_id: params.businessId,
      item_id: params.itemId,
      movement_type: params.movementType,
      bill_id: params.billId ?? null,
      import_id: params.importId ?? null,
      transaction_at: params.transactionAt,
      quantity_in: quantityIn,
      quantity_out: quantityOut,
      balance_after: balanceAfter,
      description: params.description ?? null,
      created_by: params.userId,
    },
  });
}

/**
 * One row per item: last import date/qty, total imported, total sold
 * (net of cancellation reversals — a cancelled bill is no longer
 * "completed"), and remaining stock. total_imported - total_sold always
 * equals remaining_stock by construction (see schema.prisma's
 * stock_movements doc comment).
 */
export async function getStockTally(businessId: bigint) {
  const rows = await prisma.$queryRaw<
    {
      item_id: bigint;
      english_name: string;
      telugu_name: string | null;
      last_import_date: Date | null;
      last_import_qty: string | null;
      total_imported: string;
      total_sold: string;
      remaining_stock: string;
    }[]
  >`
    SELECT
      i.id AS item_id,
      i.english_name,
      i.telugu_name,
      li.import_date AS last_import_date,
      li.quantity AS last_import_qty,
      COALESCE(sm.total_imported, 0)::numeric(14,3) AS total_imported,
      COALESCE(sm.total_sold, 0)::numeric(14,3) AS total_sold,
      COALESCE(sm.remaining_stock, 0)::numeric(14,3) AS remaining_stock
    FROM items i
    LEFT JOIN LATERAL (
      SELECT import_date, quantity
      FROM imports
      WHERE imports.item_id = i.id AND imports.business_id = i.business_id
      ORDER BY import_date DESC, id DESC
      LIMIT 1
    ) li ON true
    LEFT JOIN (
      SELECT
        item_id,
        SUM(quantity_in) FILTER (WHERE movement_type = 'IMPORT') AS total_imported,
        SUM(quantity_out) FILTER (WHERE movement_type = 'SALE')
          - COALESCE(SUM(quantity_in) FILTER (WHERE movement_type = 'ADJUSTMENT'), 0) AS total_sold,
        SUM(quantity_in) - SUM(quantity_out) AS remaining_stock
      FROM stock_movements
      WHERE business_id = ${businessId}
      GROUP BY item_id
    ) sm ON sm.item_id = i.id
    WHERE i.business_id = ${businessId} AND i.is_active = true
    ORDER BY i.english_name ASC
  `;

  return rows.map((row) => ({
    item_id: row.item_id.toString(),
    english_name: row.english_name,
    telugu_name: row.telugu_name,
    last_import_date: row.last_import_date
      ? row.last_import_date.toISOString()
      : null,
    last_import_qty: row.last_import_qty,
    total_imported: row.total_imported,
    total_sold: row.total_sold,
    remaining_stock: row.remaining_stock,
  }));
}

async function ensureItem(businessId: bigint, itemId: bigint) {
  const item = await prisma.items.findFirst({
    where: { id: itemId, business_id: businessId },
  });

  if (!item) {
    throw new InventoryError("Item not found", 404);
  }

  return item;
}

/**
 * Full chronological movement history for one item — the audit trail
 * behind its Stock Tally numbers. Mirrors
 * ledger.service.ts's getCustomerLedgerForExport (simple, unpaginated;
 * per-item volume is low enough not to need paging).
 */
export async function getItemStockMovements(
  businessId: bigint,
  itemId: bigint
) {
  await ensureItem(businessId, itemId);

  return prisma.stock_movements.findMany({
    where: { business_id: businessId, item_id: itemId },
    include: {
      bills: { select: { bill_number: true } },
      imports: { select: { id: true } },
    },
    // Newest first; each row carries its own stored balance_after.
    orderBy: [{ transaction_at: "desc" }, { id: "desc" }],
  });
}
