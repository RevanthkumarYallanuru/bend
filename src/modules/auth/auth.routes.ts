import { Router } from "express";

import {
  authMiddleware,
} from "../../middleware/auth.middleware";

import {
  loginController,
  meController,
} from "./auth.controller";

const router = Router();

router.post(
  "/login",
  loginController
);

router.get(
  "/me",
  authMiddleware,
  meController
);

export default router;