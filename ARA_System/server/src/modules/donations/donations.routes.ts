import { Router } from "express";
import { z } from "zod";
import { resolveOptionalClerkUserId } from "../../middleware/auth.js";
import { createDonation } from "./donations.service.js";

// Public donation submission. Payments themselves go through Stripe's hosted
// checkout (see AGENTS.md - card details never touch SPCA's servers), so this
// endpoint only records the normalized amount/donor details. Identity is
// carried in the body (pre-filled by the frontend from the Clerk session) and
// the Clerk token is resolved when present so signed-in donations can be
// stamped and audited - see AGENTS.md "public-facing features must stay
// usable" (donations are cross-cutting, not staff-only).
const donationSchema = z.object({
	amountCents: z.number().int().positive("A positive donation amount is required"),
	currency: z.string().trim().optional(),
	donorName: z.string().trim().optional(),
	donorEmail: z.string().trim().email("A valid email is required").optional(),
	message: z.string().trim().optional(),
});

export const donationsRouter = Router();

donationsRouter.post("/", async (request, response, next) => {
	const parsed = donationSchema.safeParse(request.body);
	if (!parsed.success) {
		response.status(400).json({ error: "Invalid donation details" });
		return;
	}

	try {
		const signedInUser = await resolveOptionalClerkUserId(request);
		const donation = await createDonation(parsed.data, {
			actorClerkUserId: signedInUser,
		});
		response.status(201).json(donation);
	} catch (error) {
		next(error);
	}
});