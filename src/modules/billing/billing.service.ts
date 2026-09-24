import { Decimal } from "@prisma/client/runtime/client";

import { prisma } from "../../config/database";
import { rangeToBounds } from "../../utils/dateRange";
import { recordStockMovement } from "../inventory/inventory.service";
import type { Prisma } from "../../../generated/prisma/client";

import type {
  CreateBillInput,
  ListBillsQuery,
} from "./billing.validation";

export class BillingError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "BillingError";
    this.statusCode = statusCode;
  }
}

type TransactionClient = Prisma.TransactionClient;

const billInclude = {
  bill_items: {
    orderBy: {
      id: "asc" as const,
    },
    include: {
      // item_name_snapshot is always English (captured at bill time
      // for historical accuracy); the live item's telugu_name is
      // joined in separately so the print/PDF language toggle can
      // show it, the same way bill.customers is joined in for the
      // customer's live telugu_name.
      items: {
        select: { telugu_name: true },
      },
      bill_item_weights: {
        orderBy: { sequence: "asc" as const },
      },
    },
  },
  customers: true,
  payment_allocations: {
    include: {
      payments: true,
    },
  },
};

function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function decimalFrom(
  value: number | string | Decimal
): Decimal {
  return new Decimal(value.toString());
}

function lineTotal(
  quantity: Decimal,
  actualRate: Decimal,
  discount: Decimal
): Decimal {
  const gross = quantity.mul(actualRate);
  const total = gross.minus(discount);

  if (total.lessThan(0)) {
    throw new BillingError(
      "Item line total cannot be negative"
    );
  }

  return roundMoney(total);
}

function toAuditJson(data: unknown) {
  return JSON.parse(
    JSON.stringify(data, (_key, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }

      if (Decimal.isDecimal(value)) {
        return value.toString();
      }

      return value;
    })
  );
}

async function generateBillNumber(
  tx: TransactionClient
): Promise<string> {
  const rows = await tx.$queryRaw<
    { generate_bill_number: string }[]
  >`SELECT generate_bill_number() AS generate_bill_number`;

  const billNumber = rows[0]?.generate_bill_number;

  if (!billNumber) {
    throw new BillingError(
      "Failed to generate bill number",
      500
    );
  }

  return billNumber;
}

async function generatePaymentNumber(
  tx: TransactionClient
): Promise<string> {
  const rows = await tx.$queryRaw<
    { generate_payment_number: string }[]
  >`SELECT generate_payment_number() AS generate_payment_number`;

  const paymentNumber = rows[0]?.generate_payment_number;

  if (!paymentNumber) {
    throw new BillingError(
      "Failed to generate payment number",
      500
    );
  }

  return paymentNumber;
}

async function getCustomerPreviousBalance(
  tx: TransactionClient,
  businessId: bigint,
  customerId: bigint
): Promise<Decimal> {
  const latest = await tx.ledger_entries.findFirst({
    where: {
      business_id: businessId,
      customer_id: customerId,
    },
    orderBy: [
      { transaction_at: "desc" },
      { id: "desc" },
    ],
  });

  if (!latest) {
    return new Decimal(0);
  }

  return decimalFrom(latest.balance_after);
}

