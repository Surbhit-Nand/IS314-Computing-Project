import { env } from "../../config/env.js";
import { cloudinary, isCloudinaryConfigured } from "../../services/cloudinaryClient.js";
import { embedAnimalProfileText, embedSearchQuery } from "../../services/aiSearchClient.js";
import { buildAnimalSearchText, touchesSearchableField } from "./animalSearchText.js";
import { parseAnimalSearchIntent } from "./animalSearchIntent.js";
import {
	createAnimal,
	findAllAnimals,
	findAnimalById,
	findAnimalByPublicId,
	findAnimalsMissingSearchEmbedding,
	findPublicAnimals,
	findSimilarPublicAnimals,
	setAnimalSearchEmbedding,
	softDeleteAnimal,
	updateAnimal,
} from "./animals.repository.js";

type AnimalRow = NonNullable<Awaited<ReturnType<typeof updateAnimal>>>;
type SimilarAnimals = Awaited<ReturnType<typeof findSimilarPublicAnimals>>;

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
async function generateUniquePublicId(
	findByPublicId: (publicId: string) => Promise<{ id: string } | undefined>,
): Promise<string> {
	const year = new Date().getFullYear();

	for (let attempt = 0; attempt < 5; attempt += 1) {
		const suffix = Math.floor(1000 + Math.random() * 9000);
		const candidate = `SPCA-${year}-${suffix}`;
		const existing = await findByPublicId(candidate);
		if (!existing) {
			return candidate;
		}
	}

	throw new Error("Could not generate a unique Animal ID, please try again");
}

// ---------------------------------------------------------------------------
// AI search (structured constraints plus semantic ranking of public profiles)
//
// Assistive discovery only. It ranks animals that already exist and are already
// publicly adoptable; it never approves, rejects or completes an adoption, never
// changes an animal's availability, never overrides medical clearance and never
// makes a staff decision. It also never invents animal facts - every field it
// returns is read straight back out of the animals table.
// ---------------------------------------------------------------------------

// Longest query accepted. The route validates the same bound with zod; this is
// the service-level backstop so no caller can push an unbounded string at the
// embedding provider.
const MAX_QUERY_LENGTH = 300;

// The collaborators the AI-search paths need: an embedding provider and the two
// vector queries. They are grouped into one optional parameter so
// animals.service.test.ts can exercise this logic with stubs instead of a live
// database and a live provider. Every production call site simply leaves it out,
// which keeps the real wiring in exactly one place below.
type SearchDependencies = {
	// findAnimalByPublicId is given an explicit signature because a free Animal
	// ID returns no row: generateUniquePublicId() reads "no row" as "not taken",
	// which is what actually happens even though noUncheckedIndexedAccess is off.
	repository: Pick<
		typeof import("./animals.repository.js"),
		| "createAnimal"
		| "updateAnimal"
		| "findSimilarPublicAnimals"
		| "findAnimalsMissingSearchEmbedding"
		| "setAnimalSearchEmbedding"
	> & {
		findAnimalByPublicId: (publicId: string) => Promise<{ id: string } | undefined>;
	};
	provider: Pick<
		typeof import("../../services/aiSearchClient.js"),
		"embedSearchQuery" | "embedAnimalProfileText"
	>;
	limit: number;
	minSimilarity: number;
};

const searchDependencies: SearchDependencies = {
	repository: {
		findAnimalByPublicId,
		createAnimal,
		updateAnimal,
		findSimilarPublicAnimals,
		findAnimalsMissingSearchEmbedding,
		setAnimalSearchEmbedding,
	},
	provider: {
		embedSearchQuery,
		embedAnimalProfileText,
	},
	limit: env.aiSearchResultLimit,
	minSimilarity: env.aiSearchMinSimilarity,
};

// A query has to be at least this many characters to be worth an embedding.
// Returns null for anything too short or blank, which is how the caller knows to
// skip the provider call entirely rather than treat "" as a search.
export function normalizeSearchQuery(rawQuery: string): string | null {
	// Collapse runs of whitespace so "small   calm  dog" and "small calm dog"
	// embed identically.
	const query = rawQuery.trim().replace(/\s+/g, " ");
	if (query.length < 2) return null;
	return query.slice(0, MAX_QUERY_LENGTH);
}

