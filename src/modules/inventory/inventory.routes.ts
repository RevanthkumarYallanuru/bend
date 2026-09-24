import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.middleware";

import {
  getItemStockMovementsController,
  getStockTallyController,
} from "./inventory.controller";

const router = Router();

router.use(authMiddleware);

router.get("/tally", getStockTallyController);

router.get("/items/:id/movements", getItemStockMovementsController);

export default router;
