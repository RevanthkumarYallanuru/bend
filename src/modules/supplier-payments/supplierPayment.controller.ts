import type { NextFunction, Response } from "express";

import {
  createSupplierBulkPaymentSchema,
  listSupplierPaymentsQuerySchema,
  supplierIdParamSchema,
} from "./supplierPayment.validation";
import {
  SupplierPaymentError,
  createSupplierBulkPayment,
  getSupplierPayments,
} from "./supplierPayment.service";

import { sendXlsx } from "../../utils/xlsx";

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

    const query = listSupplierPaymentsQuerySchema.parse(req.query);

    const payments = await getSupplierPayments(businessId, id, query);

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

export async function exportSupplierPaymentsController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = supplierIdParamSchema.parse({ id: req.params.id });

    const query = listSupplierPaymentsQuerySchema.parse(req.query);

    const payments = await getSupplierPayments(businessId, id, query);

    if (payments === null) {
      res.status(404).json({
        success: false,
        message: "Supplier not found",
      });

      return;
    }

    const rows = payments.map((payment, index) => ({
      sl_no: index + 1,
      date: payment.payment_date,
      supplier: payment.suppliers?.name ?? "",
      reason: payment.reason,
      applied_to: payment.payable_payments.length,
      amount: Number(payment.amount),
    }));

    await sendXlsx(
      res,
      `supplier-${id}-payments-${Date.now()}.xlsx`,
      "Supplier Payments",
      [
        { header: "Sl.No.", key: "sl_no", width: 8 },
        { header: "Date", key: "date", width: 16, numFmt: "dd-mmm-yyyy" },
        { header: "Supplier", key: "supplier", width: 26 },
        { header: "For What", key: "reason", width: 24 },
        { header: "Applied To (payables)", key: "applied_to", width: 20 },
        { header: "Amount Paid", key: "amount", width: 15, numFmt: "#,##0.00" },
      ],
      rows
    );
  } catch (error) {
    next(error);
  }
}
