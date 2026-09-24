import { prisma } from "../../config/database";

import type { UpdateBusinessSettingsInput } from "./business.validation";

export async function getBusinessSettings(businessId: bigint) {
  return prisma.businesses.findFirst({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      name_display_mode: true,
      print_language: true,
      proprietor_name: true,
      bill_note: true,
      phone: true,
      alternate_phone: true,
      bill_item_row_count: true,
    },
  });
}

export async function updateBusinessSettings(
  businessId: bigint,
  data: UpdateBusinessSettingsInput
) {
  return prisma.businesses.update({
    where: { id: businessId },
    data: {
      ...(data.name_display_mode !== undefined && {
        name_display_mode: data.name_display_mode,
      }),
      ...(data.print_language !== undefined && {
        print_language: data.print_language,
      }),
      ...(data.proprietor_name !== undefined && {
        proprietor_name: data.proprietor_name || null,
      }),
      ...(data.bill_note !== undefined && {
        bill_note: data.bill_note || null,
      }),
      ...(data.phone !== undefined && {
        phone: data.phone || null,
      }),
      ...(data.alternate_phone !== undefined && {
        alternate_phone: data.alternate_phone || null,
      }),
      ...(data.bill_item_row_count !== undefined && {
        bill_item_row_count: data.bill_item_row_count,
      }),
      updated_at: new Date(),
    },
    select: {
      id: true,
      name: true,
      name_display_mode: true,
      print_language: true,
      proprietor_name: true,
      bill_note: true,
      phone: true,
      alternate_phone: true,
      bill_item_row_count: true,
    },
  });
}
