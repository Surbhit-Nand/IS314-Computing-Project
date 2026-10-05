import { Router } from "express";
import { z } from "zod";
import { requireClerkSession } from "../../middleware/auth.js";
import { requireStaffOrAbove } from "../../middleware/rbac.js";
import {
	ADOPTION_STATUSES,
	getAdoptionApplicationDetail,
	listAdoptionApplications,
	listMyAdoptionApplications,
	submitAdoptionApplication,
	transitionAdoptionApplication,
} from "./adoptions.service.js";

// Shared optional-text normalizer (empty string -> absent) so optional fields
// don't get stored as blank values.
const optionalText = z
	.string()
	.trim()
	.optional()
	.transform((value) => (value && value !== "" ? value : undefined));

const yesNo = z.enum(["yes", "no"]);

const applicationSchema = z
	.object({
		animalId: z.string().uuid("Link a valid animal"),
		// Section 1: applicant information.
		fullName: z.string().trim().min(1, "Tell us your full name"),
		contactNumber: z.string().trim().min(1, "Tell us your contact number"),
		applicantEmail: z.string().trim().email("Enter a valid email address"),
		residentialAddress: z.string().trim().min(1, "Tell us your residential address"),
		dateOfBirth: z.string().trim().min(1, "Tell us your date of birth or age"),
		// Section 2: household & living situation.
		housingType: z.enum(["house", "apartment", "other"], "Choose your housing type"),
		tenure: z.enum(["own", "rent"], "Choose whether you own or rent"),
		landlordPetsAllowed: z.enum(["yes", "no", "not_sure"]).optional(),
		fencedYard: z.enum(["yes", "no", "na"], "Tell us about your outdoor space"),
		householdSize: z.coerce.number().int().min(1, "Enter the number of people in your household"),
		childrenAges: optionalText,
		petAllergies: yesNo,
		// Section 3: pet experience.
		ownedPetsBefore: yesNo,
		previousPetOutcome: optionalText,
		hasCurrentPets: yesNo,
		currentPetsDetails: optionalText,
		// Section 4: lifestyle & care plan.
		aloneHours: z.string().trim().min(1, "Tell us how long the animal would be alone each day"),
		primaryCaregiver: z.string().trim().min(1, "Tell us who will be the primary caregiver"),
		dailyRoutine: z.string().trim().min(1, "Describe the daily exercise and care routine"),
		vetCostPlan: z.string().trim().min(1, "Tell us how you will cover veterinary costs"),
		travelCarePlan: z.string().trim().min(1, "Tell us your care plan when you travel"),
		// Section 5: motivation.
		adoptionMotivation: z.string().trim().min(1, "Tell us why you want to adopt this animal"),
		adoptionFor: z.enum(["self", "gift"], "Choose who this adoption is for"),
		householdAgreement: yesNo,
		// Section 6: required acknowledgements.
		consentHomeVisit: z.literal(true, "Please consent to a potential home visit"),
		agreeReturnToSpca: z.literal(true, "Please agree to return the animal to SPCA Fiji if needed"),
		confirmAccurate: z.literal(true, "Please confirm your information is accurate"),
	})
	// Conditional fields: renting requires the landlord question; past pets
	// require the outcome; current pets require their details.
	.superRefine((data, ctx) => {
		if (data.tenure === "rent" && !data.landlordPetsAllowed) {
			ctx.addIssue({
				code: "custom",
				path: ["landlordPetsAllowed"],
				message: "Renters must tell us whether pets are allowed",
			});
		}
		if (data.ownedPetsBefore === "yes" && !data.previousPetOutcome) {
			ctx.addIssue({
				code: "custom",
				path: ["previousPetOutcome"],
				message: "Tell us what happened to your previous pet(s)",
			});
		}
		if (data.hasCurrentPets === "yes" && !data.currentPetsDetails) {
			ctx.addIssue({
				code: "custom",
				path: ["currentPetsDetails"],
				message: "Tell us about your current pets",
			});
		}
	});

