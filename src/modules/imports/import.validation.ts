import { z } from "zod";

import { optionalRangeFields, refineCustomRange } from "../../utils/dateRange";

export const createImportSchema = z
  .object({
    supplier_id: z.string().regex(/^\d+$/, "A supplier must be selected"),

    item_id: z.string().regex(/^\d+$/, "An item must be selected"),

    quantity: z.coerce
      .number()
      .positive("Quantity must be greater than zero"),

    unit: z
      .string()
      .trim()
      .min(1, "Unit is required")
      .max(30, "Unit must be at most 30 characters"),

    amount: z.coerce
      .number()
      .positive("Amount must be greater than zero"),

    paid_amount: z.coerce
      .number()
      .min(0, "Paid amount cannot be negative")
      .default(0),

    // Plain calendar date (YYYY-MM-DD), same convention as
    // payables.payable_date — defaults to today when omitted.
    import_date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
      .optional(),

    notes: z
      .string()
      .trim()
      .max(1000, "Notes must be at most 1000 characters")
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.paid_amount > data.amount) {
      ctx.addIssue({
        code: "custom",
        message: "Paid amount cannot exceed the import amount",
        path: ["paid_amount"],
      });
    }
  });

export const importIdSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, "Import ID must be a numeric string")
    .transform((val) => BigInt(val)),
});

export const listImportsQuerySchema = z
  .object({
    supplier_id: z
      .string()
      .regex(/^\d+$/)
      .optional(),
    ...optionalRangeFields,
  })
  .superRefine(refineCustomRange);

export type CreateImportInput = z.infer<typeof createImportSchema>;
export type ListImportsQuery = z.infer<typeof listImportsQuerySchema>;
