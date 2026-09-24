import type {
  NextFunction,
  Response,
} from "express";

import {
  createPayableSchema,
  listPayablesQuerySchema,
  payableIdSchema,
  payablesInsightsQuerySchema,
  recordPayablePaymentSchema,
} from "./payable.validation";

import {
  PayableError,
  createPayable,
  getPayableById,
  getPayables,
  getPayablesInsights,
  recordPayablePayment,
} from "./payable.service";

import { sendXlsx } from "../../utils/xlsx";

import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

function serializeBigInt<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

function handlePayableError(
  error: unknown,
  res: Response,
  next: NextFunction
) {
  if (error instanceof PayableError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });

    return;
  }

  next(error);
}

export async function createPayableController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;
    const userId = req.user!.userId;

    const data = createPayableSchema.parse(req.body);

    const payable = await createPayable(businessId, userId, data);

    res.status(201).json({
      success: true,
      message: "Payable created successfully",
      data: serializeBigInt(payable),
    });
  } catch (error) {
    handlePayableError(error, res, next);
  }
}

export async function listPayablesController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const query = listPayablesQuerySchema.parse(req.query);

    const payables = await getPayables(businessId, query);

    res.json({
      success: true,
      count: payables.length,
      data: serializeBigInt(payables),
    });
  } catch (error) {
    next(error);
  }
}

export async function exportPayablesController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const query = listPayablesQuerySchema.parse(req.query);

    const payables = await getPayables(businessId, query);

    const rows = payables.map((payable, index) => ({
      sl_no: index + 1,
      supplier: payable.suppliers?.name ?? "",
      payable_date: payable.payable_date,
      reason: payable.reason,
      total_amount: Number(payable.total_amount),
      amount_paid: Number(payable.amount_paid),
      remaining: Number(payable.total_amount) - Number(payable.amount_paid),
      status: payable.status,
      paid_at: payable.paid_at ?? "",
    }));

    await sendXlsx(
      res,
      `my-pays-${Date.now()}.xlsx`,
      "My Pays",
      [
        { header: "Sl.No.", key: "sl_no", width: 8 },
        { header: "To Whom", key: "supplier", width: 28 },
        { header: "Payable Date", key: "payable_date", width: 16, numFmt: "dd-mmm-yyyy" },
        { header: "For What", key: "reason", width: 34 },
        { header: "Amount To Pay", key: "total_amount", width: 16, numFmt: "#,##0.00" },
        { header: "Total Paid", key: "amount_paid", width: 16, numFmt: "#,##0.00" },
        { header: "Remaining", key: "remaining", width: 16, numFmt: "#,##0.00" },
        { header: "Status", key: "status", width: 16 },
        { header: "Paid Date", key: "paid_at", width: 16, numFmt: "dd-mmm-yyyy" },
      ],
      rows
    );
  } catch (error) {
    next(error);
  }
}

export async function getPayablesInsightsController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const range = payablesInsightsQuerySchema.parse(req.query);

    const insights = await getPayablesInsights(businessId, range);

    res.json({
      success: true,
      data: serializeBigInt(insights),
    });
  } catch (error) {
    next(error);
  }
}

export async function getPayableController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = payableIdSchema.parse({ id: req.params.id });

    const payable = await getPayableById(businessId, id);

    if (!payable) {
      res.status(404).json({
        success: false,
        message: "Payable not found",
      });

      return;
    }

    res.json({
      success: true,
      data: serializeBigInt(payable),
    });
  } catch (error) {
    next(error);
  }
}

export async function recordPayablePaymentController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;
    const userId = req.user!.userId;

    const { id } = payableIdSchema.parse({ id: req.params.id });

    const data = recordPayablePaymentSchema.parse(req.body);

    const payable = await recordPayablePayment(
      businessId,
      userId,
      id,
      data
    );

    res.json({
      success: true,
      message: "Payment recorded successfully",
      data: serializeBigInt(payable),
    });
  } catch (error) {
    handlePayableError(error, res, next);
  }
}
