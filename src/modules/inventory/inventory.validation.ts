import { z } from "zod";

export const itemIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, "Item ID must be a numeric string")
    .transform((val) => BigInt(val)),
});

/** Manual stock correction — the admin enters the correct *current*
 * quantity (not a +/- delta); see setItemStock's own doc comment for
 * why. */
export const setItemStockSchema = z.object({
  quantity: z.coerce
    .number({ message: "Quantity is required" })
    .min(0, "Quantity cannot be negative"),
  notes: z.string().trim().max(255).optional(),
});

export type SetItemStockInput = z.infer<typeof setItemStockSchema>;
