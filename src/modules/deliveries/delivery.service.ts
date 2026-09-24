import { prisma } from "../../config/database";
import { rangeToBounds } from "../../utils/dateRange";
import type { Prisma } from "../../../generated/prisma/client";

import type {
  AssignDeliveryInput,
  CreateAgentInput,
  ListAgentsQuery,
  ListDeliveriesQuery,
  UpdateAgentInput,
} from "./delivery.validation";

export class DeliveryError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "DeliveryError";
    this.statusCode = statusCode;
  }
}

const deliveryInclude = {
  bills: true,
  delivery_agents: true,
};

/**
 * The delivery pipeline is a directed graph, not a strict line:
 * once a bill REACHES the customer, it is either settled on the
 * spot (CLEARED) or left with an outstanding BALANCE to collect
 * later, which is itself eventually CLEARED. CLEARED is terminal.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  GENERATED: ["SENT"],
  SENT: ["REACHED"],
  REACHED: ["BALANCE", "CLEARED"],
  BALANCE: ["CLEARED"],
  CLEARED: [],
};

/* ---------------- DELIVERY AGENTS ---------------- */

export async function createAgent(
  businessId: bigint,
  data: CreateAgentInput
) {
  return prisma.delivery_agents.create({
    data: {
      business_id: businessId,
      name: data.name,
      phone: data.phone ?? null,
      vehicle_number: data.vehicle_number ?? null,
      notes: data.notes ?? null,
    },
  });
}

export async function getAgents(
  businessId: bigint,
  query: ListAgentsQuery
) {
  const where: Prisma.delivery_agentsWhereInput = {
    business_id: businessId,
    ...(query.includeInactive ? {} : { is_active: true }),
  };

  if (query.search) {
    where.OR = [
      {
        name: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        phone: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        vehicle_number: {
          contains: query.search,
          mode: "insensitive",
        },
      },
    ];
  }

  return prisma.delivery_agents.findMany({
    where,
    orderBy: { id: "desc" },
  });
}

export async function getAgentById(
  businessId: bigint,
  agentId: bigint
) {
  return prisma.delivery_agents.findFirst({
    where: { id: agentId, business_id: businessId },
  });
}

