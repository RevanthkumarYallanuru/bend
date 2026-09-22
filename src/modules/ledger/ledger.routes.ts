import { Router } from "express";

import { authMiddleware, requireRole } from "../../middleware/auth.middleware";

import {
  exportCustomerLedgerController,
  getCustomerBalanceController,
  getCustomerLedgerController,
  setCustomerOpeningBalanceController,
} from "./ledger.controller";

const router = Router();

router.use(authMiddleware);

router.get(
  "/customer/:customerId/balance",
  getCustomerBalanceController
);

router.post(
  "/customer/:customerId/opening-balance",
  requireRole("ADMIN"),
  setCustomerOpeningBalanceController
);

router.get(
  "/customer/:customerId/export",
  exportCustomerLedgerController
);

router.get(
  "/customer/:customerId",
  getCustomerLedgerController
);

export default router;
