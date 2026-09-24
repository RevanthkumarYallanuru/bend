import type { NextFunction, Response } from "express";

import {
  createSupplierSchema,
  supplierIdSchema,
  updateSupplierSchema,
} from "./supplier.validation";

import {
  createSupplier,
  getSupplierBalance,
  getSupplierBalances,
  getSupplierById,
  getSuppliers,
  setSupplierStatus,
  updateSupplier,
} from "./supplier.service";

import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

function serializeBigInt<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

export async function createSupplierController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;
    const userId = req.user!.userId;

    const data = createSupplierSchema.parse(req.body);

    const supplier = await createSupplier(businessId, userId, data);

    res.status(201).json({
      success: true,
      message: "Supplier created successfully",
      data: serializeBigInt(supplier),
    });
  } catch (error) {
    next(error);
  }
}

export async function listSuppliersController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : undefined;
    const activeOnly = req.query.activeOnly === "true";

    const suppliers = await getSuppliers(businessId, search, activeOnly);

    res.json({
      success: true,
      count: suppliers.length,
      data: serializeBigInt(suppliers),
    });
  } catch (error) {
    next(error);
  }
}

export async function getSupplierBalancesController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const balances = await getSupplierBalances(businessId);

    res.json({
      success: true,
      data: balances,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSupplierController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = supplierIdSchema.parse({ id: req.params.id });

    const supplier = await getSupplierById(businessId, id);

    if (!supplier) {
      res.status(404).json({ success: false, message: "Supplier not found" });
      return;
    }

    res.json({ success: true, data: serializeBigInt(supplier) });
  } catch (error) {
    next(error);
  }
}

export async function getSupplierBalanceController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = supplierIdSchema.parse({ id: req.params.id });

    const balance = await getSupplierBalance(businessId, id);

    res.json({ success: true, data: balance });
  } catch (error) {
    next(error);
  }
}

export async function updateSupplierController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = supplierIdSchema.parse({ id: req.params.id });

    const data = updateSupplierSchema.parse(req.body);

    const result = await updateSupplier(businessId, id, data);

    if (result.count === 0) {
      res.status(404).json({ success: false, message: "Supplier not found" });
      return;
    }

    const supplier = await getSupplierById(businessId, id);

    res.json({
      success: true,
      message: "Supplier updated successfully",
      data: serializeBigInt(supplier),
    });
  } catch (error) {
    next(error);
  }
}

export async function deactivateSupplierController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = supplierIdSchema.parse({ id: req.params.id });

    const result = await setSupplierStatus(businessId, id, false);

    if (result.count === 0) {
      res.status(404).json({ success: false, message: "Supplier not found" });
      return;
    }

    const supplier = await getSupplierById(businessId, id);

    res.json({
      success: true,
      message: "Supplier deactivated successfully",
      data: serializeBigInt(supplier),
    });
  } catch (error) {
    next(error);
  }
}

export async function activateSupplierController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = supplierIdSchema.parse({ id: req.params.id });

    const result = await setSupplierStatus(businessId, id, true);

    if (result.count === 0) {
      res.status(404).json({ success: false, message: "Supplier not found" });
      return;
    }

    const supplier = await getSupplierById(businessId, id);

    res.json({
      success: true,
      message: "Supplier activated successfully",
      data: serializeBigInt(supplier),
    });
  } catch (error) {
    next(error);
  }
}
