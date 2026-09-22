import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";

import {
  activateItemController,
  createItemController,
  createItemUnitController,
  deactivateItemController,
  getItemController,
  listItemUnitsController,
  listItemsController,
  updateItemController,
  updateItemUnitController,
} from "./item.controller";

const router = Router();

router.use(authMiddleware);

router.post("/", createItemController);

router.get("/", listItemsController);

router.get("/:id", getItemController);

router.patch("/:id", updateItemController);

router.patch(
  "/:id/deactivate",
  deactivateItemController
);

router.patch(
  "/:id/activate",
  activateItemController
);

router.get(
  "/:id/units",
  listItemUnitsController
);

router.post(
  "/:id/units",
  createItemUnitController
);

router.patch(
  "/:id/units/:unitId",
  updateItemUnitController
);

export default router;