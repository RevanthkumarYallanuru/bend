import { z } from "zod";

export const createSupplierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Supplier name is required")
    .max(150, "Supplier name must be at most 150 characters"),

  telugu_name: z
    .string()
    .trim()
    .max(150, "Telugu name must be at most 150 characters")
    .optional(),

  phone: z
    .string()
    .trim()
    .max(20, "Phone number must be at most 20 characters")
    .optional(),

  alternate_phone: z
    .string()
    .trim()
    .max(20, "Alternate phone must be at most 20 characters")
    .optional(),

  organization: z
    .string()
    .trim()
    .max(150, "Organization must be at most 150 characters")
    .optional(),

  address: z
    .string()
    .trim()
    .max(500, "Address must be at most 500 characters")
    .optional(),

  notes: z
    .string()
    .trim()
    .max(1000, "Notes must be at most 1000 characters")
    .optional(),

  // One-time onboarding value only — see supplier.service.ts's
  // createSupplier, which turns this into an ordinary opening-balance
  // payable rather than storing it on the supplier row itself.
  initial_balance: z.coerce
    .number()
    .min(0, "Initial balance cannot be negative")
    .optional(),
});

export const updateSupplierSchema = createSupplierSchema
  .omit({ initial_balance: true })
  .partial();

export const supplierIdSchema = z.object({
  id: z.coerce.bigint().positive(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
