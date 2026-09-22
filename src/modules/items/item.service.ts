import { prisma } from "../../config/database";

import type {
  CreateItemInput,
  UpdateItemInput,
  CreateItemUnitInput,
  UpdateItemUnitInput,
} from "./item.validation";

export async function createItem(
  businessId: bigint,
  data: CreateItemInput
) {
  return prisma.items.create({
    data: {
      business_id: businessId,
      item_code: data.item_code,
      category_id: data.category_id ?? null,
      english_name: data.english_name,
      telugu_name: data.telugu_name ?? null,
      description: data.description ?? null,
    },
    include: {
      categories: true,
      item_units: true,
    },
  });
}

export async function getItems(
  businessId: bigint,
  search?: string,
  categoryId?: bigint,
  includeInactive = false
) {
  return prisma.items.findMany({
    where: {
      business_id: businessId,

      ...(includeInactive
        ? {}
        : {
            is_active: true,
          }),

      ...(categoryId
        ? {
            category_id: categoryId,
          }
        : {}),

      ...(search
        ? {
            OR: [
              {
                english_name: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                item_code: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                telugu_name: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    },

    include: {
      categories: true,
      item_units: {
        orderBy: {
          id: "asc",
        },
      },
    },

    orderBy: {
      english_name: "asc",
    },
  });
}

export async function getItemById(
  businessId: bigint,
  itemId: bigint
) {
  return prisma.items.findFirst({
    where: {
      id: itemId,
      business_id: businessId,
    },

    include: {
      categories: true,
      item_units: {
        orderBy: {
          id: "asc",
        },
      },
    },
  });
}

export async function updateItem(
  businessId: bigint,
  itemId: bigint,
  data: UpdateItemInput
) {
  return prisma.items.updateMany({
    where: {
      id: itemId,
      business_id: businessId,
    },

    data: {
      ...(data.item_code !== undefined && {
        item_code: data.item_code,
      }),

      ...(data.category_id !== undefined && {
        category_id: data.category_id,
      }),

      ...(data.english_name !== undefined && {
        english_name: data.english_name,
      }),

      ...(data.telugu_name !== undefined && {
        telugu_name: data.telugu_name,
      }),

      ...(data.description !== undefined && {
        description: data.description,
      }),
    },
  });
}

export async function setItemStatus(
  businessId: bigint,
  itemId: bigint,
  isActive: boolean
) {
  return prisma.items.updateMany({
    where: {
      id: itemId,
      business_id: businessId,
    },

    data: {
      is_active: isActive,
    },
  });
}

/* ---------------- ITEM UNITS ---------------- */

export async function createItemUnit(
  businessId: bigint,
  itemId: bigint,
  data: CreateItemUnitInput
) {
  // Verify that the item belongs to this business.
  const item = await prisma.items.findFirst({
    where: {
      id: itemId,
      business_id: businessId,
    },
  });

  if (!item) {
    throw new Error("Item not found");
  }

  /*
   * If this unit is default, remove the default flag
   * from the other units of this item first.
   */
  return prisma.$transaction(async (tx) => {
    if (data.is_default) {
      await tx.item_units.updateMany({
        where: {
          item_id: itemId,
        },
        data: {
          is_default: false,
        },
      });
    }

    return tx.item_units.create({
      data: {
        item_id: itemId,
        unit: data.unit,
        standard_price: data.standard_price,
        is_default: data.is_default ?? false,
        is_weight_variable: data.is_weight_variable ?? false,
      },
    });
  });
}

export async function updateItemUnit(
  businessId: bigint,
  itemId: bigint,
  unitId: bigint,
  data: UpdateItemUnitInput
) {
  const item = await prisma.items.findFirst({
    where: {
      id: itemId,
      business_id: businessId,
    },
  });

  if (!item) {
    throw new Error("Item not found");
  }

  return prisma.$transaction(async (tx) => {
    const existingUnit =
      await tx.item_units.findFirst({
        where: {
          id: unitId,
          item_id: itemId,
        },
      });

    if (!existingUnit) {
      throw new Error("Item unit not found");
    }

    if (data.is_default) {
      await tx.item_units.updateMany({
        where: {
          item_id: itemId,
          id: {
            not: unitId,
          },
        },
        data: {
          is_default: false,
        },
      });
    }

    return tx.item_units.update({
      where: {
        id: unitId,
      },
      data: {
        ...(data.unit !== undefined && {
          unit: data.unit,
        }),

        ...(data.standard_price !== undefined && {
          standard_price: data.standard_price,
        }),

        ...(data.is_default !== undefined && {
          is_default: data.is_default,
        }),

        ...(data.is_weight_variable !== undefined && {
          is_weight_variable: data.is_weight_variable,
        }),
      },
    });
  });
}

export async function getItemUnits(
  businessId: bigint,
  itemId: bigint
) {
  const item = await prisma.items.findFirst({
    where: {
      id: itemId,
      business_id: businessId,
    },
  });

  if (!item) {
    throw new Error("Item not found");
  }

  return prisma.item_units.findMany({
    where: {
      item_id: itemId,
      is_active: true,
    },
    orderBy: {
      id: "asc",
    },
  });
}