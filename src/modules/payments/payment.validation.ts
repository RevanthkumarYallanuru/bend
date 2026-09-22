import { z } from "zod";

const paymentMethodEnum = z.enum([
  "CASH",
  "UPI",
  "BANK_TRANSFER",
  "CHEQUE",
  "OTHER",
]);

const allocationSchema = z.object({
  bill_id: z
    .string()
    .regex(/^\d+$/, "Bill ID must be a numeric string"),

  amount: z.coerce
    .number()
    .positive("Allocation amount must be greater than zero"),
});

export const createPaymentSchema = z
  .object({
    customer_id: z
      .string()
      .regex(/^\d+$/, "Customer ID must be a numeric string"),

    amount: z.coerce
      .number()
      .positive("Payment amount must be greater than zero"),

    payment_method: paymentMethodEnum,

    payment_at: z
      .string()
      .datetime({ offset: true })
      .optional(),

    reference_number: z
      .string()
      .trim()
      .max(100, "Reference number must be at most 100 characters")
      .optional(),

    notes: z
      .string()
      .trim()
      .max(2000, "Notes must be at most 2000 characters")
      .optional(),

    allocations: z.array(allocationSchema).default([]),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();

    for (let i = 0; i < data.allocations.length; i++) {
      const billId = data.allocations[i].bill_id;

      if (seen.has(billId)) {
        ctx.addIssue({
          code: "custom",
          message: `Bill ID ${billId} is allocated more than once in the same payment`,
          path: ["allocations", i, "bill_id"],
        });
      }

      seen.add(billId);
    }

    const allocatedTotal = data.allocations.reduce(
      (sum, allocation) => sum + allocation.amount,
      0
    );

    if (allocatedTotal > data.amount) {
      ctx.addIssue({
        code: "custom",
        message:
          "Sum of allocations cannot exceed the payment amount",
        path: ["allocations"],
      });
    }
  });

export const paymentIdSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, "Payment ID must be a numeric string")
    .transform((val) => BigInt(val)),
});

export const paymentNumberParamSchema = z.object({
  paymentNumber: z
    .string()
    .trim()
    .min(1, "Payment number is required")
    .max(40, "Payment number is too long"),
});

export const cancelPaymentSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Reason cannot be empty")
    .max(500, "Reason must be at most 500 characters")
    .optional(),
});

export const customerIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, "Customer ID must be a numeric string")
    .transform((val) => BigInt(val)),
});

export const listPaymentsQuerySchema = z.object({
  customer_id: z
    .string()
    .regex(/^\d+$/)
    .optional(),

  payment_method: paymentMethodEnum.optional(),

  search: z.string().trim().optional(),

  start_date: z.string().trim().optional(),

  end_date: z.string().trim().optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
export type CancelPaymentInput = z.infer<typeof cancelPaymentSchema>;
