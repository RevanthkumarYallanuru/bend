import type { NextFunction, Response } from "express";

import {
  createSupplierBulkPaymentSchema,
  supplierIdParamSchema,
} from "./supplierPayment.validation";
import {
  SupplierPaymentError,
  createSupplierBulkPayment,
  getSupplierPayments,
} from "./supplierPayment.service";

import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

function serializeBigInt<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

function handleSupplierPaymentError(
  error: unknown,
  res: Response,
  next: NextFunction
) {
  if (error instanceof SupplierPaymentError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });

    return;
  }

  next(error);
}

export async function createSupplierBulkPaymentController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;
    const userId = req.user!.userId;

    const { id } = supplierIdParamSchema.parse({ id: req.params.id });
    const data = createSupplierBulkPaymentSchema.parse(req.body);

    const payment = await createSupplierBulkPayment(
      businessId,
      userId,
      id,
      data
    );

    res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      data: serializeBigInt(payment),
    });
  } catch (error) {
    handleSupplierPaymentError(error, res, next);
  }
}

export async function listSupplierPaymentsController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = supplierIdParamSchema.parse({ id: req.params.id });

    const payments = await getSupplierPayments(businessId, id);

    if (payments === null) {
      res.status(404).json({
        success: false,
        message: "Supplier not found",
      });

      return;
    }

    res.json({
      success: true,
      count: payments.length,
      data: serializeBigInt(payments),
    });
  } catch (error) {
    next(error);
  }
}
