import { Router } from "express";
import { createDonation } from "./donations.service.js";

export const donationsRouter = Router();

// Public: anyone can donate, anonymously or signed in. Identity is carried
// in the body (pre-filled by the frontend from the Clerk session), so no
// Clerk token is required here - see AGENTS.md "public-facing features must
// stay usable" (donations are cross-cutting, not staff-only).
donationsRouter.post("/", async (request, response, next) => {
	try {
		const donation = await createDonation(request.body ?? {});
		response.status(201).json(donation);
	} catch (error) {
		if (error instanceof Error && /amount|currency/i.test(error.message)) {
			response.status(400).json({ error: error.message });
			return;
		}
		next(error);
	}
});