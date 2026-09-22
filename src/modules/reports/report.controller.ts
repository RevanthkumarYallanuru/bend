import type {
  NextFunction,
  Response,
} from "express";

import {
  outstandingQuerySchema,
  rangeQuerySchema,
} from "./report.validation";

import {
  getCustomerOutstandingReport,
  getDashboard,
  getItemSalesReport,
  getPaymentsReport,
  getSalesReport,
} from "./report.service";

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

export async function getDashboardController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const range = rangeQuerySchema.parse(req.query);

    const dashboard = await getDashboard(businessId, range);

    res.json({ success: true, data: serializeBigInt(dashboard) });
  } catch (error) {
    next(error);
  }
}

export async function getSalesReportController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const range = rangeQuerySchema.parse(req.query);

    const report = await getSalesReport(businessId, range);

    res.json({ success: true, data: serializeBigInt(report) });
  } catch (error) {
    next(error);
  }
}

export async function exportSalesReportController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const range = rangeQuerySchema.parse(req.query);

    const report = await getSalesReport(businessId, range);

    await sendXlsx(
      res,
      `sales-report-${Date.now()}.xlsx`,
      "Sales",
      [
        { header: "Date", key: "date", width: 15 },
        { header: "Total Bills", key: "total_bills", width: 15 },
        { header: "Total Sales", key: "total_sales", width: 15 },
        { header: "Total Paid", key: "total_paid", width: 15 },
      ],
      report.daily
    );
  } catch (error) {
    next(error);
  }
}

export async function getPaymentsReportController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const range = rangeQuerySchema.parse(req.query);

    const report = await getPaymentsReport(businessId, range);

    res.json({ success: true, data: serializeBigInt(report) });
  } catch (error) {
    next(error);
  }
}

export async function exportPaymentsReportController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const range = rangeQuerySchema.parse(req.query);

    const report = await getPaymentsReport(businessId, range);

    await sendXlsx(
      res,
      `payments-report-${Date.now()}.xlsx`,
      "Payments",
      [
        { header: "Date", key: "date", width: 15 },
        { header: "Total Payments", key: "total_payments", width: 18 },
        { header: "Total Amount", key: "total_amount", width: 15 },
      ],
      report.daily
    );
  } catch (error) {
    next(error);
  }
}

export async function getOutstandingReportController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const query = outstandingQuerySchema.parse(req.query);

    const report = await getCustomerOutstandingReport(
      businessId,
      query
    );

    res.json({
      success: true,
      count: report.length,
      data: serializeBigInt(report),
    });
  } catch (error) {
    next(error);
  }
}

export async function exportOutstandingReportController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const query = outstandingQuerySchema.parse(req.query);

    const report = await getCustomerOutstandingReport(
      businessId,
      query
    );

    await sendXlsx(
      res,
      `outstanding-report-${Date.now()}.xlsx`,
      "Outstanding",
      [
        { header: "Customer Code", key: "customer_code", width: 18 },
        { header: "Name", key: "english_name", width: 25 },
        { header: "Phone", key: "phone", width: 15 },
        {
          header: "Outstanding Balance",
          key: "outstanding_balance",
          width: 18,
        },
      ],
      serializeBigInt(report)
    );
  } catch (error) {
    next(error);
  }
}

export async function getItemSalesReportController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const range = rangeQuerySchema.parse(req.query);

    const report = await getItemSalesReport(businessId, range);

    res.json({ success: true, data: serializeBigInt(report) });
  } catch (error) {
    next(error);
  }
}

export async function exportItemSalesReportController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const range = rangeQuerySchema.parse(req.query);

    const report = await getItemSalesReport(businessId, range);

    await sendXlsx(
      res,
      `item-sales-report-${Date.now()}.xlsx`,
      "Item Sales",
      [
        { header: "Item", key: "item_name", width: 25 },
        { header: "Unit", key: "unit", width: 10 },
        { header: "Bills", key: "bill_count", width: 10 },
        { header: "Quantity Sold", key: "total_quantity", width: 15 },
        { header: "Revenue", key: "total_sales", width: 15 },
      ],
      report.items
    );
  } catch (error) {
    next(error);
  }
}
