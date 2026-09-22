import type {
  NextFunction,
  Response,
} from "express";

import {
  billIdSchema,
  billNumberParamSchema,
  cancelBillSchema,
  createBillSchema,
  listBillsQuerySchema,
} from "./billing.validation";

import {
  BillingError,
  cancelBill,
  createBill,
  getBillById,
  getBillByNumber,
  getBills,
} from "./billing.service";

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

function handleBillingError(
  error: unknown,
  res: Response,
  next: NextFunction
) {
  if (error instanceof BillingError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });

    return;
  }

  next(error);
}

export async function createBillController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;
    const userId = req.user!.userId;

    const data = createBillSchema.parse(req.body);

    const bill = await createBill(
      businessId,
      userId,
      data
    );

    res.status(201).json({
      success: true,
      message: "Bill created successfully",
      data: serializeBigInt(bill),
    });
  } catch (error) {
    handleBillingError(error, res, next);
  }
}

export async function listBillsController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const query = listBillsQuerySchema.parse(req.query);

    const bills = await getBills(businessId, query);

    res.json({
      success: true,
      count: bills.length,
      data: serializeBigInt(bills),
    });
  } catch (error) {
    next(error);
  }
}

export async function getBillController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = billIdSchema.parse({
      id: req.params.id,
    });

    const bill = await getBillById(businessId, id);

    if (!bill) {
      res.status(404).json({
        success: false,
        message: "Bill not found",
      });

      return;
    }

    res.json({
      success: true,
      data: serializeBigInt(bill),
    });
  } catch (error) {
    next(error);
  }
}

export async function getBillByNumberController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { billNumber } = billNumberParamSchema.parse({
      billNumber: req.params.billNumber,
    });

    const bill = await getBillByNumber(
      businessId,
      billNumber
    );

    if (!bill) {
      res.status(404).json({
        success: false,
        message: "Bill not found",
      });

      return;
    }

    res.json({
      success: true,
      data: serializeBigInt(bill),
    });
  } catch (error) {
    next(error);
  }
}

export async function cancelBillController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;
    const userId = req.user!.userId;

    const { id } = billIdSchema.parse({
      id: req.params.id,
    });

    const { reason } = cancelBillSchema.parse(
      req.body ?? {}
    );

    const bill = await cancelBill(
      businessId,
      userId,
      id,
      reason
    );

    res.json({
      success: true,
      message: "Bill cancelled successfully",
      data: serializeBigInt(bill),
    });
  } catch (error) {
    handleBillingError(error, res, next);
  }
}
