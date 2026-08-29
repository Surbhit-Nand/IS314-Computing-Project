import { cloudinary } from "../../services/cloudinaryClient.js";
import {
	createAnimal,
	findAllAnimals,
	findAnimalById,
	findAnimalByPublicId,
	findPublicAnimals,
	updateAnimal,
} from "./animals.repository.js";

export async function listPublicAnimals() {
	return findPublicAnimals();
}

export async function listAllAnimals() {
	return findAllAnimals();
}

export async function getAnimalById(id: string) {
	return findAnimalById(id);
}

// Builds a human-readable, unique Animal ID like "SPCA-2026-4821" and retries
// with a fresh random suffix on the rare chance it collides with an existing
// one. Staff never type this in themselves — it's generated here so there's
// no risk of duplicate/mistyped IDs (see AGENTS.md's "no redundancy, single
// source of truth per animal" guardrail).
async function generateUniquePublicId(): Promise<string> {
	const year = new Date().getFullYear();

	for (let attempt = 0; attempt < 5; attempt += 1) {
		const suffix = Math.floor(1000 + Math.random() * 9000);
		const candidate = `SPCA-${year}-${suffix}`;
		const existing = await findAnimalByPublicId(candidate);
		if (!existing) {
			return candidate;
		}
	}

	throw new Error("Could not generate a unique Animal ID, please try again");
}

export async function registerAnimal(input: Omit<Parameters<typeof createAnimal>[0], "publicId">) {
	const publicId = await generateUniquePublicId();
	return createAnimal({
		...input,
		publicId,
		medicallyCleared: false,
		status: "intake",
	});
}

export async function updateAnimalProfile(
	id: string,
	input: Partial<Parameters<typeof updateAnimal>[1]>,
) {
	return updateAnimal(id, input);
}

// Streams an uploaded photo buffer straight to Cloudinary (never touching
// disk) and returns its hosted URL. This is the one place that talks to the
// Cloudinary SDK directly, per AGENTS.md's rule to keep third-party
// providers behind a service-layer boundary rather than called from routes.
export async function uploadAnimalPhoto(fileBuffer: Buffer): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream({ folder: "ara/animals" }, (error, result) => {
			if (error || !result) {
				reject(error ?? new Error("Cloudinary upload failed"));
				return;
			}
			resolve(result.secure_url);
		});
		stream.end(fileBuffer);
	});
}
