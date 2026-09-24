import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.middleware";

import {
  activateSupplierController,
  createSupplierController,
  deactivateSupplierController,
  getSupplierBalanceController,
  getSupplierBalancesController,
  getSupplierController,
  listSuppliersController,
  updateSupplierController,
} from "./supplier.controller";

const router = Router();

router.use(authMiddleware);

router.post("/", createSupplierController);

router.get("/", listSuppliersController);

// Must come before "/:id" — otherwise "balances" would be parsed as an id.
router.get("/balances", getSupplierBalancesController);

router.get("/:id", getSupplierController);

router.get("/:id/balance", getSupplierBalanceController);

router.patch("/:id", updateSupplierController);

router.patch("/:id/deactivate", deactivateSupplierController);

router.patch("/:id/activate", activateSupplierController);

export default router;
