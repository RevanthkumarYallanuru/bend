import { z } from "zod";

const billItemSchema = z.object({
  item_id: z
    .string()
    .regex(/^\d+$/, "Item ID must be a numeric string"),

  item_unit_id: z
    .string()
    .regex(/^\d+$/, "Item unit ID must be a numeric string")
    .nullable()
    .optional(),

  quantity: z.coerce
    .number()
    .positive("Quantity must be greater than zero"),

  actual_rate: z.coerce
    .number()
    .nonnegative("Actual rate cannot be negative")
    .optional(),

  discount: z.coerce
    .number()
    .min(0, "Item discount cannot be negative")
    .default(0),

  // Only meaningful when the chosen unit has is_weight_variable set —
  // one actual weight (kg) per container, e.g. quantity: 5 "Bags"
  // needs exactly 5 entries here. Ignored otherwise. The service
  // layer re-validates the length/positivity itself rather than
  // trusting this shape check alone.
  weights: z
    .array(z.coerce.number().positive("Each weight must be greater than zero"))
    .optional(),
});

export const createBillSchema = z
  .object({
    bill_type: z.enum(["CUSTOMER", "WALK_IN"]),

    customer_id: z
      .string()
      .regex(/^\d+$/, "Customer ID must be a numeric string")
      .nullable()
      .optional(),

    transaction_at: z.string().datetime().optional(),

    discount: z.coerce
      .number()
      .min(0, "Bill discount cannot be negative")
      .default(0),

    amount_paid: z.coerce
      .number()
      .min(0, "Amount paid cannot be negative")
      .default(0),

    payment_method: z
      .enum([
        "CASH",
        "UPI",
        "BANK_TRANSFER",
        "CHEQUE",
        "OTHER",
      ])
      .optional(),

    notes: z
      .string()
      .trim()
      .max(2000, "Notes must be at most 2000 characters")
      .optional(),

    items: z
      .array(billItemSchema)
      .min(1, "At least one bill item is required"),
  })
  .superRefine((data, ctx) => {
    if (data.bill_type === "CUSTOMER" && !data.customer_id) {
      ctx.addIssue({
        code: "custom",
        message: "Customer ID is required for CUSTOMER bills",
        path: ["customer_id"],
      });
    }

    if (data.bill_type === "WALK_IN" && data.customer_id) {
      ctx.addIssue({
        code: "custom",
        message:
          "Walk-in bills must not include a customer ID",
        path: ["customer_id"],
      });
    }

    if (data.amount_paid > 0 && !data.payment_method) {
      // Default applied in service; optional here for API flexibility
    }
  });

export const billIdSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, "Bill ID must be a numeric string")
    .transform((val) => BigInt(val)),
});

export const billNumberParamSchema = z.object({
  billNumber: z
    .string()
    .trim()
    .min(1, "Bill number is required")
    .max(40, "Bill number is too long"),
});

export const cancelBillSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Reason cannot be empty")
    .max(500, "Reason must be at most 500 characters")
    .optional(),
});

export const listBillsQuerySchema = z.object({
  customer_id: z
    .string()
    .regex(/^\d+$/)
    .optional(),

  bill_status: z
    .enum(["DRAFT", "COMPLETED", "CANCELLED"])
    .optional(),

  bill_type: z.enum(["CUSTOMER", "WALK_IN"]).optional(),

  search: z.string().trim().optional(),

  start_date: z.string().trim().optional(),

  end_date: z.string().trim().optional(),
});

export type CreateBillInput = z.infer<typeof createBillSchema>;
export type ListBillsQuery = z.infer<typeof listBillsQuerySchema>;
export type CancelBillInput = z.infer<typeof cancelBillSchema>;
