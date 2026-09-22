import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";

import {
  activateCategoryController,
  createCategoryController,
  deactivateCategoryController,
  getCategoryController,
  listCategoriesController,
  updateCategoryController,
} from "./category.controller";

const router = Router();

router.use(authMiddleware);

router.post("/", createCategoryController);

router.get("/", listCategoriesController);

router.get("/:id", getCategoryController);

router.patch("/:id", updateCategoryController);

router.patch(
  "/:id/deactivate",
  deactivateCategoryController
);

router.patch(
  "/:id/activate",
  activateCategoryController
);

export default router;