async function lockCustomer(
  tx: TransactionClient,
  customerId: bigint
): Promise<void> {
  // Serialises concurrent billing for the same customer so the
  // running ledger balance cannot be read stale.
  await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customerId} FOR UPDATE`;
}

/**
 * Resolves every bill line's item+unit in a single query instead of one
 * round trip per line — a bill with N items previously meant N sequential
 * `findFirst` calls inside the transaction, which is the main reason a
 * multi-item bill took visibly longer to save than a one-item bill.
 */
async function resolveItemUnits(
  tx: TransactionClient,
  businessId: bigint,
  lines: { itemId: bigint; itemUnitId?: bigint }[]
) {
  const itemIds = [...new Set(lines.map((l) => l.itemId))];

  const items = await tx.items.findMany({
    where: {
      id: { in: itemIds },
      business_id: businessId,
      is_active: true,
    },
    include: {
      item_units: {
        where: {
          is_active: true,
        },
        orderBy: {
          id: "asc",
        },
      },
    },
  });

  const itemsById = new Map(items.map((item) => [item.id.toString(), item]));

  return lines.map(({ itemId, itemUnitId }) => {
    const item = itemsById.get(itemId.toString());

    if (!item) {
      throw new BillingError("Item not found", 404);
    }

    if (item.item_units.length === 0) {
      throw new BillingError(
        `Item "${item.english_name}" has no active units`,
        400
      );
    }

    const unit = itemUnitId
      ? item.item_units.find((u) => u.id === itemUnitId)
      : item.item_units.find((u) => u.is_default) ??
        item.item_units[0];

    if (!unit) {
      throw new BillingError("Item unit not found", 404);
    }

    return { item, unit };
  });
}

export async function createBill(
  businessId: bigint,
  userId: bigint,
  data: CreateBillInput
) {
  return prisma.$transaction(
    async (tx) => {
    const transactionAt = data.transaction_at
      ? new Date(data.transaction_at)
      : new Date();

    const billDiscount = decimalFrom(data.discount);
    const amountPaid = decimalFrom(data.amount_paid);

    let customer: Awaited<
      ReturnType<typeof tx.customers.findFirst>
    > = null;

    let previousBalance = new Decimal(0);

    if (data.bill_type === "CUSTOMER") {
      const customerId = BigInt(data.customer_id!);

      customer = await tx.customers.findFirst({
        where: {
          id: customerId,
          business_id: businessId,
          is_active: true,
        },
      });

      if (!customer) {
        throw new BillingError(
          "Customer not found",
          404
        );
      }

      await lockCustomer(tx, customerId);

      previousBalance = await getCustomerPreviousBalance(
        tx,
        businessId,
        customerId
      );
    }

    const preparedItems: {
      item_id: bigint;
      item_unit_id: bigint;
      item_name_snapshot: string;
      unit: string;
      quantity: Decimal;
      standard_rate: Decimal;
      actual_rate: Decimal;
      discount: Decimal;
      line_total: Decimal;
      total_weight_kg?: Decimal;
      bill_item_weights?: {
        create: { sequence: number; weight_kg: Decimal }[];
      };
    }[] = [];

    const resolvedItems = await resolveItemUnits(
      tx,
      businessId,
      data.items.map((line) => ({
        itemId: BigInt(line.item_id),
        itemUnitId: line.item_unit_id ? BigInt(line.item_unit_id) : undefined,
      }))
    );

    for (const [index, line] of data.items.entries()) {
      const { item, unit } = resolvedItems[index];

      const itemDiscount = decimalFrom(line.discount);
      const standardRate = decimalFrom(unit.standard_price);

      const actualRate =
        line.actual_rate !== undefined
          ? decimalFrom(line.actual_rate)
          : standardRate;

      if (unit.is_weight_variable) {
        // Container count must be a whole number (you can't have "2.5
        // bags"), and every container must have a real, entered weight
        // — never trust a client-computed sum for the actual money math.
        if (!Number.isInteger(line.quantity)) {
          throw new BillingError(
            `Quantity for "${item.english_name}" (${unit.unit}) must be a whole number of containers`
          );
        }

        const weights = line.weights ?? [];

        if (weights.length !== line.quantity) {
          throw new BillingError(
            `"${item.english_name}" needs exactly ${line.quantity} weight ${
              line.quantity === 1 ? "entry" : "entries"
            } (one per ${unit.unit}), got ${weights.length}`
          );
        }

        const weightDecimals = weights.map((w) => decimalFrom(w));
        const totalWeightKg = weightDecimals
          .reduce((sum, w) => sum.plus(w), new Decimal(0))
          .toDecimalPlaces(3, Decimal.ROUND_HALF_UP);

        const computedLineTotal = lineTotal(
          totalWeightKg,
          actualRate,
          itemDiscount
        );

        preparedItems.push({
          item_id: item.id,
          item_unit_id: unit.id,
          item_name_snapshot: item.english_name,
          unit: "kg",
          quantity: totalWeightKg,
          standard_rate: standardRate,
          actual_rate: actualRate,
          discount: itemDiscount,
          line_total: computedLineTotal,
          total_weight_kg: totalWeightKg,
          bill_item_weights: {
            create: weightDecimals.map((weight_kg, i) => ({
              sequence: i + 1,
              weight_kg,
            })),
          },
        });
        continue;
      }

      const quantity = decimalFrom(line.quantity);

      const computedLineTotal = lineTotal(
        quantity,
        actualRate,
        itemDiscount
      );

      preparedItems.push({
        item_id: item.id,
        item_unit_id: unit.id,
        item_name_snapshot: item.english_name,
        unit: unit.unit,
        quantity,
        standard_rate: standardRate,
        actual_rate: actualRate,
        discount: itemDiscount,
        line_total: computedLineTotal,
      });
    }

    let subtotal = new Decimal(0);

    for (const line of preparedItems) {
      subtotal = subtotal.plus(line.line_total);
    }

    subtotal = roundMoney(subtotal);

    if (billDiscount.greaterThan(subtotal)) {
      throw new BillingError(
        "Bill discount cannot exceed subtotal"
      );
    }

    const grandTotal = roundMoney(
      subtotal.minus(billDiscount)
    );

    if (grandTotal.lessThan(0)) {
      throw new BillingError(
        "Grand total cannot be negative"
      );
    }

    // A customer may pay more than this bill's own total to also pay
    // down what they already owed — the excess reduces their previous
    // balance instead of being rejected. There's no previous balance
    // to apply it to on a walk-in (no customer, no ledger), so that
    // case still isn't allowed to overpay.
    if (
      amountPaid.greaterThan(grandTotal) &&
      !(data.bill_type === "CUSTOMER" && customer)
    ) {
      throw new BillingError(
        "Amount paid cannot exceed grand total"
      );
    }

    // current_bill_balance is what's still owed on THIS bill alone —
    // it never goes negative; any excess is reflected in
    // overall_balance instead (computed from the raw, unclamped
    // amounts so it still lands on the correct final figure).
    const currentBillBalance = Decimal.max(
      0,
      roundMoney(grandTotal.minus(amountPaid))
    );

    const overallBalance = roundMoney(
      previousBalance.plus(grandTotal).minus(amountPaid)
    );

    const billNumber = await generateBillNumber(tx);

    const bill = await tx.bills.create({
      data: {
        business_id: businessId,
        bill_number: billNumber,
        customer_id: customer?.id ?? null,
        bill_type: data.bill_type,
        status: "COMPLETED",
        transaction_at: transactionAt,
        customer_name_snapshot:
          customer?.english_name ?? null,
        customer_phone_snapshot: customer?.phone ?? null,
        place_snapshot:
          customer?.place ?? null,
        customer_address_snapshot:
          customer?.address ?? null,
        subtotal,
        discount: billDiscount,
        grand_total: grandTotal,
        previous_balance: previousBalance,
        amount_paid: amountPaid,
        current_bill_balance: currentBillBalance,
        overall_balance: overallBalance,
        notes: data.notes ?? null,
        created_by: userId,
        bill_items: {
          create: preparedItems,
        },
      },
      include: billInclude,
    });

    // Stock out — one movement per line, only for a COMPLETED bill
    // (the only status this function ever creates today; guarded
    // explicitly since nothing here should reduce stock for a bill
    // that isn't actually completed).
    if (bill.status === "COMPLETED") {
      for (const line of preparedItems) {
        await recordStockMovement(tx, {
          businessId,
          itemId: line.item_id,
          movementType: "SALE",
          quantityOut: line.quantity,
          billId: bill.id,
          transactionAt: transactionAt,
          description: `Bill ${billNumber}`,
          userId,
        });
      }
    }

    if (data.bill_type === "CUSTOMER" && customer) {
      let runningBalance = previousBalance;

      const saleBalance = roundMoney(
        runningBalance.plus(grandTotal)
      );

      await tx.ledger_entries.create({
        data: {
          business_id: businessId,
          customer_id: customer.id,
          entry_type: "SALE",
          bill_id: bill.id,
          transaction_at: transactionAt,
          debit: grandTotal,
          credit: new Decimal(0),
          balance_after: saleBalance,
          description: `Bill ${billNumber}`,
        },
      });

      runningBalance = saleBalance;

      if (amountPaid.greaterThan(0)) {
        const paymentNumber =
          await generatePaymentNumber(tx);

        const paymentMethod =
          data.payment_method ?? "CASH";

        const payment = await tx.payments.create({
          data: {
            business_id: businessId,
            payment_number: paymentNumber,
            customer_id: customer.id,
            payment_at: transactionAt,
            amount: amountPaid,
            payment_method: paymentMethod,
            notes: data.notes ?? null,
            created_by: userId,
          },
        });

        // Only the portion that actually applies to THIS bill is
        // recorded as an allocation to it — an allocation greater
        // than the bill's own grand_total would make it look
        // over-paid to anything that computes a bill's outstanding
        // as grand_total minus its allocations. The excess still
        // reduces the customer's balance via the ledger PAYMENT entry
        // below (credit: amountPaid, the full amount), just without
        // being tied to this specific bill.
        await tx.payment_allocations.create({
          data: {
            payment_id: payment.id,
            bill_id: bill.id,
            allocated_amount: Decimal.min(amountPaid, grandTotal),
          },
        });

        runningBalance = roundMoney(
          runningBalance.minus(amountPaid)
        );

        await tx.ledger_entries.create({
          data: {
            business_id: businessId,
            customer_id: customer.id,
            entry_type: "PAYMENT",
            bill_id: bill.id,
            payment_id: payment.id,
            transaction_at: transactionAt,
            debit: new Decimal(0),
            credit: amountPaid,
            balance_after: runningBalance,
            description: `Payment ${paymentNumber} for bill ${billNumber}`,
          },
        });
      }
    }

    await tx.audit_logs.create({
      data: {
        business_id: businessId,
        user_id: userId,
        action: "CREATE",
        entity_type: "bill",
        entity_id: bill.id,
        new_data: toAuditJson(bill),
      },
    });

    return bill;
  }, {
    maxWait: 10000,
    timeout: 20000,
  });
}

export async function getBills(
  businessId: bigint,
  query: ListBillsQuery
) {
  const where: Prisma.billsWhereInput = {
    business_id: businessId,
  };

  if (query.customer_id) {
    where.customer_id = BigInt(query.customer_id);
  }

  if (query.bill_status) {
    where.status = query.bill_status;
  }

  if (query.bill_type) {
    where.bill_type = query.bill_type;
  }

  const dateBounds = rangeToBounds(query);

  if (dateBounds) {
    where.transaction_at = dateBounds;
  }

  if (query.search) {
    const search = query.search;

    where.OR = [
      {
        bill_number: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        customer_name_snapshot: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        customer_phone_snapshot: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        customers: {
          customer_code: {
            contains: search,
            mode: "insensitive",
          },
        },
      },
      {
        customers: {
          english_name: {
            contains: search,
            mode: "insensitive",
          },
        },
      },
      {
        customers: {
          phone: {
            contains: search,
            mode: "insensitive",
          },
        },
      },
    ];
  }

  return prisma.bills.findMany({
    where,
    include: billInclude,
    orderBy: [{ transaction_at: "desc" }, { id: "desc" }],
  });
}

export async function getBillById(
  businessId: bigint,
  billId: bigint
) {
  return prisma.bills.findFirst({
    where: {
      id: billId,
      business_id: businessId,
    },
    include: billInclude,
  });
}

export async function getBillByNumber(
  businessId: bigint,
  billNumber: string
) {
  return prisma.bills.findFirst({
    where: {
      bill_number: billNumber,
      business_id: businessId,
    },
    include: billInclude,
  });
}

export async function cancelBill(
  businessId: bigint,
  userId: bigint,
  billId: bigint,
  reason?: string
) {
  return prisma.$transaction(
    async (tx) => {
    await tx.$queryRaw`SELECT id FROM bills WHERE id = ${billId} AND business_id = ${businessId} FOR UPDATE`;

    const bill = await tx.bills.findFirst({
      where: {
        id: billId,
        business_id: businessId,
      },
      include: {
        payment_allocations: true,
        bill_items: true,
      },
    });

    if (!bill) {
      throw new BillingError("Bill not found", 404);
    }

    if (bill.status === "CANCELLED") {
      throw new BillingError(
        "Bill is already cancelled",
        409
      );
    }

    if (bill.payment_allocations.length > 0) {
      throw new BillingError(
        "Cannot cancel a bill with allocated payments. Reverse or reallocate payments first.",
        409
      );
    }

    const cancelledAt = new Date();

    if (bill.customer_id) {
      // Reverse the customer's SALE ledger entry so their outstanding
      // balance no longer includes the cancelled bill. The original
      // entry is kept; a compensating credit entry is appended.
      await lockCustomer(tx, bill.customer_id);

      const currentBalance = await getCustomerPreviousBalance(
        tx,
        businessId,
        bill.customer_id
      );

      await tx.ledger_entries.create({
        data: {
          business_id: businessId,
          customer_id: bill.customer_id,
          entry_type: "ADJUSTMENT",
          bill_id: bill.id,
          transaction_at: cancelledAt,
          debit: new Decimal(0),
          credit: bill.grand_total,
          balance_after: roundMoney(
            currentBalance.minus(decimalFrom(bill.grand_total))
          ),
          description: reason
            ? `Reversal: bill ${bill.bill_number} cancelled — Reason: ${reason}`
            : `Reversal: bill ${bill.bill_number} cancelled`,
        },
      });
    }

    // Restore stock for every line on this bill — applies to walk-in
    // bills too (they reduce stock on creation the same as customer
    // bills), so this isn't gated on bill.customer_id like the ledger
    // reversal above. Same "compensating entry, never mutate history"
    // discipline as the ledger reversal.
    for (const line of bill.bill_items) {
      await recordStockMovement(tx, {
        businessId,
        itemId: line.item_id,
        movementType: "ADJUSTMENT",
        quantityIn: line.quantity,
        billId: bill.id,
        transactionAt: cancelledAt,
        description: reason
          ? `Reversal: bill ${bill.bill_number} cancelled — Reason: ${reason}`
          : `Reversal: bill ${bill.bill_number} cancelled`,
        userId,
      });
    }

    const updated = await tx.bills.update({
      where: {
        id: bill.id,
      },
      data: {
        status: "CANCELLED",
        updated_at: cancelledAt,
      },
      include: billInclude,
    });

    await tx.audit_logs.create({
      data: {
        business_id: businessId,
        user_id: userId,
        action: "CANCEL",
        entity_type: "bill",
        entity_id: bill.id,
        old_data: toAuditJson(bill),
        new_data: toAuditJson({
          ...updated,
          cancellation_reason: reason ?? null,
        }),
      },
    });

    return updated;
  }, {
    maxWait: 10000,
    timeout: 20000,
  });
}
