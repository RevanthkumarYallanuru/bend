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
});

export type UpdateBusinessSettingsInput = z.infer<
  typeof updateBusinessSettingsSchema
>;
