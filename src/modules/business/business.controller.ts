import type { NextFunction, Response } from "express";

import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

import { updateBusinessSettingsSchema } from "./business.validation";
import { getBusinessSettings, updateBusinessSettings } from "./business.service";

function serializeBigInt<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

export async function getBusinessSettingsController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const business = await getBusinessSettings(req.user!.businessId);

    res.status(200).json({
      success: true,
      data: serializeBigInt(business),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateBusinessSettingsController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const data = updateBusinessSettingsSchema.parse(req.body);

    const business = await updateBusinessSettings(req.user!.businessId, data);

    res.status(200).json({
      success: true,
      message: "Business settings updated successfully",
      data: serializeBigInt(business),
    });
  } catch (error) {
    next(error);
  }
}
