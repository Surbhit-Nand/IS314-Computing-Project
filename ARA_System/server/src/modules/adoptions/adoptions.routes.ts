import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireClerkSession } from "../../middleware/auth.js";
import { requireStaffOrAbove } from "../../middleware/rbac.js";
import { getIdParam } from "../../shared/http/routeParams.js";
import {
	ADOPTION_STATUSES,
	getAdoptionApplicationDetail,
	listAdoptionApplications,
	listMyAdoptionApplications,
	submitAdoptionApplication,
	transitionAdoptionApplication,
	uploadAdoptionIdDocument,
} from "./adoptions.service.js";

// Shared optional-text normalizer (empty string -> absent) so optional fields
// don't get stored as blank values.
const optionalText = z
	.string()
	.trim()
	.optional()
	.transform((value) => (value && value !== "" ? value : undefined));

const yesNo = z.enum(["yes", "no"]);

// Exported for validation tests: the wizard payload must satisfy this shape.
export const applicationSchema = z
	.object({
		animalId: z.string().uuid("Link a valid animal"),
		// Section 1: applicant information. Age is a self-declared bracket,
		// not a birth date; minors unlock the guardian fields below.
		fullName: z.string().trim().min(1, "Tell us your full name"),
		contactNumber: z.string().trim().min(1, "Tell us your contact number"),
		applicantEmail: z.string().trim().email("Enter a valid email address"),
		ageBracket: z.enum(["adult", "minor"], "Tell us whether you are 18 or older"),
		guardianName: optionalText,
		guardianContact: optionalText,
		guardianRelationship: z.enum(["parent", "guardian", "other"]).optional(),
		guardianConsent: z.literal(true).optional(),
		// Identification document (photo uploaded first, URL submitted here).
		// Presence only - staff judge the document itself at review.
		idDocumentType: z.enum(
			["voter_card", "passport", "drivers_licence", "other"],
			"Choose your identification document type",
		),
		idDocumentUrl: z.string().trim().url("Upload your identification document photo"),
		// Section 2: household (allergies + respiratory only).
		petAllergies: yesNo,
		respiratoryIssues: yesNo,
		// Section 3: pet experience.
		ownedPetsBefore: yesNo,
		previousPetOutcome: optionalText,
		hasCurrentPets: yesNo,
		currentPetsDetails: optionalText,
		// Section 4: care plan (vet costs + next-of-kin backup contact).
		vetCostPlan: z.string().trim().min(1, "Tell us how you will cover veterinary costs"),
		nextOfKinName: z.string().trim().min(1, "Tell us who looks after the animal when you are unavailable"),
		nextOfKinContact: z.string().trim().min(1, "Tell us your next of kin's contact number"),
		// Section 5: who the adoption is for.
		adoptionFor: z.enum(["self", "gift"], "Choose who this adoption is for"),
	})
	// Conditional fields: minors must supply all four guardian answers (and
	// adults must not send any); past pets require the outcome; current pets
	// require their details. The cat/asthma health gate lives in the service,
	// which is the layer that knows the animal's species.
	.superRefine((data, ctx) => {
		const required = (path: (keyof typeof data)[], message: string) => {
			ctx.addIssue({ code: "custom", path: path as string[], message });
		};
		if (data.ageBracket === "minor") {
			if (!data.guardianName) {
				required(["guardianName"], "Tell us your parent or guardian's full name");
			}
			if (!data.guardianContact) {
				required(["guardianContact"], "Tell us your parent or guardian's contact number");
			}
			if (!data.guardianRelationship) {
				required(["guardianRelationship"], "Choose their relationship to you");
			}
			if (data.guardianConsent !== true) {
				required(
					["guardianConsent"],
					"Your parent or guardian must consent to this adoption",
				);
			}
		} else if (
			data.guardianName ??
			data.guardianContact ??
			data.guardianRelationship ??
			data.guardianConsent
		) {
			required(["guardianName"], "Guardian details are only needed for applicants under 18");
		}
		if (data.ownedPetsBefore === "yes" && !data.previousPetOutcome) {
			required(["previousPetOutcome"], "Tell us what happened to your previous pet(s)");
		}
		if (data.hasCurrentPets === "yes" && !data.currentPetsDetails) {
			required(["currentPetsDetails"], "Tell us about your current pets");
		}
	});

const transitionSchema = z.object({
	status: z.enum(ADOPTION_STATUSES),
	reviewNotes: optionalText,
});

// Whole-year age helper removed with the date-of-birth field: age is now a
// self-declared adult/minor bracket, and minors supply guardian details
// instead of being blocked.

// Maps a handful of known business-rule rejections to a specific status code
// (409 double-approval, 400 invalid lifecycle move / cleared-gate / health
// gate). Anything unrecognized falls through to the app-level 500 handler.
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
		error.message.includes("respiratory condition") ||
		error.message.includes("no longer available for adoption") ||
		error.message.includes("already applied")
	) {
		return 400;
	}
	return null;
}

export const adoptionsRouter = Router();

// In-memory upload handling for the applicant's identification photo: the file
// lives briefly in a request buffer, is streamed straight to Cloudinary, and
// is never written to disk. Images only (staff read the document visually;
// PDFs would need a separate viewer).
const idUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 8 * 1024 * 1024 },
	fileFilter: (_request, file, done) => {
		if (file.mimetype.startsWith("image/")) {
			done(null, true);
		} else {
			done(new Error("Upload a photo of your identification document (JPG or PNG)."));
		}
	},
});

// Signed-in applicant: upload the identification photo before submitting.
// Returns the hosted URL, which the wizard sends back with the application.
// The document's validity is judged by staff at review - this endpoint only
// checks that a real image arrived.
adoptionsRouter.post(
	"/id-document",
	requireClerkSession,
	idUpload.single("document"),
	async (request, response, next) => {
		if (!request.file) {
			response.status(400).json({ error: "An identification document photo is required." });
			return;
		}

		try {
			const url = await uploadAdoptionIdDocument(request.file.buffer);
			response.status(201).json({ url });
		} catch (error) {
			next(error);
		}
	},
);

// Signed-in user: apply to adopt an animal. The applicant identity comes from
// the Clerk session, never from the body.
adoptionsRouter.post("/", requireClerkSession, async (request, response, next) => {
	const parsed = applicationSchema.safeParse(request.body);
	if (!parsed.success) {
		// Surface the first field-level message (all copy is our own zod
		// strings, so nothing internal leaks) instead of a generic 400 -
		// a stale client or a missed field becomes self-diagnosing.
		const firstIssue = parsed.error.issues[0];
		response.status(400).json({
			error: firstIssue?.message ?? "Invalid adoption application details",
		});
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