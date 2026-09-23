import { Router } from "express";
import { prisma } from "../config/database";

import customerRoutes from "../modules/customers/customer.routes";
import categoryRoutes from "../modules/categories/category.routes";
import itemRoutes from "../modules/items/item.routes";
import authRoutes from "../modules/auth/auth.routes";
import billingRoutes from "../modules/billing/billing.routes";
import paymentRoutes from "../modules/payments/payment.routes";
import ledgerRoutes from "../modules/ledger/ledger.routes";
import deliveryAgentRoutes from "../modules/deliveries/agent.routes";
import deliveryRoutes from "../modules/deliveries/delivery.routes";
import reportRoutes from "../modules/reports/report.routes";
import businessRoutes from "../modules/business/business.routes";
import payableRoutes from "../modules/payables/payable.routes";

const router = Router();

router.get("/health", async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      message:
        "Lakshmi Ganapathi Enterprises API is running",
      database: "connected",
    });
  } catch (error) {
    next(error);
  }
});

router.use("/customers", customerRoutes);

router.use("/categories", categoryRoutes);

router.use("/items", itemRoutes);
router.use("/auth", authRoutes);
router.use("/bills", billingRoutes);
router.use("/payments", paymentRoutes);
router.use("/ledger", ledgerRoutes);
router.use("/delivery-agents", deliveryAgentRoutes);
router.use("/deliveries", deliveryRoutes);
router.use("/reports", reportRoutes);
router.use("/business", businessRoutes);
router.use("/payables", payableRoutes);

export default router;