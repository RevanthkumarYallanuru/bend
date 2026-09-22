import { Router } from "express";
import { authMiddleware, requireRole } from "../../middleware/auth.middleware";

import {
  getBusinessSettingsController,
  updateBusinessSettingsController,
} from "./business.controller";

const router = Router();

router.use(authMiddleware);

router.get("/settings", getBusinessSettingsController);

router.patch(
  "/settings",
  requireRole("ADMIN"),
  updateBusinessSettingsController
);

export default router;
