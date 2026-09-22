import { z } from "zod";

export const createItemSchema = z.object({
  item_code: z
    .string()
    .trim()
    .min(1, "Item code is required")
    .max(50, "Item code must be at most 50 characters"),

  category_id: z
    .coerce
    .bigint()
    .positive()
    .nullable()
    .optional(),

  english_name: z
    .string()
    .trim()
    .min(1, "Item name is required")
    .max(150, "Item name must be at most 150 characters"),

  telugu_name: z
    .string()
    .trim()
    .max(150, "Telugu name must be at most 150 characters")
    .optional(),

  description: z
    .string()
    .trim()
    .max(1000, "Description must be at most 1000 characters")
    .optional(),
});

export const updateItemSchema =
  createItemSchema.partial();

export const itemIdSchema = z.object({
  id: z.coerce.bigint().positive(),
});

export const createItemUnitSchema = z.object({
  unit: z
    .string()
    .trim()
    .min(1, "Unit is required")
    .max(30, "Unit must be at most 30 characters"),

  standard_price: z
    .coerce
    .number()
    .min(0, "Standard price cannot be negative"),

  is_default: z.boolean().optional(),
});

export const updateItemUnitSchema = z.object({
  unit: z
    .string()
    .trim()
    .min(1, "Unit is required")
    .max(30, "Unit must be at most 30 characters")
    .optional(),

  standard_price: z
    .coerce
    .number()
    .min(0, "Standard price cannot be negative")
    .optional(),

  is_default: z.boolean().optional(),
});

export const itemUnitIdSchema = z.object({
  id: z.coerce.bigint().positive(),
  unitId: z.coerce.bigint().positive(),
});

export type CreateItemInput =
  z.infer<typeof createItemSchema>;

export type UpdateItemInput =
  z.infer<typeof updateItemSchema>;

export type CreateItemUnitInput =
  z.infer<typeof createItemUnitSchema>;

export type UpdateItemUnitInput =
  z.infer<typeof updateItemUnitSchema>;