import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { requireClerkSession } from "../../middleware/auth.js";
import { requireVeterinaryAccess } from "../../middleware/rbac.js";
import { coordinateEmergencyWithAssistance, emergencyActionSchema, EmergencyError, getEmergencyResponses } from "./emergency.service.js";

export function createEmergencyRouter(dependencies = {
  authenticate: requireClerkSession as RequestHandler,
  authorize: requireVeterinaryAccess as RequestHandler,
  list: getEmergencyResponses,
  coordinate: coordinateEmergencyWithAssistance,
}) {
  const router = Router();
  router.use(dependencies.authenticate, dependencies.authorize);
  router.get("/", async (_request, response, next) => {
    try { response.json(await dependencies.list()); } catch (error) { next(error); }
  });
  router.post("/:animalId", async (request, response, next) => {
    const id = z.string().uuid().safeParse(request.params.animalId);
    const action = emergencyActionSchema.safeParse(request.body);
    if (!id.success || !action.success) { response.status(400).json({ error: "Invalid emergency coordination request" }); return; }
    if (!request.clerkUserId) { response.status(401).json({ error: "Authentication is required" }); return; }
    try { response.json(await dependencies.coordinate(id.data, action.data, request.clerkUserId)); }
    catch (error) {
      if (error instanceof EmergencyError) { response.status(error.status).json({ error: error.message }); return; }
      // No automatic retry of claims/handoffs: the vet must see current state.
      if (typeof error === "object" && error && "code" in error && ["23505", "40001", "40P01", "55P03"].includes(String(error.code))) {
        response.status(409).json({ error: "Emergency response changed or is busy. Refresh the queue and try again." }); return;
      }
      next(error);
    }
  });
  return router;
}
