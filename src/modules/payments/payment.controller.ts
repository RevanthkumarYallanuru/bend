import type {
  NextFunction,
  Response,
} from "express";

import {
  cancelPaymentSchema,
  createPaymentSchema,
  customerIdParamSchema,
  listPaymentsQuerySchema,
  paymentIdSchema,
  paymentNumberParamSchema,
} from "./payment.validation";

import {
  PaymentError,
  cancelPayment,
  createPayment,
  getCustomerPayments,
  getPaymentById,
  getPaymentByNumber,
  getPayments,
} from "./payment.service";

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

function handlePaymentError(
  error: unknown,
  res: Response,
  next: NextFunction
) {
  if (error instanceof PaymentError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });

    return;
  }

  next(error);
}

export async function createPaymentController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;
    const userId = req.user!.userId;

    const data = createPaymentSchema.parse(req.body);

    const payment = await createPayment(
      businessId,
      userId,
      data
    );

    res.status(201).json({
      success: true,
      message: "Payment created successfully",
      data: serializeBigInt(payment),
    });
  } catch (error) {
    handlePaymentError(error, res, next);
  }
}

export async function listPaymentsController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const query = listPaymentsQuerySchema.parse(req.query);

    const payments = await getPayments(businessId, query);

    res.json({
      success: true,
      count: payments.length,
      data: serializeBigInt(payments),
    });
  } catch (error) {
    next(error);
  }
}

export async function getPaymentController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = paymentIdSchema.parse({
      id: req.params.id,
    });

    const payment = await getPaymentById(businessId, id);

    if (!payment) {
      res.status(404).json({
        success: false,
        message: "Payment not found",
      });

      return;
    }

    res.json({
      success: true,
      data: serializeBigInt(payment),
    });
  } catch (error) {
    next(error);
  }
}

export async function getPaymentByNumberController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { paymentNumber } = paymentNumberParamSchema.parse({
      paymentNumber: req.params.paymentNumber,
    });

    const payment = await getPaymentByNumber(
      businessId,
      paymentNumber
    );

    if (!payment) {
      res.status(404).json({
        success: false,
        message: "Payment not found",
      });

      return;
    }

    res.json({
      success: true,
      data: serializeBigInt(payment),
    });
  } catch (error) {
    next(error);
  }
}

export async function exportPaymentsController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const query = listPaymentsQuerySchema.parse(req.query);

    const payments = await getPayments(businessId, query);

    const rows = payments.map((payment, index) => ({
      sl_no: index + 1,
      payment_number: payment.payment_number,
      date: payment.payment_at,
      customer: payment.customers?.english_name ?? "",
      amount: Number(payment.amount),
      method: payment.payment_method,
      reference: payment.reference_number ?? "",
      notes: payment.notes ?? "",
      status: payment.ledger_entries.some(
        (entry) => entry.entry_type === "ADJUSTMENT"
      )
        ? "Reversed"
        : "Active",
    }));

    await sendXlsx(
      res,
      `payments-${Date.now()}.xlsx`,
      "Payments",
      [
        { header: "Sl.No.", key: "sl_no", width: 8 },
        { header: "Payment No.", key: "payment_number", width: 16 },
        { header: "Date & Time", key: "date", width: 22, numFmt: "dd-mmm-yyyy hh:mm" },
        { header: "Customer", key: "customer", width: 28 },
        { header: "Amount", key: "amount", width: 15, numFmt: "#,##0.00" },
        { header: "Method", key: "method", width: 14 },
        { header: "Reference", key: "reference", width: 20 },
        { header: "Notes", key: "notes", width: 30 },
        { header: "Status", key: "status", width: 12 },
      ],
      rows
    );
  } catch (error) {
    next(error);
  }
}

export async function cancelPaymentController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;
    const userId = req.user!.userId;

    const { id } = paymentIdSchema.parse({
      id: req.params.id,
    });

    const { reason } = cancelPaymentSchema.parse(
      req.body ?? {}
    );

    const payment = await cancelPayment(
      businessId,
      userId,
      id,
      reason
    );

    res.json({
      success: true,
      message: "Payment reversed successfully",
      data: serializeBigInt(payment),
    });
  } catch (error) {
    handlePaymentError(error, res, next);
  }
}

/**
 * GET /api/customers/:id/payments
 *
 * Mounted from the customers router; kept here because it shares
 * the payment service and serialization logic.
 */
export async function getCustomerPaymentsController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = customerIdParamSchema.parse({
      id: req.params.id,
    });

    const payments = await getCustomerPayments(businessId, id);

    if (payments === null) {
      res.status(404).json({
        success: false,
        message: "Customer not found",
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
