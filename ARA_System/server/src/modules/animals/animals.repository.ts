import { and, asc, eq, getTableColumns, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { animals } from "../../db/schema.js";
import type { AnimalSearchFilters } from "./animalSearchIntent.js";

// Every column of `animals` EXCEPT the semantic-search vector.
//
// The listing, staff list, detail, insert and update paths all select through
// this instead of `select()`/`returning()`, so `search_embedding` - a few
// hundred floats of machine representation - can never be serialised into an
// API response or pushed down the wire to the browser (see the "never return
// search_embedding" rule for the AI search endpoint). Deriving it from the
// schema rather than listing the columns by hand means a column added to
// `animals` later is picked up automatically.
//
// `getTableColumns` is the same helper db/drift-check.ts uses to enumerate the
// schema's columns. The vector is dropped via a rest sibling; the rule below is
// silenced because `ignoreRestSiblings` is off in this repo's ESLint config.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { searchEmbedding: _searchEmbedding, ...animalProfileColumns } = getTableColumns(animals);

// Public listing gate: an animal appears publicly only once a veterinarian
// has issued medical clearance. `medically_cleared` is written in exactly one
// place - clearAnimal in the veterinary repository, reached only via
// POST /api/veterinary/animals/:id/clearance behind requireVeterinaryAccess -
// so no staff/registration path can set it, and registerAnimal hard-codes it
// to false. Adoption approval re-checks the same flag (adoptions.service
// requireMedicallyCleared) so clearance is enforced again at the point an
// application is approved.
//
// Extracted into its own function because it now gates two read paths: the
// normal listing (findPublicAnimals) and AI search (findSimilarPublicAnimals).
// Both must use the identical predicate, otherwise a semantically perfect
// match could leak an animal the ordinary listing hides - or an adoptable
// animal would silently vanish from AI search. There is no AI involvement in
// this decision: the database alone decides what is publicly adoptable, and the
// AI provider only ever scores text similarity.
function publicAnimalVisibility() {
	return and(
		ne(animals.status, "adopted"),
		isNull(animals.deletedAt),
		eq(animals.medicallyCleared, true),
	);
}

export async function findPublicAnimals() {
	return db.select(animalProfileColumns).from(animals).where(publicAnimalVisibility());
}

// The columns AI search returns. Narrower than animalProfileColumns on purpose:
// it drops rescue history, the medical-clearance fields (notes, the vet's Clerk
// user id, clearance date) and the veterinary workflow columns. Same privacy
// boundary as the search text built for the provider - see
// animalSearchText.ts.
const publicSearchResult = {
	id: animals.id,
	publicId: animals.publicId,
	name: animals.name,
	type: animals.type,
	breed: animals.breed,
	estimatedAge: animals.estimatedAge,
	gender: animals.gender,
	colour: animals.colour,
	description: animals.description,
	rescueDate: animals.rescueDate,
	behaviour: animals.behaviour,
	photoUrls: animals.photoUrls,
	vaccinationStatus: animals.vaccinationStatus,
	size: animals.size,
	medicallyCleared: animals.medicallyCleared,
	status: animals.status,
	createdAt: animals.createdAt,
	updatedAt: animals.updatedAt,
} as const;

// pgvector's `<=>` is cosine DISTANCE, the opposite of similarity, so a
// "minimum similarity" of s becomes a "maximum distance" of 1 - s. The provider
// returns L2-normalised vectors, so distance stays within [0, 2].
function cosineDistance(embedding: number[]) {
	// `${JSON.stringify(...)}::vector` passes the vector in pgvector's literal
	// text format ("[0.1,0.2]") with an explicit cast instead of relying on
	// Postgres to infer the parameter's type.
	return sql`${animals.searchEmbedding} <=> ${JSON.stringify(embedding)}::vector`;
}

// Ranks publicly adoptable animals by how close their stored embedding is to
// the searcher's sentence, best match first. Explicit structured constraints
// restrict the SQL candidates before the threshold, ordering and result limit.
//
// `minSimilarity` (0-1) is an optional cut-off and defaults to 0, i.e. no
// exclusion - ranking plus `limit` do the work. Embedding models give unrelated
// sentences a non-trivial baseline similarity, so a hard-coded cut-off picked
// without real animal records would silently hide valid matches rather than
// improve relevance.
export async function findSimilarPublicAnimals(
	queryEmbedding: number[],
	options: { limit: number; minSimilarity?: number; filters?: AnimalSearchFilters },
) {
	const distance = cosineDistance(queryEmbedding);
	const maxDistance = 1 - (options.minSimilarity ?? 0);
	const filters = options.filters ?? {};

	return db
		.select(publicSearchResult)
		.from(animals)
		.where(
			and(
				publicAnimalVisibility(),
				filters.type ? eq(animals.type, filters.type) : undefined,
				filters.size ? eq(animals.size, filters.size) : undefined,
				// Free-text legacy values may differ in capitalization or whitespace.
				filters.gender
					? sql`lower(trim(${animals.gender})) = ${filters.gender.toLowerCase()}`
					: undefined,
				filters.vaccinationStatus
					? eq(animals.vaccinationStatus, filters.vaccinationStatus)
					: undefined,
				// An animal with no embedding yet - registered before the search
				// feature existed, or its embedding failed to generate - has
				// nothing to compare against, so it is skipped rather than
				// ranked as a false match.
				isNotNull(animals.searchEmbedding),
				...(maxDistance < 1 ? [sql`${distance} <= ${maxDistance}`] : []),
			),
		)
		.orderBy(asc(distance))
		.limit(options.limit);
}

// Staff listing: every non-deleted animal regardless of clearance/adoption
// status, for the internal "Manage Animal Profiles" page. Soft-deleted
// animals (deletedAt set) are excluded here too - deleting removes them from
// every list, not just the public one.
export async function findAllAnimals() {
	return db.select(animalProfileColumns).from(animals).where(isNull(animals.deletedAt));
}

// The animals that exist without a search vector yet - the backfill script's
// work list. Soft-deleted animals are skipped so the script spends no provider
// calls on profiles no visitor could search for. Full rows are returned because
// the caller needs the profile fields to rebuild the search text from.
export async function findAnimalsMissingSearchEmbedding() {
	return db
		.select(animalProfileColumns)
		.from(animals)
		.where(and(isNull(animals.searchEmbedding), isNull(animals.deletedAt)));
}

// Internal retry lookup: do not expose vectors in normal profile responses.
export async function findAnimalMissingSearchEmbedding(id: string) {
	const rows = await db.select(animalProfileColumns).from(animals).where(and(
		eq(animals.id, id), isNull(animals.searchEmbedding), isNull(animals.deletedAt),
	));
	return rows.at(0);
}

// Soft delete: marks an animal as removed without touching the row, so
// rescue_reports/adoption_applications/vet_appointments rows that reference
// it by foreign key (and the animal's own history) are never broken or
// lost. See the comment on `deletedAt` in schema.ts for why this isn't a
// hard DELETE.
export async function softDeleteAnimal(id: string) {
	const [animal] = await db
		.update(animals)
		.set({ deletedAt: new Date(), updatedAt: new Date() })
		.where(eq(animals.id, id))
		.returning(animalProfileColumns);
	return animal;
}

// Looks up a single animal by its internal id (used to pre-fill the edit form).
export async function findAnimalById(id: string) {
	const [animal] = await db
		.select(animalProfileColumns)
		.from(animals)
		.where(eq(animals.id, id));
	return animal;
}

// Checks whether a given public-facing Animal ID is already taken, used when
// generating a new unique id.
export async function findAnimalByPublicId(publicId: string) {
	const [animal] = await db
		.select({ id: animals.id })
		.from(animals)
		.where(eq(animals.publicId, publicId));
	return animal;
}

export async function createAnimal(input: typeof animals.$inferInsert) {
	const [animal] = await db.insert(animals).values(input).returning(animalProfileColumns);
	return animal;
}

// Updates only the fields provided in `input` and always refreshes updatedAt.
export async function updateAnimal(id: string, input: Partial<typeof animals.$inferInsert>) {
	const [animal] = await db
		.update(animals)
		.set({ ...input, updatedAt: new Date() })
		.where(eq(animals.id, id))
		.returning(animalProfileColumns);
	return animal;
}

// Stores (or clears, with null) one animal's search vector.
//
// Separate from updateAnimal and deliberately does NOT touch updatedAt: the
// embedding is derived metadata, not animal data, so regenerating it must not
// make a profile look freshly edited on the staff "Manage Animal Profiles"
// page.
export async function setAnimalSearchEmbedding(id: string, embedding: number[] | null) {
	const [animal] = await db
		.update(animals)
		.set({ searchEmbedding: embedding })
		.where(eq(animals.id, id))
		.returning({ id: animals.id });
	return animal;
}
