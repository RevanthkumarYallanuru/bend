import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.middleware";

import {
  createCustomerController,
  listCustomersController,
  getCustomerController,
  updateCustomerController,
  deactivateCustomerController,
  activateCustomerController,
} from "./customer.controller";

import { getCustomerPaymentsController } from "../payments/payment.controller";

const router = Router();

/*
 * All customer APIs require authentication.
 * This MUST come before the routes.
 */
router.use(authMiddleware);

// Create customer
router.post(
  "/",
  createCustomerController
);

// List / search customers
// GET /api/customers
// GET /api/customers?search=Ramesh
router.get(
  "/",
  listCustomersController
);

// Get customer by ID
router.get(
  "/:id",
  getCustomerController
);

// Customer payment history
// GET /api/customers/:id/payments
router.get(
  "/:id/payments",
  getCustomerPaymentsController
);

// Update customer
router.patch(
  "/:id",
  updateCustomerController
);

// Deactivate customer
router.patch(
  "/:id/deactivate",
  deactivateCustomerController
);

// Activate customer
router.patch(
  "/:id/activate",
  activateCustomerController
);

export default router;