import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireClerkSession } from "../../middleware/auth.js";
import { requireStaffOrAbove } from "../../middleware/rbac.js";
import {
	deleteAnimal,
	getAnimalById,
	listAllAnimals,
	listPublicAnimals,
	registerAnimal,
	updateAnimalProfile,
	uploadAnimalPhoto,
} from "./animals.service.js";

// Fields a staff member fills in when registering a new animal. `publicId`
// is deliberately absent here — the server generates it, staff never type it.
const animalSchema = z.object({
	name: z.string().min(1),
	type: z.enum(["dog", "cat", "rabbit", "other"]),
	breed: z.string().optional(),
	estimatedAge: z.string().optional(),
	gender: z.string().optional(),
	colour: z.string().optional(),
	description: z.string().min(1),
	// An empty string is a valid TypeScript string, but it's not a valid
	// Postgres `date` literal - the rescueDate column would reject "" with a
	// raw DB error, so a blank date input is converted to "not provided" here
	// rather than being passed through.
	rescueDate: z
		.string()
		.optional()
		.transform((value) => (value && value.trim() !== "" ? value : undefined)),
	behaviour: z.string().optional(),
	rescueHistory: z.string().optional(),
	photoUrls: z.array(z.string().url()).min(1),
	vaccinationStatus: z.enum(["not_vaccinated", "vaccinated"]),
	size: z.enum(["small", "medium", "large", "extra_large"]),
});

// Same shape, but every field is optional since an edit can touch just one
// or two fields at a time.
const animalUpdateSchema = animalSchema.partial();

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

// Public: every not-yet-adopted animal (see the NOTE on findPublicAnimals
// in animals.repository.ts for why this isn't gated on medical clearance).
animalsRouter.get("/", async (_request, response, next) => {
	try {
		response.json(await listPublicAnimals());
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
