import { z } from "zod";

export const itemIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, "Item ID must be a numeric string")
    .transform((val) => BigInt(val)),
});
