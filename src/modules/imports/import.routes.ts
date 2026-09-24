import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.middleware";

import {
  createImportController,
  getImportController,
  listImportsController,
} from "./import.controller";

const router = Router();

router.use(authMiddleware);

router.post("/", createImportController);

router.get("/", listImportsController);

router.get("/:id", getImportController);

export default router;