const transitionSchema = z.object({
	status: z.enum(ADOPTION_STATUSES),
	reviewNotes: optionalText,
});

// Express types a route param as `string | string[]` because a path pattern
// could in principle capture a param more than once. Our routes only ever
// use a single ":id" segment, so this just narrows it back down to a plain
// string (taking the first value in the unexpected array case).
function getIdParam(value: string | string[]): string {
	return Array.isArray(value) ? value[0] : value;
}

// Maps a handful of known business-rule rejections to a specific status code
// (409 double-approval, 400 invalid lifecycle move / cleared-gate). Anything
// unrecognized falls through to the app-level 500 handler.
function businessErrorStatus(error: unknown): number | null {
	if (!(error instanceof Error)) {
		return null;
	}
	if (error.message.startsWith("Another applicant has already been approved")) {
		return 409;
	}
	if (error.message.startsWith("Adoption application cannot move")) {
		return 400;
	}
	if (
		error.message.startsWith("Add a review note") ||
		error.message.includes("medically cleared") ||
		error.message.includes("no longer available for adoption") ||
		error.message.includes("already applied")
	) {
		return 400;
	}
	return null;
}

export const adoptionsRouter = Router();

// Signed-in user: apply to adopt an animal. The applicant identity comes from
// the Clerk session, never from the body.
adoptionsRouter.post("/", requireClerkSession, async (request, response, next) => {
	const parsed = applicationSchema.safeParse(request.body);
	if (!parsed.success) {
		response.status(400).json({ error: "Invalid adoption application details" });
		return;
	}

	try {
		const application = await submitAdoptionApplication(
			parsed.data,
			request.clerkUserId as string,
		);
		response.status(201).json(application);
	} catch (error) {
		const status = businessErrorStatus(error);
		if (status !== null) {
			response.status(status).json({
				error: error instanceof Error ? error.message : "Adoption application failed",
			});
			return;
		}
		next(error);
	}
});

// Signed-in applicant: their own applications, for the tracking page.
adoptionsRouter.get("/mine", requireClerkSession, async (request, response, next) => {
	try {
		response.json(await listMyAdoptionApplications(request.clerkUserId as string));
	} catch (error) {
		next(error);
	}
});

// Staff-only: the full application queue.
adoptionsRouter.get("/", requireClerkSession, requireStaffOrAbove, async (_request, response, next) => {
	try {
		response.json(await listAdoptionApplications());
	} catch (error) {
		next(error);
	}
});

// Staff-only: one application in full, including its status history so the
// review queue can show when every step happened.
adoptionsRouter.get(
	"/:id",
	requireClerkSession,
	requireStaffOrAbove,
	async (request, response, next) => {
		try {
			const application = await getAdoptionApplicationDetail(getIdParam(request.params.id));
			if (!application) {
				response.status(404).json({ error: "Adoption application not found" });
				return;
			}
			response.json(application);
		} catch (error) {
			next(error);
		}
	},
);

// Staff-only: move an application through its lifecycle. Audited.
adoptionsRouter.patch(
	"/:id",
	requireClerkSession,
	requireStaffOrAbove,
	async (request, response, next) => {
		const parsed = transitionSchema.safeParse(request.body);
		if (!parsed.success) {
			response.status(400).json({ error: "Invalid adoption application update" });
			return;
		}

		try {
			const application = await transitionAdoptionApplication(
				getIdParam(request.params.id),
				parsed.data,
				request.clerkUserId as string,
			);
			if (!application) {
				response.status(404).json({ error: "Adoption application not found" });
				return;
			}
			response.json(application);
		} catch (error) {
			const status = businessErrorStatus(error);
			if (status !== null) {
				response.status(status).json({
					error: error instanceof Error ? error.message : "Adoption application update failed",
				});
				return;
			}
			next(error);
		}
	},
);