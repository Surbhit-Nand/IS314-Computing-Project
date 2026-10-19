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
import {
	formatAnimalName,
	formatEstimatedAge,
	parseEstimatedAge,
	validateAnimalName,
	validateEstimatedAgeText,
	validateNarrativeText,
} from "./animalFieldRules.js";
import {
	findBreedName,
	findBreedNames,
	findListedSpeciesName,
	findOtherSpeciesBreeds,
} from "./breeds.repository.js";
import { resolveSpeciesAndBreed, type BreedLookups } from "./speciesBreed.js";

const BREED_LOOKUPS: BreedLookups = { findBreedName, findListedSpeciesName };

// Description / Behaviour / Rescue history: length, word-count, real-letters
// and no-repetition rules from animalFieldRules.ts - the same rules the form
// runs (validateAnimalForm.ts), enforced again here rather than trusting the
// client alone.
function narrativeText(fieldLabel: string) {
	return z.string().superRefine((value, context) => {
		const problem = validateNarrativeText(value, fieldLabel);
		if (problem) context.addIssue({ code: "custom", message: problem });
	});
}

// Species staff can register/edit. "rabbit" is still a value of the DB enum
// but is no longer accepted: rabbits, hamsters, snakes etc. are "other", with
// the typed species in `speciesName` (migrations 0015 and 0016 converted the
// existing rows).
const speciesSchema = z.enum(["dog", "cat", "other"], { error: "Species must be Dog, Cat or Other." });

// Fields a staff member fills in when registering a new animal. `publicId`
// is deliberately absent here — the server generates it, staff never type
// it. `rescueDate` is also absent - the server sets it automatically to the
// registration date (see registerAnimal in animals.service.ts), staff never
// enter it and it's never part of an edit either.
const animalSchema = z.object({
	// Letters (plus spaces, hyphens, apostrophes), 2-30 characters, no junk;
	// saved with each word capitalised (validateAnimalName / formatAnimalName).
	name: z
		.string()
		.superRefine((value, context) => {
			const problem = validateAnimalName(value);
			if (problem) context.addIssue({ code: "custom", message: problem });
		})
		.transform(formatAnimalName),
	type: speciesSchema,
	// Required when type is "other" (the typed species, e.g. "Rabbit");
	// ignored and cleared for dogs and cats. Checked in resolveSpeciesAndBreed().
	speciesName: z.string().optional(),
	// Checked further in resolveSpeciesAndBreed() (speciesBreed.ts): a listed
	// dog/cat breed is stored in the table's spelling, anything else must pass
	// the typed-breed rules.
	breed: z.string().trim().min(1, "Breed is required."),
	// The form's number + unit, stored as text in the existing format
	// ("6 Months", "2.5 Years"). Checked with the same rules as the form
	// (validateEstimatedAgeText) and re-formatted, so junk like "211345r6tyu8"
	// can't be saved even by bypassing the form.
	estimatedAge: z
		.string()
		.superRefine((value, context) => {
			const problem = validateEstimatedAgeText(value);
			if (problem) context.addIssue({ code: "custom", message: problem });
		})
		.transform((value) => {
			const parsed = parseEstimatedAge(value);
			return parsed ? formatEstimatedAge(parsed.value, parsed.unit) : value;
		}),
	gender: z.string().optional(),
	colour: z.string().min(1),
	description: narrativeText("Description"),
	behaviour: narrativeText("Behaviour"),
	rescueHistory: narrativeText("Rescue history"),
	// Between 1 and 3 photos - photoUrls[0] is the animal's main/profile
	// picture (used on listing cards and as the profile hero), enforced here
	// and again client-side in validateAnimalForm.ts.
	photoUrls: z.array(z.string().url()).min(1).max(3),
	vaccinationStatus: z.enum(["not_vaccinated", "vaccinated"]),
	size: z.enum(["small", "medium", "large", "extra_large"]),
	// Veterinary priority (triage criticality) set by staff so the animal
	// reaches the vet queue. Optional here; a create without one gets
	// DEFAULT_VETERINARY_PRIORITY, an edit without one leaves it unchanged.
	// Self-contained so it's easy to remove if the group moves it to the vet
	// module (see src/features/animals/VeterinaryPriorityField.tsx).
	veterinaryPriority: z
		.enum(["critical", "high", "moderate", "routine"], {
			error: "Veterinary priority must be Critical, High, Moderate or Routine.",
		})
		.optional(),
});

