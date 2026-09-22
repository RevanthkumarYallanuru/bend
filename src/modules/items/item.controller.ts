import type {
  NextFunction,
  Response,
} from "express";

import {
  createItemSchema,
  createItemUnitSchema,
  itemIdSchema,
  itemUnitIdSchema,
  updateItemSchema,
  updateItemUnitSchema,
} from "./item.validation";

import {
  createItem,
  createItemUnit,
  getItemById,
  getItemUnits,
  getItems,
  setItemStatus,
  updateItem,
  updateItemUnit,
} from "./item.service";

import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

function serializeBigInt<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint"
        ? value.toString()
        : value
    )
  );
}

export async function createItemController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const data = createItemSchema.parse(req.body);

    const item = await createItem(
      req.user!.businessId,
      data
    );

    res.status(201).json({
      success: true,
      message: "Item created successfully",
      data: serializeBigInt(item),
    });
  } catch (error) {
    next(error);
  }
}

export async function listItemsController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : undefined;

    const categoryId =
      typeof req.query.categoryId === "string"
        ? BigInt(req.query.categoryId)
        : undefined;

    const includeInactive =
      req.query.includeInactive === "true";

    const items = await getItems(
      req.user!.businessId,
      search,
      categoryId,
      includeInactive
    );

    res.status(200).json({
      success: true,
      count: items.length,
      data: serializeBigInt(items),
    });
  } catch (error) {
    next(error);
  }
}

export async function getItemController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = itemIdSchema.parse(req.params);

    const item = await getItemById(
      req.user!.businessId,
      id
    );

    if (!item) {
      res.status(404).json({
        success: false,
        message: "Item not found",
      });

      return;
    }

    res.status(200).json({
      success: true,
      data: serializeBigInt(item),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateItemController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = itemIdSchema.parse(req.params);

    const data = updateItemSchema.parse(req.body);

    const result = await updateItem(
      req.user!.businessId,
      id,
      data
    );

    if (result.count === 0) {
      res.status(404).json({
        success: false,
        message: "Item not found",
      });

      return;
    }

    const item = await getItemById(
      req.user!.businessId,
      id
    );

    res.status(200).json({
      success: true,
      message: "Item updated successfully",
      data: serializeBigInt(item),
    });
  } catch (error) {
    next(error);
  }
}

export async function deactivateItemController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = itemIdSchema.parse(req.params);

    const result = await setItemStatus(
      req.user!.businessId,
      id,
      false
    );

    if (result.count === 0) {
      res.status(404).json({
        success: false,
        message: "Item not found",
      });

      return;
    }

    res.status(200).json({
      success: true,
      message: "Item deactivated successfully",
    });
  } catch (error) {
    next(error);
  }
}

export async function activateItemController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = itemIdSchema.parse(req.params);

    const result = await setItemStatus(
      req.user!.businessId,
      id,
      true
    );

    if (result.count === 0) {
      res.status(404).json({
        success: false,
        message: "Item not found",
      });

      return;
    }

    res.status(200).json({
      success: true,
      message: "Item activated successfully",
    });
  } catch (error) {
    next(error);
  }
}

/* ---------------- ITEM UNITS ---------------- */

export async function listItemUnitsController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = itemIdSchema.parse(req.params);

    const units = await getItemUnits(
      req.user!.businessId,
      id
    );

    res.status(200).json({
      success: true,
      count: units.length,
      data: serializeBigInt(units),
    });
  } catch (error) {
    next(error);
  }
}

export async function createItemUnitController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = itemIdSchema.parse(req.params);

    const data = createItemUnitSchema.parse(
      req.body
    );

    const unit = await createItemUnit(
      req.user!.businessId,
      id,
      data
    );

    res.status(201).json({
      success: true,
      message: "Item unit created successfully",
      data: serializeBigInt(unit),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateItemUnitController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { id, unitId } =
      itemUnitIdSchema.parse(req.params);

    const data = updateItemUnitSchema.parse(
      req.body
    );

    const unit = await updateItemUnit(
      req.user!.businessId,
      id,
      unitId,
      data
    );

    res.status(200).json({
      success: true,
      message: "Item unit updated successfully",
      data: serializeBigInt(unit),
    });
  } catch (error) {
    next(error);
  }
}