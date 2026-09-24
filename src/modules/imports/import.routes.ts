import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.middleware";

import {
  createImportController,
  exportImportsController,
  getImportController,
  listImportsController,
} from "./import.controller";

const router = Router();

router.use(authMiddleware);

router.post("/", createImportController);

router.get("/", listImportsController);

// Must come before "/:id" — otherwise "export" would be parsed as an id.
router.get("/export", exportImportsController);

router.get("/:id", getImportController);

export default router;
