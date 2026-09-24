import type { NextFunction, Response } from "express";

import {
  createImportSchema,
  importIdSchema,
  listImportsQuerySchema,
} from "./import.validation";

import {
  ImportError,
  createImport,
  getImportById,
  getImports,
} from "./import.service";
import { PayableError } from "../payables/payable.service";

import { sendXlsx } from "../../utils/xlsx";

import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

function serializeBigInt<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

function handleImportError(
  error: unknown,
  res: Response,
  next: NextFunction
) {
  // createImport calls payable.service's createPayable internally (for
  // the auto-created linked payable) — its PayableError is handled
  // the same way as this module's own ImportError, defensively, even
  // though import.service.ts already validates the supplier itself
  // beforehand.
  if (error instanceof ImportError || error instanceof PayableError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  next(error);
}

export async function createImportController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;
    const userId = req.user!.userId;

    const data = createImportSchema.parse(req.body);

    const importRecord = await createImport(businessId, userId, data);

    res.status(201).json({
      success: true,
      message: "Import recorded successfully",
      data: serializeBigInt(importRecord),
    });
  } catch (error) {
    handleImportError(error, res, next);
  }
}

export async function listImportsController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const query = listImportsQuerySchema.parse(req.query);

    const imports = await getImports(businessId, query);

    res.json({
      success: true,
      count: imports.length,
      data: serializeBigInt(imports),
    });
  } catch (error) {
    next(error);
  }
}

export async function getImportController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = importIdSchema.parse({ id: req.params.id });

    const importRecord = await getImportById(businessId, id);

    if (!importRecord) {
      res.status(404).json({ success: false, message: "Import not found" });
      return;
    }

    res.json({ success: true, data: serializeBigInt(importRecord) });
  } catch (error) {
    next(error);
  }
}

export async function exportImportsController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const query = listImportsQuerySchema.parse(req.query);

    const imports = await getImports(businessId, query);

    const rows = imports.map((record, index) => ({
      sl_no: index + 1,
      date: record.import_date,
      supplier: record.suppliers?.name ?? "",
      item: record.items?.english_name ?? "",
      quantity: `${record.quantity} ${record.unit}`,
      amount: Number(record.amount),
      paid_amount: Number(record.paid_amount),
      pending: Number(record.amount) - Number(record.paid_amount),
      payment_status: record.payables?.status ?? "PAID",
    }));

    await sendXlsx(
      res,
      `imports-${Date.now()}.xlsx`,
      "Imports",
      [
        { header: "Sl.No.", key: "sl_no", width: 8 },
        { header: "Date", key: "date", width: 16, numFmt: "dd-mmm-yyyy" },
        { header: "Supplier", key: "supplier", width: 26 },
        { header: "Item", key: "item", width: 26 },
        { header: "Quantity", key: "quantity", width: 16 },
        { header: "Amount", key: "amount", width: 15, numFmt: "#,##0.00" },
        { header: "Paid Amount", key: "paid_amount", width: 15, numFmt: "#,##0.00" },
        { header: "Pending", key: "pending", width: 15, numFmt: "#,##0.00" },
        { header: "Payment Status", key: "payment_status", width: 16 },
      ],
      rows
    );
  } catch (error) {
    next(error);
  }
}
