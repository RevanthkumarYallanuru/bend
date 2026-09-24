import type { NextFunction, Response } from "express";

import { itemIdParamSchema } from "./inventory.validation";
import {
  InventoryError,
  getItemStockMovements,
  getStockTally,
} from "./inventory.service";

import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

function serializeBigInt<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

export async function getStockTallyController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const tally = await getStockTally(businessId);

    res.json({
      success: true,
      count: tally.length,
      data: tally,
    });
  } catch (error) {
    next(error);
  }
}

export async function getItemStockMovementsController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const businessId = req.user!.businessId;

    const { id } = itemIdParamSchema.parse({ id: req.params.id });

    const movements = await getItemStockMovements(businessId, id);

    res.json({
      success: true,
      count: movements.length,
      data: serializeBigInt(movements),
    });
  } catch (error) {
    if (error instanceof InventoryError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }
    next(error);
  }
}
