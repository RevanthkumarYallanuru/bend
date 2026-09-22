import { z } from "zod";

export const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Category name is required")
    .max(150, "Category name must be at most 150 characters"),

  telugu_name: z
    .string()
    .trim()
    .max(150, "Telugu name must be at most 150 characters")
    .optional(),
});

export const updateCategorySchema =
  createCategorySchema.partial();

export const categoryIdSchema = z.object({
  id: z.coerce.bigint().positive(),
});

export type CreateCategoryInput =
  z.infer<typeof createCategorySchema>;

export type UpdateCategoryInput =
  z.infer<typeof updateCategorySchema>;