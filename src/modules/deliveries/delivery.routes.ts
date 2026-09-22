import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.middleware";

import {
  assignDeliveryController,
  getDeliveryByBillController,
  getDeliveryController,
  listDeliveriesController,
  reassignDeliveryAgentController,
  updateDeliveryStatusController,
} from "./delivery.controller";

const router = Router();

router.use(authMiddleware);

// Assign a completed bill to delivery.
router.post("/", assignDeliveryController);

// List / filter delivery history.
router.get("/", listDeliveriesController);

// Look up the delivery for a specific bill (before :id so the
// literal "bill" segment isn't swallowed by the :id param).
router.get("/bill/:billId", getDeliveryByBillController);

router.get("/:id", getDeliveryController);

router.patch("/:id/agent", reassignDeliveryAgentController);

router.patch("/:id/status", updateDeliveryStatusController);

export default router;
