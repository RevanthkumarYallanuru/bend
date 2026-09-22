import type {
  NextFunction,
  Response,
} from "express";

import {
  ledgerCustomerParamSchema,
  ledgerQuerySchema,
  openingBalanceSchema,
} from "./ledger.validation";

import {
  LedgerError,
  getCustomerBalance,
  getCustomerLedger,
  getCustomerLedgerForExport,
  setCustomerOpeningBalance,
} from "./ledger.service";

import { sendXlsx } from "../../utils/xlsx";

import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

function serializeBigInt<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint"
        ? value.toString()
        : value
    )
  );
}

function handleLedgerError(
  error: unknown,
  res: Response,
  next: NextFunction
) {
  if (error instanceof LedgerError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });

    return;
  }

  next(error);
}

export async function getCustomerLedgerController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { customerId } = ledgerCustomerParamSchema.parse({
      customerId: req.params.customerId,
    });

    const query = ledgerQuerySchema.parse(req.query);

    const result = await getCustomerLedger(
      businessId,
      customerId,
      query
    );

    res.json({
      success: true,
      count: result.entries.length,
      total: result.total,
      page: result.page,
      limit: result.limit,
      data: serializeBigInt(result.entries),
    });
  } catch (error) {
    handleLedgerError(error, res, next);
  }
}

export async function exportCustomerLedgerController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { customerId } = ledgerCustomerParamSchema.parse({
      customerId: req.params.customerId,
    });

    const query = ledgerQuerySchema.parse(req.query);

    const entries = await getCustomerLedgerForExport(
      businessId,
      customerId,
      query
    );

    const rows = serializeBigInt(entries).map((entry: any) => ({
      date: entry.transaction_at,
      entry_type: entry.entry_type,
      description: entry.description ?? "",
      debit: entry.debit,
      credit: entry.credit,
      balance_after: entry.balance_after,
    }));

    await sendXlsx(
      res,
      `customer-${customerId}-ledger-${Date.now()}.xlsx`,
      "Ledger",
      [
        { header: "Date", key: "date", width: 22 },
        { header: "Type", key: "entry_type", width: 12 },
        { header: "Description", key: "description", width: 35 },
        { header: "Debit", key: "debit", width: 15 },
        { header: "Credit", key: "credit", width: 15 },
        { header: "Balance After", key: "balance_after", width: 15 },
      ],
      rows
    );
  } catch (error) {
    handleLedgerError(error, res, next);
  }
}

export async function getCustomerBalanceController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { customerId } = ledgerCustomerParamSchema.parse({
      customerId: req.params.customerId,
    });

    const result = await getCustomerBalance(
      businessId,
      customerId
    );

    res.json({
      success: true,
      data: serializeBigInt(result),
    });
  } catch (error) {
    handleLedgerError(error, res, next);
  }
}

export async function setCustomerOpeningBalanceController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { customerId } = ledgerCustomerParamSchema.parse({
      customerId: req.params.customerId,
    });

    const data = openingBalanceSchema.parse(req.body);

    const entry = await setCustomerOpeningBalance(
      businessId,
      customerId,
      data
    );

    res.status(201).json({
      success: true,
      message: "Opening balance recorded successfully",
      data: serializeBigInt(entry),
    });
  } catch (error) {
    handleLedgerError(error, res, next);
  }
}
