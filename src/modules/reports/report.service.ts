import { Decimal } from "@prisma/client/runtime/client";

import { prisma } from "../../config/database";
import { resolveDateRange } from "../../utils/dateRange";
import { getBills } from "../billing/billing.service";

import type {
  OutstandingQuery,
  RangeQuery,
} from "./report.validation";

function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function decimalFrom(
  value: number | string | Decimal | null
): Decimal {
  return new Decimal((value ?? 0).toString());
}

/**
 * Bill-by-bill data for the "Export XLSX" action on the Bills report —
 * reuses billing.service's own getBills query (same include, same
 * date-filter semantics) instead of re-querying bills here, so this
 * never drifts from what the Billing module itself considers a bill's
 * customer/date/status fields to be. Only COMPLETED bills are included,
 * matching every other report's convention (cancelled bills' stored
 * balances are frozen at creation time and don't reflect their later
 * reversal, so they'd be misleading in a balance export).
 */
export async function getBillsForExport(
  businessId: bigint,
  range: RangeQuery
) {
  const { start, end } = resolveDateRange(range);

  const bills = await getBills(businessId, {
    bill_status: "COMPLETED",
    start_date: start.toISOString(),
    end_date: end.toISOString(),
  });

  return { start, end, bills };
}

export async function getSalesReport(
  businessId: bigint,
  range: RangeQuery
) {
  const { start, end } = resolveDateRange(range);

  const aggregate = await prisma.bills.aggregate({
    where: {
      business_id: businessId,
      status: "COMPLETED",
      transaction_at: { gte: start, lte: end },
    },
    _count: { _all: true },
    _sum: {
      subtotal: true,
      discount: true,
      grand_total: true,
      amount_paid: true,
    },
  });

  const daily = await prisma.$queryRaw<
    {
      sale_date: Date;
      total_bills: bigint;
      total_sales: string;
      total_paid: string;
    }[]
  >`
    SELECT sale_date, total_bills, total_sales, total_paid
    FROM daily_sales_summary
    WHERE business_id = ${businessId}
      AND sale_date >= ${start}::date
      AND sale_date <= ${end}::date
    ORDER BY sale_date ASC
  `;

  return {
    range: { start: start.toISOString(), end: end.toISOString() },
    summary: {
      total_bills: aggregate._count._all,
      total_subtotal: roundMoney(
        decimalFrom(aggregate._sum.subtotal)
      ).toString(),
      total_discount: roundMoney(
        decimalFrom(aggregate._sum.discount)
      ).toString(),
      total_sales: roundMoney(
        decimalFrom(aggregate._sum.grand_total)
      ).toString(),
      total_paid: roundMoney(
        decimalFrom(aggregate._sum.amount_paid)
      ).toString(),
    },
    daily: daily.map((row) => ({
      date: row.sale_date,
      total_bills: Number(row.total_bills),
      total_sales: row.total_sales,
      total_paid: row.total_paid,
    })),
  };
}

export async function getPaymentsReport(
  businessId: bigint,
  range: RangeQuery
) {
  const { start, end } = resolveDateRange(range);

  const aggregate = await prisma.payments.aggregate({
    where: {
      business_id: businessId,
      payment_at: { gte: start, lte: end },
    },
    _count: { _all: true },
    _sum: { amount: true },
  });

  const byMethod = await prisma.payments.groupBy({
    by: ["payment_method"],
    where: {
      business_id: businessId,
      payment_at: { gte: start, lte: end },
    },
    _count: { _all: true },
    _sum: { amount: true },
  });

  const daily = await prisma.$queryRaw<
    {
      payment_date: Date;
      total_payments: bigint;
      total_amount: string;
    }[]
  >`
    SELECT payment_date, total_payments, total_amount
    FROM daily_payment_summary
    WHERE business_id = ${businessId}
      AND payment_date >= ${start}::date
      AND payment_date <= ${end}::date
    ORDER BY payment_date ASC
  `;

  return {
    range: { start: start.toISOString(), end: end.toISOString() },
    summary: {
      total_payments: aggregate._count._all,
      total_amount: roundMoney(
        decimalFrom(aggregate._sum.amount)
      ).toString(),
    },
    by_method: byMethod.map((row) => ({
      payment_method: row.payment_method,
      count: row._count._all,
      total_amount: roundMoney(
        decimalFrom(row._sum.amount)
      ).toString(),
    })),
    daily: daily.map((row) => ({
      date: row.payment_date,
      total_payments: Number(row.total_payments),
      total_amount: row.total_amount,
    })),
  };
}

