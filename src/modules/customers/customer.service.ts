import { prisma } from "../../config/database";
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
} from "./customer.validation";

export async function createCustomer(
  businessId: bigint,
  data: CreateCustomerInput
) {
  return prisma.customers.create({
    data: {
      business_id: businessId,
      customer_code: data.customer_code,
      english_name: data.english_name,
      telugu_name: data.telugu_name ?? null,
      phone: data.phone ?? null,
      alternate_phone: data.alternate_phone ?? null,
      place: data.place ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
    },
  });
}

export async function getCustomers(
  businessId: bigint,
  search?: string,
  activeOnly?: boolean
) {
  return prisma.customers.findMany({
    where: {
      business_id: businessId,
      ...(activeOnly ? { is_active: true } : {}),
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
                customer_code: {
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
            ],
          }
        : {}),
    },
    orderBy: {
      id: "desc",
    },
  });
}

export async function getCustomerById(
  businessId: bigint,
  customerId: bigint
) {
  return prisma.customers.findFirst({
    where: {
      id: customerId,
      business_id: businessId,
    },
  });
}

export async function updateCustomer(
  businessId: bigint,
  customerId: bigint,
  data: UpdateCustomerInput
) {
  return prisma.customers.updateMany({
    where: {
      id: customerId,
      business_id: businessId,
    },
    data: {
      ...(data.customer_code !== undefined && {
        customer_code: data.customer_code,
      }),

      ...(data.english_name !== undefined && {
        english_name: data.english_name,
      }),

      ...(data.telugu_name !== undefined && {
        telugu_name: data.telugu_name,
      }),

      ...(data.phone !== undefined && {
        phone: data.phone,
      }),

      ...(data.alternate_phone !== undefined && {
        alternate_phone: data.alternate_phone,
      }),

      ...(data.place !== undefined && {
        place: data.place,
      }),

      ...(data.address !== undefined && {
        address: data.address,
      }),

      ...(data.notes !== undefined && {
        notes: data.notes,
      }),
    },
  });
}

export async function setCustomerStatus(
  businessId: bigint,
  customerId: bigint,
  isActive: boolean
) {
  return prisma.customers.updateMany({
    where: {
      id: customerId,
      business_id: businessId,
    },
    data: {
      is_active: isActive,
    },
  });
}