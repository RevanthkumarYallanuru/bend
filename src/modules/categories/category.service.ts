import { prisma } from "../../config/database";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from "./category.validation";

export async function createCategory(
  businessId: bigint,
  data: CreateCategoryInput
) {
  return prisma.categories.create({
    data: {
      business_id: businessId,
      name: data.name,
      telugu_name: data.telugu_name ?? null,
    },
  });
}

export async function getCategories(
  businessId: bigint,
  search?: string,
  includeInactive = false
) {
  return prisma.categories.findMany({
    where: {
      business_id: businessId,

      ...(includeInactive
        ? {}
        : {
            is_active: true,
          }),

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
                telugu_name: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    },

    orderBy: [{ id: "desc" }],
  });
}

export async function getCategoryById(
  businessId: bigint,
  categoryId: bigint
) {
  return prisma.categories.findFirst({
    where: {
      id: categoryId,
      business_id: businessId,
    },
  });
}

export async function updateCategory(
  businessId: bigint,
  categoryId: bigint,
  data: UpdateCategoryInput
) {
  return prisma.categories.updateMany({
    where: {
      id: categoryId,
      business_id: businessId,
    },

    data: {
      ...(data.name !== undefined && {
        name: data.name,
      }),

      ...(data.telugu_name !== undefined && {
        telugu_name: data.telugu_name,
      }),
    },
  });
}

export async function setCategoryStatus(
  businessId: bigint,
  categoryId: bigint,
  isActive: boolean
) {
  return prisma.categories.updateMany({
    where: {
      id: categoryId,
      business_id: businessId,
    },

    data: {
      is_active: isActive,
    },
  });
}