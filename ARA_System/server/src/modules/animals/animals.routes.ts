import { Router } from "express";
import { z } from "zod";
import { requireClerkSession } from "../../middleware/auth.js";
import { requireManagerOrAdmin } from "../../middleware/rbac.js";
import { registerAnimal, listPublicAnimals } from "./animals.service.js";

const animalSchema = z.object({
	publicId: z.string().min(1),
	name: z.string().min(1),
	type: z.enum(["dog", "cat", "rabbit", "other"]),
	breed: z.string().optional(),
	estimatedAge: z.string().optional(),
	gender: z.string().optional(),
	colour: z.string().optional(),
	rescueDate: z.string().optional(),
	behaviour: z.string().optional(),
	rescueHistory: z.string().optional(),
	photoUrls: z.array(z.string().url()).default([]),
});

export const animalsRouter = Router();

animalsRouter.get("/", async (_request, response, next) => {
	try {
		response.json(await listPublicAnimals());
	} catch (error) {
		next(error);
	}
});

animalsRouter.post(
	"/",
	requireClerkSession,
	requireManagerOrAdmin,
	async (request, response, next) => {
		const parsed = animalSchema.safeParse(request.body);
		if (!parsed.success) {
			response.status(400).json({ error: "Invalid animal profile" });
			return;
		}

		try {
			response.status(201).json(await registerAnimal(parsed.data));
		} catch (error) {
			next(error);
		}
	},
);