// Turns an animal profile into its stored search vector, and reports whether it
// worked.
//
// Deliberately never throws. AI search is an assistive extra, so a provider
// outage must not cost a staff member the animal profile they just saved, and
// must not leave a half-written record behind. On failure the embedding is set
// back to null - better an animal that is honestly not yet searchable than one
// still matching text that has just been edited away - and the failure is
// logged. `npm run ai:backfill` picks those animals up later.
async function refreshSearchEmbedding(
	animal: AnimalRow,
	dependencies: SearchDependencies,
): Promise<boolean> {
	try {
		const embedding = await dependencies.provider.embedAnimalProfileText(
			buildAnimalSearchText(animal),
		);
		await dependencies.repository.setAnimalSearchEmbedding(animal.id, embedding);
		return true;
	} catch (error) {
		console.warn(
			`[AI search] Could not store a search embedding for ${animal.publicId}: ${
				error instanceof Error ? error.message : "unknown error"
			}. The profile is saved and unaffected; run \`npm run ai:backfill\` to retry.`,
		);
		await dependencies.repository
			.setAnimalSearchEmbedding(animal.id, null)
			.catch(() => undefined);
		return false;
	}
}

// Natural-language search: "small dog which is calm around children" ->
// the publicly adoptable animals closest to that sentence, best match first.
//
// Availability is decided by the database (publicAnimalVisibility in
// animals.repository.ts), never by the AI: the provider only converts the
// searcher's sentence into a vector and nothing more.
export async function searchAnimalsWithAI(
	rawQuery: string,
	dependencies: SearchDependencies = searchDependencies,
): Promise<SimilarAnimals> {
	const query = normalizeSearchQuery(rawQuery);
	if (query === null) {
		// Blank or whitespace-only input: no provider call, no DB query, no
		// error. The frontend stays on the normal listing.
		return [];
	}

	const { semanticQuery, ...filters } = parseAnimalSearchIntent(query);

	// Propagates AiSearchUnavailableError from the provider service, which the
	// route turns into a 503 the frontend shows as "AI search unavailable".
	const queryEmbedding = await dependencies.provider.embedSearchQuery(semanticQuery);

	return dependencies.repository.findSimilarPublicAnimals(queryEmbedding, {
		limit: dependencies.limit,
		minSimilarity: dependencies.minSimilarity,
		filters,
	});
}

// Generates the search vectors for animals that have none - the one-off
// backfill for records that predate the feature (or whose embedding failed
// during registration). Safe to re-run: it only ever writes the missing vector
// on an existing row, creates nothing, and touches no other animal data.
//
// Animals are processed one at a time on purpose: this runs as a maintenance
// script, and serial calls stay well inside the provider's rate limit where a
// burst of parallel calls would not. One animal's failure is logged and the run
// continues with the next.
export async function backfillMissingAnimalEmbeddings(
	dependencies: SearchDependencies = searchDependencies,
) {
	const pending = await dependencies.repository.findAnimalsMissingSearchEmbedding();
	const failed: string[] = [];

	for (const animal of pending) {
		const stored = await refreshSearchEmbedding(animal, dependencies);
		if (!stored) failed.push(animal.publicId);
	}

	return {
		scanned: pending.length,
		updated: pending.length - failed.length,
		failed: failed.length,
		failedAnimalIds: failed,
	};
}

export async function registerAnimal(
	input: Omit<Parameters<typeof createAnimal>[0], "publicId">,
	dependencies: SearchDependencies = searchDependencies,
) {
	const publicId = await generateUniquePublicId(dependencies.repository.findAnimalByPublicId);
	const animal = await dependencies.repository.createAnimal({
		...input,
		publicId,
		medicallyCleared: false,
		status: "intake",
	});

	// A new animal is not publicly listed yet (medically_cleared is false until a
	// vet clears it), so embedding it now costs one provider call and means the
	// animal is searchable the moment it becomes public - no waiting for a
	// backfill run. Failure here is swallowed by refreshSearchEmbedding.
	await refreshSearchEmbedding(animal, dependencies);

	return animal;
}

export async function updateAnimalProfile(
	id: string,
	input: Partial<Parameters<typeof updateAnimal>[1]>,
	dependencies: SearchDependencies = searchDependencies,
) {
	const animal = await dependencies.repository.updateAnimal(id, input);

	// Only re-embed when a field the search text is built from actually changed.
	// An edit that touches, say, photoUrls or the lifecycle status leaves the text
	// (and therefore the stored vector) identical, so it costs no provider call.
	if (animal && touchesSearchableField(input)) {
		await refreshSearchEmbedding(animal, dependencies);
	}

	return animal;
}

// Soft-deletes an animal profile (passed away, transferred elsewhere, etc).
export async function deleteAnimal(id: string) {
	return softDeleteAnimal(id);
}

// Streams an uploaded photo buffer straight to Cloudinary (never touching
// disk) and returns its hosted URL. This is the one place that talks to the
// Cloudinary SDK directly, per AGENTS.md's rule to keep third-party
// providers behind a service-layer boundary rather than called from routes.
export async function uploadAnimalPhoto(fileBuffer: Buffer): Promise<string> {
	if (!isCloudinaryConfigured()) {
		throw new Error(
			"Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET before uploading photos.",
		);
	}

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
