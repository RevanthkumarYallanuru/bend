import { z } from "zod";

import { optionalRangeFields, refineCustomRange } from "../../utils/dateRange";

export const ledgerEntryTypeEnum = z.enum([
  "SALE",
  "PAYMENT",
  "RETURN",
  "ADJUSTMENT",
]);

export const ledgerCustomerParamSchema = z.object({
  customerId: z
    .string()
    .regex(/^\d+$/, "Customer ID must be a numeric string")
    .transform((val) => BigInt(val)),
});

export const ledgerQuerySchema = z
  .object({
  ...optionalRangeFields,

  // Newest first by default (each row carries its own stored
  // balance_after, so a running balance stays correct in either order).
  order: z.enum(["asc", "desc"]).default("desc"),

  entry_type: ledgerEntryTypeEnum.optional(),

  page: z.coerce
    .number()
    .int()
    .positive()
    .default(1),

  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(500, "limit must be 500 or fewer")
    .default(100),
  })
  .superRefine(refineCustomRange);

export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;

export const openingBalanceSchema = z.object({
  amount: z.coerce
    .number()
    .positive("Opening balance must be greater than zero"),

  notes: z
    .string()
    .trim()
    .max(500, "Notes must be at most 500 characters")
    .optional(),
});

export type OpeningBalanceInput = z.infer<typeof openingBalanceSchema>;
