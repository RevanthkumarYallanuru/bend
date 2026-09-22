import { Router } from "express";

import {
  authMiddleware,
  requireRole,
} from "../../middleware/auth.middleware";

import {
  cancelPaymentController,
  createPaymentController,
  getPaymentByNumberController,
  getPaymentController,
  listPaymentsController,
} from "./payment.controller";

const router = Router();

router.use(authMiddleware);

router.post("/", createPaymentController);

router.get("/", listPaymentsController);

router.get(
  "/number/:paymentNumber",
  getPaymentByNumberController
);

router.get("/:id", getPaymentController);

// Financial reversal is a sensitive correction; restrict to ADMIN.
router.patch(
  "/:id/cancel",
  requireRole("ADMIN"),
  cancelPaymentController
);

export default router;
