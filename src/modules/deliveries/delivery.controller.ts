import type {
  NextFunction,
  Response,
} from "express";

import {
  agentIdSchema,
  assignDeliverySchema,
  billIdParamSchema,
  createAgentSchema,
  deliveryIdSchema,
  listAgentsQuerySchema,
  listDeliveriesQuerySchema,
  reassignAgentSchema,
  updateAgentSchema,
  updateDeliveryStatusSchema,
} from "./delivery.validation";

import {
  DeliveryError,
  assignBillDelivery,
  createAgent,
  getAgentById,
  getAgents,
  getDeliveries,
  getDeliveryById,
  getDeliveryByBillId,
  reassignDeliveryAgent,
  setAgentStatus,
  updateAgent,
  updateDeliveryStatus,
} from "./delivery.service";

import { sendXlsx } from "../../utils/xlsx";

import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

function serializeBigInt<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint"
        ? value.toString()
        : value
    )
  );
}

function handleDeliveryError(
  error: unknown,
  res: Response,
  next: NextFunction
) {
  if (error instanceof DeliveryError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });

    return;
  }

  next(error);
}

/* ---------------- DELIVERY AGENTS ---------------- */

export async function createAgentController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const data = createAgentSchema.parse(req.body);

    const agent = await createAgent(businessId, data);

    res.status(201).json({
      success: true,
      message: "Delivery agent created successfully",
      data: serializeBigInt(agent),
    });
  } catch (error) {
    next(error);
  }
}

export async function listAgentsController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const query = listAgentsQuerySchema.parse(req.query);

    const agents = await getAgents(businessId, query);

    res.json({
      success: true,
      count: agents.length,
      data: serializeBigInt(agents),
    });
  } catch (error) {
    next(error);
  }
}

export async function getAgentController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = agentIdSchema.parse({ id: req.params.id });

    const agent = await getAgentById(businessId, id);

    if (!agent) {
      res.status(404).json({
        success: false,
        message: "Delivery agent not found",
      });

      return;
    }

    res.json({ success: true, data: serializeBigInt(agent) });
  } catch (error) {
    next(error);
  }
}

export async function updateAgentController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = agentIdSchema.parse({ id: req.params.id });

    const data = updateAgentSchema.parse(req.body);

    const result = await updateAgent(businessId, id, data);

    if (result.count === 0) {
      res.status(404).json({
        success: false,
        message: "Delivery agent not found",
      });

      return;
    }

    const agent = await getAgentById(businessId, id);

    res.json({
      success: true,
      message: "Delivery agent updated successfully",
      data: serializeBigInt(agent),
    });
  } catch (error) {
    next(error);
  }
}

export async function deactivateAgentController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = agentIdSchema.parse({ id: req.params.id });

    const result = await setAgentStatus(businessId, id, false);

    if (result.count === 0) {
      res.status(404).json({
        success: false,
        message: "Delivery agent not found",
      });

      return;
    }

    const agent = await getAgentById(businessId, id);

    res.json({
      success: true,
      message: "Delivery agent deactivated successfully",
      data: serializeBigInt(agent),
    });
  } catch (error) {
    next(error);
  }
}

export async function activateAgentController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = agentIdSchema.parse({ id: req.params.id });

    const result = await setAgentStatus(businessId, id, true);

    if (result.count === 0) {
      res.status(404).json({
        success: false,
        message: "Delivery agent not found",
      });

      return;
    }

    const agent = await getAgentById(businessId, id);

    res.json({
      success: true,
      message: "Delivery agent activated successfully",
      data: serializeBigInt(agent),
    });
  } catch (error) {
    next(error);
  }
}

/* ---------------- DELIVERIES ---------------- */

export async function assignDeliveryController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const data = assignDeliverySchema.parse(req.body);

    const delivery = await assignBillDelivery(businessId, data);

    res.status(201).json({
      success: true,
      message: "Bill assigned to delivery successfully",
      data: serializeBigInt(delivery),
    });
  } catch (error) {
    handleDeliveryError(error, res, next);
  }
}

export async function listDeliveriesController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const query = listDeliveriesQuerySchema.parse(req.query);

    const deliveries = await getDeliveries(businessId, query);

    res.json({
      success: true,
      count: deliveries.length,
      data: serializeBigInt(deliveries),
    });
  } catch (error) {
    next(error);
  }
}

export async function exportDeliveriesController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const query = listDeliveriesQuerySchema.parse(req.query);

    const deliveries = await getDeliveries(businessId, query);

    const rows = deliveries.map((delivery, index) => ({
      sl_no: index + 1,
      bill_number: delivery.bills.bill_number,
      customer: delivery.bills.customer_name_snapshot ?? "Walk-in Customer",
      bill_amount: Number(delivery.bills.grand_total),
      agent: delivery.delivery_agents?.name ?? "",
      status: delivery.status,
      date: delivery.created_at,
    }));

    await sendXlsx(
      res,
      `deliveries-${Date.now()}.xlsx`,
      "Deliveries",
      [
        { header: "Sl.No.", key: "sl_no", width: 8 },
        { header: "Bill No.", key: "bill_number", width: 16 },
        { header: "Customer", key: "customer", width: 28 },
        { header: "Bill Amount", key: "bill_amount", width: 15, numFmt: "#,##0.00" },
        { header: "Delivery Agent", key: "agent", width: 22 },
        { header: "Status", key: "status", width: 14 },
        { header: "Assigned On", key: "date", width: 22, numFmt: "dd-mmm-yyyy hh:mm" },
      ],
      rows
    );
  } catch (error) {
    next(error);
  }
}

export async function getDeliveryController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = deliveryIdSchema.parse({ id: req.params.id });

    const delivery = await getDeliveryById(businessId, id);

    if (!delivery) {
      res.status(404).json({
        success: false,
        message: "Delivery not found",
      });

      return;
    }

    res.json({ success: true, data: serializeBigInt(delivery) });
  } catch (error) {
    next(error);
  }
}

export async function getDeliveryByBillController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { billId } = billIdParamSchema.parse({
      billId: req.params.billId,
    });

    const delivery = await getDeliveryByBillId(businessId, billId);

    if (!delivery) {
      res.status(404).json({
        success: false,
        message: "No delivery record for this bill",
      });

      return;
    }

    res.json({ success: true, data: serializeBigInt(delivery) });
  } catch (error) {
    next(error);
  }
}

export async function reassignDeliveryAgentController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = deliveryIdSchema.parse({ id: req.params.id });

    const { delivery_agent_id, temp_agent_name } =
      reassignAgentSchema.parse(req.body);

    const delivery = await reassignDeliveryAgent(
      businessId,
      id,
      delivery_agent_id,
      temp_agent_name
    );

    res.json({
      success: true,
      message: "Delivery agent reassigned successfully",
      data: serializeBigInt(delivery),
    });
  } catch (error) {
    handleDeliveryError(error, res, next);
  }
}

export async function updateDeliveryStatusController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = deliveryIdSchema.parse({ id: req.params.id });

    const { status, notes } = updateDeliveryStatusSchema.parse(
      req.body
    );

    const delivery = await updateDeliveryStatus(
      businessId,
      id,
      status,
      notes
    );

    res.json({
      success: true,
      message: "Delivery status updated successfully",
      data: serializeBigInt(delivery),
    });
  } catch (error) {
    handleDeliveryError(error, res, next);
  }
}