export async function updateAgent(
  businessId: bigint,
  agentId: bigint,
  data: UpdateAgentInput
) {
  return prisma.delivery_agents.updateMany({
    where: { id: agentId, business_id: businessId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.vehicle_number !== undefined && {
        vehicle_number: data.vehicle_number,
      }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  });
}

export async function setAgentStatus(
  businessId: bigint,
  agentId: bigint,
  isActive: boolean
) {
  return prisma.delivery_agents.updateMany({
    where: { id: agentId, business_id: businessId },
    data: { is_active: isActive },
  });
}

/* ---------------- DELIVERIES ---------------- */

async function getDeliveryForBusiness(
  businessId: bigint,
  deliveryId: bigint
) {
  return prisma.bill_deliveries.findFirst({
    where: {
      id: deliveryId,
      bills: { business_id: businessId },
    },
    include: deliveryInclude,
  });
}

export async function assignBillDelivery(
  businessId: bigint,
  data: AssignDeliveryInput
) {
  const billId = BigInt(data.bill_id);

  const bill = await prisma.bills.findFirst({
    where: { id: billId, business_id: businessId },
  });

  if (!bill) {
    throw new DeliveryError("Bill not found", 404);
  }

  if (bill.status !== "COMPLETED") {
    throw new DeliveryError(
      `Bill is not eligible for delivery (status: ${bill.status})`,
      409
    );
  }

  let agentId: bigint | null = null;

  if (data.delivery_agent_id) {
    agentId = BigInt(data.delivery_agent_id);

    const agent = await prisma.delivery_agents.findFirst({
      where: { id: agentId, business_id: businessId },
    });

    if (!agent) {
      throw new DeliveryError("Delivery agent not found", 404);
    }
  }

  const existing = await prisma.bill_deliveries.findUnique({
    where: { bill_id: billId },
  });

  if (existing) {
    throw new DeliveryError(
      "This bill already has a delivery record",
      409
    );
  }

  return prisma.bill_deliveries.create({
    data: {
      bill_id: billId,
      delivery_agent_id: agentId,
      // Only meaningful when no permanent agent was chosen — the
      // schema's mutual-exclusion is already enforced by validation,
      // this just mirrors that here defensively.
      temp_agent_name: agentId ? null : data.temp_agent_name ?? null,
      notes: data.notes ?? null,
    },
    include: deliveryInclude,
  });
}

export async function reassignDeliveryAgent(
  businessId: bigint,
  deliveryId: bigint,
  agentIdRaw: string | null | undefined,
  tempAgentNameRaw: string | null | undefined
) {
  if (agentIdRaw && tempAgentNameRaw) {
    throw new DeliveryError(
      "Choose either an existing agent or a temporary agent name, not both"
    );
  }

  const delivery = await getDeliveryForBusiness(
    businessId,
    deliveryId
  );

  if (!delivery) {
    throw new DeliveryError("Delivery not found", 404);
  }

  if (delivery.status === "CLEARED") {
    throw new DeliveryError(
      "Cannot reassign a cleared delivery",
      409
    );
  }

  let agentId: bigint | null = null;

  if (agentIdRaw) {
    agentId = BigInt(agentIdRaw);

    const agent = await prisma.delivery_agents.findFirst({
      where: { id: agentId, business_id: businessId },
    });

    if (!agent) {
      throw new DeliveryError("Delivery agent not found", 404);
    }
  }

  return prisma.bill_deliveries.update({
    where: { id: delivery.id },
    data: {
      delivery_agent_id: agentId,
      temp_agent_name: agentId ? null : tempAgentNameRaw ?? null,
    },
    include: deliveryInclude,
  });
}

export async function updateDeliveryStatus(
  businessId: bigint,
  deliveryId: bigint,
  newStatus: "SENT" | "REACHED" | "BALANCE" | "CLEARED",
  notes?: string
) {
  const delivery = await getDeliveryForBusiness(
    businessId,
    deliveryId
  );

  if (!delivery) {
    throw new DeliveryError("Delivery not found", 404);
  }

  const allowed = ALLOWED_TRANSITIONS[delivery.status] ?? [];

  if (!allowed.includes(newStatus)) {
    throw new DeliveryError(
      `Cannot transition delivery from ${delivery.status} to ${newStatus}`,
      409
    );
  }

  const now = new Date();

  const data: Prisma.bill_deliveriesUpdateInput = {
    status: newStatus,
    updated_at: now,
    ...(newStatus === "SENT" && { sent_at: now }),
    ...(newStatus === "REACHED" && { reached_at: now }),
    ...(newStatus === "CLEARED" && { cleared_at: now }),
    ...(notes !== undefined && { notes }),
  };

  // Optimistic concurrency: only apply if the status hasn't changed
  // since we read it, so two concurrent transitions can't race.
  const result = await prisma.bill_deliveries.updateMany({
    where: { id: delivery.id, status: delivery.status },
    data,
  });

  if (result.count === 0) {
    throw new DeliveryError(
      "Delivery status changed concurrently — please retry",
      409
    );
  }

  return getDeliveryForBusiness(businessId, deliveryId);
}

export async function getDeliveries(
  businessId: bigint,
  query: ListDeliveriesQuery
) {
  const billsFilter: Prisma.billsWhereInput = {
    business_id: businessId,
  };

  if (query.search) {
    billsFilter.OR = [
      {
        bill_number: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        customer_name_snapshot: {
          contains: query.search,
          mode: "insensitive",
        },
      },
    ];
  }

  const where: Prisma.bill_deliveriesWhereInput = {
    bills: billsFilter,
  };

  if (query.status) {
    where.status = query.status;
  }

  if (query.delivery_agent_id) {
    where.delivery_agent_id = BigInt(query.delivery_agent_id);
  }

  const dateBounds = rangeToBounds(query);

  if (dateBounds) {
    where.created_at = dateBounds;
  }

  return prisma.bill_deliveries.findMany({
    where,
    include: deliveryInclude,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
  });
}

export async function getDeliveryById(
  businessId: bigint,
  deliveryId: bigint
) {
  return getDeliveryForBusiness(businessId, deliveryId);
}

export async function getDeliveryByBillId(
  businessId: bigint,
  billId: bigint
) {
  return prisma.bill_deliveries.findFirst({
    where: {
      bill_id: billId,
      bills: { business_id: businessId },
    },
    include: deliveryInclude,
  });
}
