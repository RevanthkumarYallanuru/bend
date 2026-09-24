import type { NextFunction, Response } from "express";

import { itemIdParamSchema } from "./inventory.validation";
import {
  InventoryError,
  getItemStockMovements,
  getStockTally,
} from "./inventory.service";

import { sendXlsx } from "../../utils/xlsx";

import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

function serializeBigInt<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

export async function getStockTallyController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const tally = await getStockTally(businessId);

    res.json({
      success: true,
      count: tally.length,
      data: tally,
    });
  } catch (error) {
    next(error);
  }
}

export async function exportStockTallyController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const tally = await getStockTally(req.user!.businessId);

    const rows = tally.map((row, index) => ({
      sl_no: index + 1,
      item: row.english_name,
      last_import_date: row.last_import_date ?? "",
      last_import_qty: row.last_import_qty === null ? "" : Number(row.last_import_qty),
      total_imported: Number(row.total_imported),
      total_sold: Number(row.total_sold),
      remaining_stock: Number(row.remaining_stock),
    }));

    await sendXlsx(
      res,
      `stock-tally-${Date.now()}.xlsx`,
      "Stock Tally",
      [
        { header: "Sl.No.", key: "sl_no", width: 8 },
        { header: "Item", key: "item", width: 28 },
        { header: "Last Import Date", key: "last_import_date", width: 18, numFmt: "dd-mmm-yyyy" },
        { header: "Last Import Qty", key: "last_import_qty", width: 16 },
        { header: "Total Imported", key: "total_imported", width: 16 },
        { header: "Total Sold", key: "total_sold", width: 14 },
        { header: "Remaining Stock", key: "remaining_stock", width: 16 },
      ],
      rows
    );
  } catch (error) {
    next(error);
  }
}

export async function getItemStockMovementsController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = itemIdParamSchema.parse({ id: req.params.id });

    const movements = await getItemStockMovements(businessId, id);

    res.json({
      success: true,
      count: movements.length,
      data: serializeBigInt(movements),
    });
  } catch (error) {
    if (error instanceof InventoryError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }
    next(error);
  }
}
