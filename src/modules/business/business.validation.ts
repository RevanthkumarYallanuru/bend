import { z } from "zod";

export const updateBusinessSettingsSchema = z.object({
  name_display_mode: z.enum(["ENGLISH", "TELUGU", "BOTH"]).optional(),
  print_language: z.enum(["ENGLISH", "TELUGU"]).optional(),
  proprietor_name: z
    .string()
    .trim()
    .max(150, "Proprietor name must be at most 150 characters")
    .optional(),
  bill_note: z
    .string()
    .trim()
    .max(300, "Bill note must be at most 300 characters")
    .optional(),
  phone: z
    .string()
    .trim()
    .max(20, "Phone must be at most 20 characters")
    .optional(),
  alternate_phone: z
    .string()
    .trim()
    .max(20, "Alternate phone must be at most 20 characters")
    .optional(),
  bill_item_row_count: z
    .number()
    .int("Bill item row count must be a whole number")
    .min(8, "Bill item row count must be at least 8")
    .max(15, "Bill item row count must be at most 15")
    .optional(),
});

export type UpdateBusinessSettingsInput = z.infer<
  typeof updateBusinessSettingsSchema
>;
