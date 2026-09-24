import { z } from "zod";

import { optionalRangeFields, refineCustomRange } from "../../utils/dateRange";

export const createSupplierBulkPaymentSchema = z.object({
  amount: z.coerce
    .number()
    .positive("Payment amount must be greater than zero"),

  payment_date: z
    .string()
    .datetime({ offset: true })
    .optional(),
});

export const supplierIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, "Supplier ID must be a numeric string")
    .transform((val) => BigInt(val)),
});

export const listSupplierPaymentsQuerySchema = z
  .object({ ...optionalRangeFields })
  .superRefine(refineCustomRange);

export type ListSupplierPaymentsQuery = z.infer<
  typeof listSupplierPaymentsQuerySchema
>;

export type CreateSupplierBulkPaymentInput = z.infer<
  typeof createSupplierBulkPaymentSchema
>;
