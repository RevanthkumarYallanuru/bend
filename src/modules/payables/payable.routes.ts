import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.middleware";

import {
  createPayableController,
  exportPayablesController,
  getPayableController,
  getPayablesInsightsController,
  listPayablesController,
  recordPayablePaymentController,
} from "./payable.controller";

const router = Router();

router.use(authMiddleware);

router.post("/", createPayableController);

router.get("/", listPayablesController);

// Must come before "/:id" — otherwise "insights"/"export" would be parsed as an id.
router.get("/export", exportPayablesController);
router.get("/insights", getPayablesInsightsController);

router.get("/:id", getPayableController);

router.post("/:id/payments", recordPayablePaymentController);

export default router;
