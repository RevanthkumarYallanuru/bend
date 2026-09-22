import { z } from "zod";

const deliveryStatusEnum = z.enum([
  "GENERATED",
  "SENT",
  "REACHED",
  "BALANCE",
  "CLEARED",
]);

/* ---------------- DELIVERY AGENTS ---------------- */

export const createAgentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Agent name is required")
    .max(100, "Agent name must be at most 100 characters"),

  phone: z
    .string()
    .trim()
    .max(20, "Phone must be at most 20 characters")
    .optional(),

  vehicle_number: z
    .string()
    .trim()
    .max(30, "Vehicle number must be at most 30 characters")
    .optional(),

  notes: z
    .string()
    .trim()
    .max(1000, "Notes must be at most 1000 characters")
    .optional(),
});

export const updateAgentSchema = createAgentSchema.partial();

export const agentIdSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, "Agent ID must be a numeric string")
    .transform((val) => BigInt(val)),
});

export const listAgentsQuerySchema = z.object({
  search: z.string().trim().optional(),
  includeInactive: z
    .string()
    .optional()
    .transform((val) => val === "true"),
});

/* ---------------- DELIVERIES ---------------- */

export const assignDeliverySchema = z.object({
  bill_id: z
    .string()
    .regex(/^\d+$/, "Bill ID must be a numeric string"),

  delivery_agent_id: z
    .string()
    .regex(/^\d+$/, "Delivery agent ID must be a numeric string")
    .optional(),

  notes: z
    .string()
    .trim()
    .max(1000, "Notes must be at most 1000 characters")
    .optional(),
});

export const reassignAgentSchema = z.object({
  delivery_agent_id: z
    .string()
    .regex(/^\d+$/, "Delivery agent ID must be a numeric string")
    .nullable(),
});

export const updateDeliveryStatusSchema = z.object({
  status: z.enum(["SENT", "REACHED", "BALANCE", "CLEARED"]),

  notes: z
    .string()
    .trim()
    .max(1000, "Notes must be at most 1000 characters")
    .optional(),
});

export const deliveryIdSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, "Delivery ID must be a numeric string")
    .transform((val) => BigInt(val)),
});

export const billIdParamSchema = z.object({
  billId: z
    .string()
    .regex(/^\d+$/, "Bill ID must be a numeric string")
    .transform((val) => BigInt(val)),
});

export const listDeliveriesQuerySchema = z.object({
  status: deliveryStatusEnum.optional(),

  delivery_agent_id: z
    .string()
    .regex(/^\d+$/)
    .optional(),

  search: z.string().trim().optional(),

  start_date: z.string().trim().optional(),

  end_date: z.string().trim().optional(),
});

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type ListAgentsQuery = z.infer<typeof listAgentsQuerySchema>;
export type AssignDeliveryInput = z.infer<typeof assignDeliverySchema>;
export type ListDeliveriesQuery = z.infer<
  typeof listDeliveriesQuerySchema
>;
