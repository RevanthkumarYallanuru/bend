import { z } from "zod";

export { rangeQuerySchema as payablesInsightsQuerySchema } from "../../utils/dateRange";
export type { RangeQuery as PayablesInsightsQuery } from "../../utils/dateRange";

const paymentMethodEnum = z.enum([
  "CASH",
  "UPI",
  "BANK_TRANSFER",
  "CHEQUE",
  "OTHER",
]);

export const createPayableSchema = z.object({
  supplier_id: z
    .string()
    .regex(/^\d+$/, "A supplier must be selected"),

  total_amount: z.coerce
    .number()
    .positive("Amount must be greater than zero"),

  reason: z
    .string()
    .trim()
    .min(1, "Reason is required")
    .max(2000, "Reason must be at most 2000 characters"),

  // Plain calendar date (YYYY-MM-DD) from a native <input type="date">
  // — the admin picks the actual date of the expense, not necessarily
  // today. Optional only for API flexibility; the frontend always
  // sends it, pre-filled to today.
  payable_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional(),
});

export const payableIdSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, "Payable ID must be a numeric string")
    .transform((val) => BigInt(val)),
});

export const listPayablesQuerySchema = z.object({
  status: z.enum(["PENDING", "PARTIALLY_PAID", "PAID"]).optional(),
  search: z.string().trim().optional(),
  supplier_id: z
    .string()
    .regex(/^\d+$/)
    .optional(),
});

export const recordPayablePaymentSchema = z.object({
  amount: z.coerce
    .number()
    .positive("Payment amount must be greater than zero"),

  payment_date: z
    .string()
    .datetime({ offset: true })
    .optional(),

  payment_method: paymentMethodEnum.optional(),

  reference_number: z
    .string()
    .trim()
    .max(100, "Reference number must be at most 100 characters")
    .optional(),

  notes: z
    .string()
    .trim()
    .max(1000, "Notes must be at most 1000 characters")
    .optional(),
});

export type CreatePayableInput = z.infer<typeof createPayableSchema>;
export type ListPayablesQuery = z.infer<typeof listPayablesQuerySchema>;
export type RecordPayablePaymentInput = z.infer<
  typeof recordPayablePaymentSchema
>;
