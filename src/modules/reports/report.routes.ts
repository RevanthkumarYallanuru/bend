import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.middleware";

import {
  exportItemSalesReportController,
  exportOutstandingReportController,
  exportPaymentsReportController,
  exportSalesReportController,
  getDashboardController,
  getItemSalesReportController,
  getOutstandingReportController,
  getPaymentsReportController,
  getSalesReportController,
} from "./report.controller";

const router = Router();

router.use(authMiddleware);

router.get("/dashboard", getDashboardController);

router.get("/sales", getSalesReportController);
router.get("/sales/export", exportSalesReportController);

router.get("/payments", getPaymentsReportController);
router.get("/payments/export", exportPaymentsReportController);

router.get(
  "/customers/outstanding",
  getOutstandingReportController
);
router.get(
  "/customers/outstanding/export",
  exportOutstandingReportController
);

router.get("/items", getItemSalesReportController);
router.get("/items/export", exportItemSalesReportController);

export default router;
