import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireClerkSession } from "../../middleware/auth.js";
import { requireStaffOrAbove } from "../../middleware/rbac.js";
import { getIdParam } from "../../shared/http/routeParams.js";
import { adoptionErrorMessage, adoptionErrorStatus } from "./adoptionErrors.js";
import {
	REVIEWER_STATUSES,
	getAdoptionApplicationDetail,
	listAdoptionApplications,
	listMyAdoptionApplications,
	submitAdoptionApplication,
	transitionAdoptionApplication,
	uploadAdoptionIdDocument,
	withdrawAdoptionApplication,
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
		idDocumentUrl: z
			.string()
			.trim()
			.url("Upload your identification document photo")
			// Staff render this as a clickable link, so only https documents are
			// accepted - a javascript:/data: URL must never be storable.
			.refine(
				(value) => value.startsWith("https://"),
				"Upload your identification document photo",
			),
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

// Exported for validation tests: the request body shape for a staff status
// move (status enum + optional review note). Withdrawal is intentionally not a
// reviewer status - it is applicant-only via POST /:id/withdraw.
export const transitionSchema = z.object({
	status: z.enum(REVIEWER_STATUSES),
	reviewNotes: optionalText,
});

// Optional windowing for the two list endpoints. Bounded so a client cannot
// ask for the entire table at once.
export const listQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(500).optional(),
	offset: z.coerce.number().int().min(0).optional(),
});

// Whole-year age helper removed with the date-of-birth field: age is now a
// self-declared adult/minor bracket, and minors supply guardian details
// instead of being blocked.

// Maps a thrown value to the HTTP status the route returns, or null to fall
// through to the app-level 500 handler. Backed by the typed
// AdoptionBusinessError plus unique-violation detection in adoptionErrors.ts:
// the previous string-matching here silently turned a reworded 409 into a 500,
// and a real concurrent double-approval (23505) into a 500 as well.
// Exported for validation tests.
export function businessErrorStatus(error: unknown): number | null {
	return adoptionErrorStatus(error);
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

// multer's fileFilter trusts the client-supplied mimetype, which is trivially
// spoofed. Verify the actual bytes are a JPEG or PNG before uploading, so a
// renamed executable cannot end up in the document bucket.
function looksLikeImage(buffer: Buffer): boolean {
	const isJpeg =
		buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
	const isPng =
		buffer.length > 8 &&
		buffer[0] === 0x89 &&
		buffer[1] === 0x50 &&
		buffer[2] === 0x4e &&
		buffer[3] === 0x47;
	return isJpeg || isPng;
}

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

		if (!looksLikeImage(request.file.buffer)) {
			response
				.status(400)
				.json({ error: "Upload a photo of your identification document (JPG or PNG)." });
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
				error: adoptionErrorMessage(error, "Adoption application failed"),
			});
			return;
		}
		next(error);
	}
});

// Signed-in applicant: withdraw their own application before it is decided.
// Separate from PATCH (staff-only) because the actor is the applicant, not a
// reviewer, and withdrawal is not a reviewer status.
adoptionsRouter.post("/:id/withdraw", requireClerkSession, async (request, response, next) => {
	try {
		const application = await withdrawAdoptionApplication(
			getIdParam(request.params.id),
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
				error: adoptionErrorMessage(error, "Adoption application could not be withdrawn"),
			});
			return;
		}
		next(error);
	}
});

// Signed-in applicant: their own applications (each with its history), for the
// tracking page. Optional ?limit=&offset= windows the result.
adoptionsRouter.get("/mine", requireClerkSession, async (request, response, next) => {
	const query = listQuerySchema.safeParse(request.query);
	if (!query.success) {
		response.status(400).json({ error: "Invalid pagination parameters" });
		return;
	}

	try {
		response.json(await listMyAdoptionApplications(request.clerkUserId as string, query.data));
	} catch (error) {
		next(error);
	}
});

// Staff-only: the full application queue. Optional ?limit=&offset=.
adoptionsRouter.get("/", requireClerkSession, requireStaffOrAbove, async (request, response, next) => {
	const query = listQuerySchema.safeParse(request.query);
	if (!query.success) {
		response.status(400).json({ error: "Invalid pagination parameters" });
		return;
	}

	try {
		response.json(await listAdoptionApplications(query.data));
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
					error: adoptionErrorMessage(error, "Adoption application update failed"),
				});
				return;
			}
			next(error);
		}
	},
);