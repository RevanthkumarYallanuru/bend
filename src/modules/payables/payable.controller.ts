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
