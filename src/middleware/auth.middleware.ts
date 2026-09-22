import type {
  NextFunction,
  Request,
  Response,
} from "express";

import jwt from "jsonwebtoken";

export interface AuthUser {
  userId: bigint;
  businessId: bigint;
  role: "ADMIN" | "STAFF";
  username: string;
}

export interface AuthenticatedRequest
  extends Request {
  user?: AuthUser;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      "JWT_SECRET is not configured"
    );
  }

  return secret;
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const header =
      req.headers.authorization;

    if (!header) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });

      return;
    }

    if (!header.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message:
          "Invalid authorization format",
      });

      return;
    }

    const token = header.substring(7);

    const payload = jwt.verify(
      token,
      getJwtSecret()
    ) as {
      userId: string;
      businessId: string;
      role: "ADMIN" | "STAFF";
      username: string;
    };

    req.user = {
      userId: BigInt(payload.userId),
      businessId: BigInt(payload.businessId),
      role: payload.role,
      username: payload.username,
    };

    next();
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}

export function requireRole(
  ...roles: Array<"ADMIN" | "STAFF">
) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });

      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });

      return;
    }

    next();
  };
}