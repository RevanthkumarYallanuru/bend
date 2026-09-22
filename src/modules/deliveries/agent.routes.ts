import { Router } from "express";

import { authMiddleware } from "../../middleware/auth.middleware";

import {
  activateAgentController,
  createAgentController,
  deactivateAgentController,
  getAgentController,
  listAgentsController,
  updateAgentController,
} from "./delivery.controller";

const router = Router();

router.use(authMiddleware);

router.post("/", createAgentController);

router.get("/", listAgentsController);

router.get("/:id", getAgentController);

router.patch("/:id", updateAgentController);

router.patch("/:id/deactivate", deactivateAgentController);

router.patch("/:id/activate", activateAgentController);

export default router;
