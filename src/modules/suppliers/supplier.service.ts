import { Decimal } from "@prisma/client/runtime/client";

import { prisma } from "../../config/database";
import { createPayable } from "../payables/payable.service";

import type {
  CreateSupplierInput,
  UpdateSupplierInput,
} from "./supplier.validation";

function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function decimalFrom(value: number | string | Decimal | null): Decimal {
  return new Decimal((value ?? 0).toString());
}

export async function createSupplier(
  businessId: bigint,
  userId: bigint,
  data: CreateSupplierInput
) {
  const supplier = await prisma.suppliers.create({
    data: {
      business_id: businessId,
      name: data.name,
      telugu_name: data.telugu_name ?? null,
      phone: data.phone ?? null,
      alternate_phone: data.alternate_phone ?? null,
      organization: data.organization ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
    },
  });

  // Initial/opening balance is deliberately not a column on the
  // supplier row — it becomes an ordinary payable (reason "Opening
  // Balance"), the same way every other amount owed to this supplier
  // is tracked, so it gets full history/payment support for free and
  // never needs its own balance-computation logic.
  if (data.initial_balance && data.initial_balance > 0) {
    await createPayable(businessId, userId, {
      supplier_id: supplier.id.toString(),
      total_amount: data.initial_balance,
      reason: "Opening Balance",
    });
  }

  return supplier;
}

export async function getSuppliers(
  businessId: bigint,
  search?: string,
  activeOnly?: boolean
) {
  return prisma.suppliers.findMany({
    where: {
      business_id: businessId,
      ...(activeOnly ? { is_active: true } : {}),
      ...(search
        ? {
            OR: [
              {
                name: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                phone: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                organization: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    },
    orderBy: {
      id: "desc",
    },
  });
}

export async function getSupplierById(businessId: bigint, supplierId: bigint) {
  return prisma.suppliers.findFirst({
    where: {
      id: supplierId,
      business_id: businessId,
    },
  });
}

export async function updateSupplier(
  businessId: bigint,
  supplierId: bigint,
  data: UpdateSupplierInput
) {
  return prisma.suppliers.updateMany({
    where: {
      id: supplierId,
      business_id: businessId,
    },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.telugu_name !== undefined && { telugu_name: data.telugu_name }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.alternate_phone !== undefined && {
        alternate_phone: data.alternate_phone,
      }),
      ...(data.organization !== undefined && {
        organization: data.organization,
      }),
      ...(data.address !== undefined && { address: data.address }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  });
}

export async function setSupplierStatus(
  businessId: bigint,
  supplierId: bigint,
  isActive: boolean
) {
  return prisma.suppliers.updateMany({
    where: {
      id: supplierId,
      business_id: businessId,
    },
    data: {
      is_active: isActive,
    },
  });
}

/**
 * Bulk balance for every supplier in one round trip (avoids N+1 on the
 * list page) — mirrors how the Customers list bulk-fetches outstanding
 * balances via the reports/outstanding endpoint, but computed directly
 * from payables since suppliers don't have a separate ledger table.
 */
export async function getSupplierBalances(businessId: bigint) {
  const rows = await prisma.payables.groupBy({
    by: ["supplier_id"],
    where: {
      business_id: businessId,
    },
    _sum: {
      total_amount: true,
      amount_paid: true,
    },
  });

  return rows.map((row) => {
    const totalPayable = decimalFrom(row._sum?.total_amount ?? null);
    const totalPaid = decimalFrom(row._sum?.amount_paid ?? null);

    return {
      supplier_id: row.supplier_id.toString(),
      total_payable: roundMoney(totalPayable).toString(),
      total_paid: roundMoney(totalPaid).toString(),
      balance: roundMoney(totalPayable.minus(totalPaid)).toString(),
    };
  });
}

export async function getSupplierBalance(
  businessId: bigint,
  supplierId: bigint
) {
  const aggregate = await prisma.payables.aggregate({
    where: {
      business_id: businessId,
      supplier_id: supplierId,
    },
    _sum: {
      total_amount: true,
      amount_paid: true,
    },
  });

  const totalPayable = decimalFrom(aggregate._sum.total_amount);
  const totalPaid = decimalFrom(aggregate._sum.amount_paid);

  return {
    total_payable: roundMoney(totalPayable).toString(),
    total_paid: roundMoney(totalPaid).toString(),
    balance: roundMoney(totalPayable.minus(totalPaid)).toString(),
  };
}
