import { z } from "zod";

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

export const ledgerQuerySchema = z.object({
  start_date: z.string().trim().optional(),

  end_date: z.string().trim().optional(),

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
});

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
