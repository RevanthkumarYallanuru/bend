import type {
  NextFunction,
  Response,
} from "express";

import type { AuthenticatedRequest } from "../../middleware/auth.middleware";

import {
  loginSchema,
} from "./auth.validation";

import {
  getCurrentUser,
  loginUser,
} from "./auth.service";

export async function loginController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const data = loginSchema.parse(
      req.body
    );

    const result = await loginUser(data);

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: result,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Invalid username or password"
    ) {
      res.status(401).json({
        success: false,
        message: error.message,
      });

      return;
    }

    next(error);
  }
}

export async function meController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });

      return;
    }

    const user = await getCurrentUser(
      req.user.userId
    );

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });

      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: user.id.toString(),
        business_id:
          user.business_id.toString(),
        name: user.name,
        username: user.username,
        role: user.role,
        business: {
          id: user.businesses.id.toString(),
          name: user.businesses.name,
          proprietor_name: user.businesses.proprietor_name,
          name_display_mode: user.businesses.name_display_mode,
          print_language: user.businesses.print_language,
          bill_note: user.businesses.bill_note,
          phone: user.businesses.phone,
          alternate_phone: user.businesses.alternate_phone,
          address: user.businesses.address,
          upi_id: user.businesses.upi_id,
          upi_phone: user.businesses.upi_phone,
          bill_item_row_count: user.businesses.bill_item_row_count,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}