export async function getCustomerOutstandingReport(
  businessId: bigint,
  query: OutstandingQuery
) {
  const onlyOutstanding = query.onlyOutstanding !== "false";
  const search = query.search ? `%${query.search}%` : null;

  return prisma.$queryRaw<
    {
      customer_id: bigint;
      customer_code: string;
      english_name: string;
      telugu_name: string | null;
      phone: string | null;
      outstanding_balance: string;
      last_transaction_at: Date | null;
    }[]
  >`
    SELECT
      cb.customer_id,
      cb.customer_code,
      cb.english_name,
      cb.telugu_name,
      cb.phone,
      cb.outstanding_balance,
      (
        SELECT MAX(le.transaction_at)
        FROM ledger_entries le
        WHERE le.customer_id = cb.customer_id
      ) AS last_transaction_at
    FROM customer_balances cb
    WHERE cb.business_id = ${businessId}
      AND (${onlyOutstanding}::boolean = false OR cb.outstanding_balance > 0)
      AND (
        ${search}::text IS NULL
        OR cb.english_name ILIKE ${search}
        OR cb.customer_code ILIKE ${search}
        OR cb.phone ILIKE ${search}
      )
    ORDER BY cb.outstanding_balance DESC
  `;
}

export async function getItemSalesReport(
  businessId: bigint,
  range: RangeQuery
) {
  const { start, end } = resolveDateRange(range);

  const rows = await prisma.$queryRaw<
    {
      item_id: bigint;
      item_name_snapshot: string;
      unit: string;
      bill_count: bigint;
      total_quantity: string;
      total_sales: string;
    }[]
  >`
    SELECT
      bi.item_id,
      bi.item_name_snapshot,
      bi.unit,
      COUNT(DISTINCT bi.bill_id) AS bill_count,
      COALESCE(SUM(bi.quantity), 0) AS total_quantity,
      COALESCE(SUM(bi.line_total), 0)::numeric(14,2) AS total_sales
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    WHERE b.business_id = ${businessId}
      AND b.status = 'COMPLETED'
      AND b.transaction_at >= ${start}
      AND b.transaction_at <= ${end}
    GROUP BY bi.item_id, bi.item_name_snapshot, bi.unit
    ORDER BY total_sales DESC
  `;

  return {
    range: { start: start.toISOString(), end: end.toISOString() },
    items: rows.map((row) => ({
      item_id: row.item_id.toString(),
      item_name: row.item_name_snapshot,
      unit: row.unit,
      bill_count: Number(row.bill_count),
      total_quantity: row.total_quantity,
      total_sales: row.total_sales,
    })),
  };
}

export async function getDashboard(
  businessId: bigint,
  range: RangeQuery = { range: "today" }
) {
  const { start, end } = resolveDateRange(range);

  const [
    todaySales,
    todayPayments,
    outstandingRows,
    customersCount,
    itemsCount,
    recentBills,
    recentPayments,
  ] = await Promise.all([
    prisma.bills.aggregate({
      where: {
        business_id: businessId,
        status: "COMPLETED",
        transaction_at: { gte: start, lte: end },
      },
      _count: { _all: true },
      _sum: { grand_total: true },
    }),
    prisma.payments.aggregate({
      where: {
        business_id: businessId,
        payment_at: { gte: start, lte: end },
      },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.$queryRaw<{ total: string }[]>`
      SELECT COALESCE(SUM(outstanding_balance), 0)::numeric(14,2) AS total
      FROM customer_balances
      WHERE business_id = ${businessId}
    `,
    prisma.customers.count({
      where: { business_id: businessId, is_active: true },
    }),
    prisma.items.count({
      where: { business_id: businessId, is_active: true },
    }),
    prisma.bills.findMany({
      where: { business_id: businessId },
      orderBy: { transaction_at: "desc" },
      take: 5,
    }),
    prisma.payments.findMany({
      where: { business_id: businessId },
      orderBy: { payment_at: "desc" },
      take: 5,
    }),
  ]);

  return {
    today: {
      bills_count: todaySales._count._all,
      sales_total: roundMoney(
        decimalFrom(todaySales._sum.grand_total)
      ).toString(),
      payments_count: todayPayments._count._all,
      payments_total: roundMoney(
        decimalFrom(todayPayments._sum.amount)
      ).toString(),
    },
    outstanding_total: outstandingRows[0]?.total ?? "0.00",
    customers_count: customersCount,
    items_count: itemsCount,
    recent_bills: recentBills,
    recent_payments: recentPayments,
  };
}
