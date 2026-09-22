import { z } from "zod";

export const createCustomerSchema = z.object({
  customer_code: z
    .string()
    .trim()
    .min(1, "Customer code is required")
    .max(50, "Customer code must be at most 50 characters"),

  english_name: z
    .string()
    .trim()
    .min(1, "Customer name is required")
    .max(150, "Customer name must be at most 150 characters"),

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

  place: z
    .string()
    .trim()
    .max(150, "Place must be at most 150 characters")
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
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const customerIdSchema = z.object({
  id: z.coerce.bigint().positive(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;