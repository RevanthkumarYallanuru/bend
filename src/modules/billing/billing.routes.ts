import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.middleware";

import {
  cancelBillController,
  createBillController,
  getBillByNumberController,
  getBillController,
  listBillsController,
} from "./billing.controller";

const router = Router();

router.use(authMiddleware);

router.post("/", createBillController);

router.get("/", listBillsController);

router.get(
  "/number/:billNumber",
  getBillByNumberController
);

router.get("/:id", getBillController);

router.patch("/:id/cancel", cancelBillController);

export default router;