// Safety net only: the Register form makes staff choose a priority, so this
// applies just to API requests that send none. Moderate = "stable condition
// that still requires veterinary assessment", true of any new intake.
const DEFAULT_VETERINARY_PRIORITY = "moderate";

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

// The message staff see when a create/edit is rejected: the rule's own
// wording for custom checks, otherwise "<field>: <zod message>".
function firstIssueMessage(error: z.ZodError): string {
	const issue = error.issues[0];
	if (!issue) return "Invalid animal profile";
	if (issue.code === "custom" || issue.path.length === 0) return issue.message;
	return `${issue.path.join(".")}: ${issue.message}`;
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

// Breed list for a typed "other" species (e.g. /breeds/other/guinea%20pig),
// matched case-insensitively: { speciesName: "Guinea Pig", breeds: [...] },
// or { speciesName: null, breeds: [] } when the species has no list (Snake).
// Public, read-only reference data. Declared before GET "/:id".
animalsRouter.get("/breeds/other/:speciesName", async (request, response, next) => {
	try {
		const list = await findOtherSpeciesBreeds(getIdParam(request.params.speciesName));
		response.json(list ?? { speciesName: null, breeds: [] });
	} catch (error) {
		next(error);
	}
});

// Breeds for the registration/edit Breed dropdown, loaded from the breeds
// table. Public, read-only reference data (no animal data). Declared before
// GET "/:id" so "breeds" is never read as an animal id.
animalsRouter.get("/breeds/:species", async (request, response, next) => {
	const species = getIdParam(request.params.species);
	if (species !== "dog" && species !== "cat") {
		response.status(400).json({ error: "Breeds are listed for dog or cat only." });
		return;
	}
	try {
		response.json(await findBreedNames(species));
	} catch (error) {
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
			response.status(400).json({ error: firstIssueMessage(parsed.error) });
			return;
		}

		try {
			const species = await resolveSpeciesAndBreed(
				parsed.data.type,
				parsed.data.speciesName ?? "",
				parsed.data.breed,
				BREED_LOOKUPS,
			);
			if (species.error !== undefined) {
				response.status(400).json({ error: species.error });
				return;
			}
			response.status(201).json(
				await registerAnimal({
					...parsed.data,
					// May differ from the request: Other + "dog"/"cat" is stored as a dog/cat.
					type: species.type,
					speciesName: species.speciesName,
					breed: species.breed,
					veterinaryPriority: parsed.data.veterinaryPriority ?? DEFAULT_VETERINARY_PRIORITY,
				}),
			);
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
			response.status(400).json({ error: firstIssueMessage(parsed.error) });
			return;
		}

		try {
			const id = getIdParam(request.params.id);
			// Typed as the DB update (not the request) so speciesName can be null.
			const update: Parameters<typeof updateAnimalProfile>[1] = { ...parsed.data };

			// Species, typed species name and breed are only valid together, so if
			// any of them changes, check all three (filling the rest from the saved
			// profile) - e.g. a legacy breed like Aqua's "cat" must be fixed, and
			// Other + "dog" is saved as a dog.
			if (update.type !== undefined || update.breed !== undefined || update.speciesName !== undefined) {
				const existing = await getAnimalById(id);
				if (!existing) {
					response.status(404).json({ error: "Animal not found" });
					return;
				}
				const type = update.type ?? existing.type;
				if (type === "rabbit") {
					response.status(400).json({ error: "Species must be Dog, Cat or Other." });
					return;
				}
				const species = await resolveSpeciesAndBreed(
					type,
					update.speciesName ?? existing.speciesName ?? "",
					update.breed ?? existing.breed ?? "",
					BREED_LOOKUPS,
				);
				if (species.error !== undefined) {
					response.status(400).json({ error: species.error });
					return;
				}
				update.type = species.type;
				update.breed = species.breed;
				// null for dogs/cats, so switching an Other animal to Dog clears it.
				update.speciesName = species.speciesName;
			}

			const animal = await updateAnimalProfile(id, update);
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
