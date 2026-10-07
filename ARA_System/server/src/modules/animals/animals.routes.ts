import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireClerkSession } from "../../middleware/auth.js";
import { requireStaffOrAbove } from "../../middleware/rbac.js";
import { AiSearchUnavailableError } from "../../shared/errors/applicationError.js";
import {
	deleteAnimal,
	getAnimalById,
	listAllAnimals,
	listPublicAnimals,
	registerAnimal,
	searchAnimalsWithAI,
	updateAnimalProfile,
	uploadAnimalPhoto,
} from "./animals.service.js";

// Rejects free text that's just one letter repeated (e.g. "B, B, B, B" once
// punctuation/spacing is stripped) - the garbage input flagged in the
// lecturer demo. Mirrors validateAnimalForm.ts's isNonsenseText on the
// frontend; kept as a second, server-side check rather than trusting the
// client alone.
function isNotNonsenseText(value: string): boolean {
	const letters = value.replace(/[^a-zA-Z]/g, "");
	if (letters.length === 0) return false;
	return new Set(letters.toLowerCase()).size > 1;
}

const freeText = z
	.string()
	.min(10, "Must be at least 10 characters")
	.refine(isNotNonsenseText, "Doesn't look like a real entry");

// Fields a staff member fills in when registering a new animal. `publicId`
// is deliberately absent here — the server generates it, staff never type
// it. `rescueDate` is also absent - the server sets it automatically to the
// registration date (see registerAnimal in animals.service.ts), staff never
// enter it and it's never part of an edit either.
const animalSchema = z.object({
	name: z.string().min(1),
	type: z.enum(["dog", "cat", "rabbit", "other"]),
	breed: z.string().min(1),
	// Left optional here, matching its pre-existing behaviour - the lecturer
	// confirmed Age validation already works correctly (blocked client-side
	// in validateAnimalForm.ts), so this field is untouched per that feedback.
	estimatedAge: z.string().optional(),
	gender: z.string().optional(),
	colour: z.string().min(1),
	description: freeText,
	behaviour: freeText,
	rescueHistory: freeText,
	// Between 1 and 3 photos - photoUrls[0] is the animal's main/profile
	// picture (used on listing cards and as the profile hero), enforced here
	// and again client-side in validateAnimalForm.ts.
	photoUrls: z.array(z.string().url()).min(1).max(3),
	vaccinationStatus: z.enum(["not_vaccinated", "vaccinated"]),
	size: z.enum(["small", "medium", "large", "extra_large"]),
	// Triage priority is selected by staff during registration (not inherited
	// from any rescue-report urgency). Required - an animal cannot be
	// registered without one.
	veterinaryPriority: z.enum(["critical", "high", "moderate", "routine"]),
});

// Same shape, but every field is optional since an edit can touch just one
// or two fields at a time.
const animalUpdateSchema = animalSchema.partial();

// Natural-language animal search. `trim` collapses nothing on its own, but it
// turns a whitespace-only query into "" so `min(2)` rejects it instead of it
// being embedded as a blank prompt. 300 characters is far longer than any real
// description and bounds the text sent to the embedding provider.
const aiSearchSchema = z.object({
	query: z.string().trim().min(2).max(300),
});

// In-memory storage: the uploaded file lives briefly in a request buffer,
// gets streamed straight to Cloudinary, and is never written to disk.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// Express types a route param as `string | string[]` because a path pattern
// could in principle capture a param more than once. Our routes only ever
// use a single ":id" segment, so this just narrows it back down to a plain
// string (taking the first value in the unexpected array case).
function getIdParam(value: string | string[]): string {
	return Array.isArray(value) ? value[0] : value;
}

export const animalsRouter = Router();

// Public: only medically cleared, not-yet-adopted animals.
animalsRouter.get("/", async (_request, response, next) => {
	try {
		response.json(await listPublicAnimals());
	} catch (error) {
		next(error);
	}
});

// Public: natural-language (AI) search over the same public animals.
//
// No authentication - browsing the catalogue must work with no account, exactly
// like GET "/". RBAC is untouched: this route only ever returns animals the
// public listing would return anyway, ranked by how well they match.
animalsRouter.post("/ai-search", async (request, response, next) => {
	const parsed = aiSearchSchema.safeParse(request.body);
	if (!parsed.success) {
		response.status(400).json({
			error: "Please describe the animal you are looking for, for example: small calm dog good with children.",
		});
		return;
	}

	try {
		const hits = await searchAnimalsWithAI(parsed.data.query);
		response.json({ results: hits.map((h) => h.id) });
	} catch (error) {
		// The provider being unavailable is an expected, recoverable condition,
		// not a bug: tell the caller so the frontend can keep the normal listing
		// and filters on screen instead of showing a failure.
		if (error instanceof AiSearchUnavailableError) {
			response.status(503).json({
				error:
					"AI search is currently unavailable. You can still browse animals or use the normal filters.",
			});
			return;
		}
		next(error);
	}
});

// Staff-only: every animal profile, for the Manage Animal Profiles page.
animalsRouter.get(
	"/staff",
	requireClerkSession,
	requireStaffOrAbove,
	async (_request, response, next) => {
		try {
			response.json(await listAllAnimals());
		} catch (error) {
			next(error);
		}
	},
);

// Staff-only: a single animal's full profile, to pre-fill the edit form.
animalsRouter.get(
	"/:id",
	requireClerkSession,
	requireStaffOrAbove,
	async (request, response, next) => {
		try {
			const animal = await getAnimalById(getIdParam(request.params.id));
			if (!animal) {
				response.status(404).json({ error: "Animal not found" });
				return;
			}
			response.json(animal);
		} catch (error) {
			next(error);
		}
	},
);

// Staff-only: upload one animal photo to Cloudinary and return its URL. The
// frontend calls this once per selected photo, then submits the resulting
// URLs as part of the animal profile.
animalsRouter.post(
	"/upload-photo",
	requireClerkSession,
	requireStaffOrAbove,
	upload.single("photo"),
	async (request, response, next) => {
		if (!request.file) {
			response.status(400).json({ error: "A photo file is required" });
			return;
		}

		try {
			const url = await uploadAnimalPhoto(request.file.buffer);
			response.status(201).json({ url });
		} catch (error) {
			next(error);
		}
	},
);

// Staff-only: register a new animal profile with a server-generated Animal ID.
animalsRouter.post(
	"/",
	requireClerkSession,
	requireStaffOrAbove,
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

// Staff-only: update an existing animal profile.
animalsRouter.patch(
	"/:id",
	requireClerkSession,
	requireStaffOrAbove,
	async (request, response, next) => {
		const parsed = animalUpdateSchema.safeParse(request.body);
		if (!parsed.success) {
			response.status(400).json({ error: "Invalid animal profile" });
			return;
		}

		try {
			const animal = await updateAnimalProfile(getIdParam(request.params.id), parsed.data);
			if (!animal) {
				response.status(404).json({ error: "Animal not found" });
				return;
			}
			response.json(animal);
		} catch (error) {
			next(error);
		}
	},
);

// Staff-only: soft-delete an animal profile (passed away, transferred
// elsewhere, etc). The row and its history stay in the database - see the
// `deletedAt` comment in schema.ts - it's just excluded from every listing.
animalsRouter.delete(
	"/:id",
	requireClerkSession,
	requireStaffOrAbove,
	async (request, response, next) => {
		try {
			const animal = await deleteAnimal(getIdParam(request.params.id));
			if (!animal) {
				response.status(404).json({ error: "Animal not found" });
				return;
			}
			response.json(animal);
		} catch (error) {
			next(error);
		}
	},
);
