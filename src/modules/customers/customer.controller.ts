import type {
  NextFunction,
  Response,
} from "express";

import {
  customerIdSchema,
  createCustomerSchema,
  updateCustomerSchema,
} from "./customer.validation";

import {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  setCustomerStatus,
} from "./customer.service";

import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

/**
 * Convert BigInt values returned by Prisma into strings
 * so they can safely be returned as JSON.
 */
function serializeBigInt<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint"
        ? value.toString()
        : value
    )
  );
}

/**
 * CREATE CUSTOMER
 */
export async function createCustomerController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const data = createCustomerSchema.parse(req.body);

    const customer = await createCustomer(
      businessId,
      data
    );

    res.status(201).json({
      success: true,
      message: "Customer created successfully",
      data: serializeBigInt(customer),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET / SEARCH CUSTOMERS
 *
 * Supports:
 * GET /api/customers
 * GET /api/customers?search=Ramesh
 */
export async function listCustomersController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : undefined;

    const activeOnly = req.query.activeOnly === "true";

    const customers = await getCustomers(
      businessId,
      search,
      activeOnly
    );

    res.json({
      success: true,
      count: customers.length,
      data: serializeBigInt(customers),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET CUSTOMER BY ID
 */
export async function getCustomerController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = customerIdSchema.parse({
      id: req.params.id,
    });

    const customer = await getCustomerById(
      businessId,
      id
    );

    if (!customer) {
      res.status(404).json({
        success: false,
        message: "Customer not found",
      });

      return;
    }

    res.json({
      success: true,
      data: serializeBigInt(customer),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * UPDATE CUSTOMER
 */
export async function updateCustomerController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = customerIdSchema.parse({
      id: req.params.id,
    });

    const data = updateCustomerSchema.parse(
      req.body
    );

    const result = await updateCustomer(
      businessId,
      id,
      data
    );

    if (result.count === 0) {
      res.status(404).json({
        success: false,
        message: "Customer not found",
      });

      return;
    }

    const customer = await getCustomerById(
      businessId,
      id
    );

    res.json({
      success: true,
      message: "Customer updated successfully",
      data: serializeBigInt(customer),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DEACTIVATE CUSTOMER
 */
export async function deactivateCustomerController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = customerIdSchema.parse({
      id: req.params.id,
    });

    const result = await setCustomerStatus(
      businessId,
      id,
      false
    );

    if (result.count === 0) {
      res.status(404).json({
        success: false,
        message: "Customer not found",
      });

      return;
    }

    const customer = await getCustomerById(
      businessId,
      id
    );

    res.json({
      success: true,
      message: "Customer deactivated successfully",
      data: serializeBigInt(customer),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * ACTIVATE CUSTOMER
 */
export async function activateCustomerController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = customerIdSchema.parse({
      id: req.params.id,
    });

    const result = await setCustomerStatus(
      businessId,
      id,
      true
    );

    if (result.count === 0) {
      res.status(404).json({
        success: false,
        message: "Customer not found",
      });

      return;
    }

    const customer = await getCustomerById(
      businessId,
      id
    );

    res.json({
      success: true,
      message: "Customer activated successfully",
      data: serializeBigInt(customer),
    });
  } catch (error) {
    next(error);
  }
}