import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AiSearchUnavailableError } from "../../shared/errors/applicationError.js";
// Type-only, so nothing is loaded at runtime: the repository's own signatures
// are the source of truth for these row shapes, not hand-written copies.
import type { createAnimal, updateAnimal } from "./animals.repository.js";

// Tests for the animal module's AI search behaviour.
//
// Unlike the adoptions/rescue/staff suites, this file does NOT use
// node:test's `mock.module`. That feature does not apply module mocks on this
// machine's Node (v22.20.0) - every mock-based suite fails at import time with
// "The requested module ... does not provide an export named ..." - so stubbing
// modules here would mean shipping another permanently failing file. Instead the
// write and search functions take their collaborators as an optional parameter
// (SearchDependencies in animals.service.ts, defaulting to the real ones), and
// this suite passes stubs: no module mocking, no database, no provider call.
//
// config/env.ts refuses to load without these two variables and dotenv will not
// overwrite values that are already set, so setting them here keeps the suite
// hermetic - it never reads anyone's .env.local or server/.env, and
// db/client.ts only builds a lazy Neon client from the dummy URL, it never
// connects.
//
// Run: npm test

process.env.CLERK_SECRET_KEY = "test-clerk-secret-key";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/ara_test";

const {
	backfillMissingAnimalEmbeddings,
	normalizeSearchQuery,
	registerAnimal,
	searchAnimalsWithAI,
	updateAnimalProfile,
} = await import("./animals.service.js");
const { buildAnimalSearchText, touchesSearchableField } = await import("./animalSearchText.js");

// An animal row exactly as animals.repository.ts returns it, and the shape a
// registration is given - derived from the schema rather than restated here.
type AnimalRow = NonNullable<Awaited<ReturnType<typeof updateAnimal>>>;
type AnimalInsert = Parameters<typeof createAnimal>[0];
type AnimalSearchTextSource = Parameters<typeof buildAnimalSearchText>[0];

const ANIMAL_ID = "11111111-1111-1111-1111-111111111111";

type Embedding = number[];
type EmbedCall = { text: string; purpose: "document" | "query" };
type SearchCall = { embedding: Embedding; limit: number; minSimilarity?: number };

// Everything the stubs recorded, so a test can assert what was sent - and, just
// as importantly, that nothing was sent at all.
let embedCalls: EmbedCall[] = [];
let searchCalls: SearchCall[] = [];
let embeddingWrites: { id: string; embedding: Embedding | null }[] = [];
let missingAnimals: AnimalRow[] = [];
let storedAnimals: AnimalRow[] = [];

// How the stubbed provider misbehaves, and what the stubbed database holds.
let providerFailure: Error | null = null;
// Rejects an embedding request whose text contains this string, so a test can
// fail exactly one animal inside a batch instead of the whole run.
let providerRejectsText: string | null = null;
let providerEmbedding: Embedding = [0.1, 0.2, 0.3];

// One animal profile as the repository hands it over: every column, including
// the private/medical ones that must never reach the browser or the provider.
const BASE_PROFILE = {
	id: ANIMAL_ID,
	publicId: "SPCA-2026-0001",
	name: "Milo",
	type: "dog",
	breed: "Terrier",
	estimatedAge: "2 years",
	size: "small",
	gender: "Male",
	colour: "Brown",
	behaviour: "Calm, gentle and patient. Comfortable around children.",
	description: "Milo is a friendly family dog who enjoys quiet environments.",
	photoUrls: ["https://res.cloudinary.com/example/milo.jpg"],
	vaccinationStatus: "vaccinated",
	veterinaryPriority: "routine",
	rescueDate: "2026-01-04",
	medicallyCleared: true,
	status: "medically_cleared",
	veterinaryStatus: "cleared",
	medicalClearanceDate: new Date("2026-01-04T00:00:00Z"),
	// Internal/medical fields: a visitor must never see these, and they must
	// never reach the embedding provider either.
	rescueHistory: "Rescued from a construction site by a staff member.",
	medicalClearanceNotes: "Cleared after a course of tick treatment.",
	medicalClearedByClerkUserId: "user_vet_1",
	deletedAt: null,
	createdAt: new Date("2026-01-05T00:00:00Z"),
	updatedAt: new Date("2026-01-05T00:00:00Z"),
} satisfies AnimalRow & AnimalSearchTextSource;

function animal(overrides: Partial<AnimalRow> = {}): AnimalRow {
	return { ...BASE_PROFILE, ...overrides } as AnimalRow;
}

// What animals.routes.ts's zod schema produces for a registration, minus the
// server-generated publicId / medicallyCleared / status.
const REGISTRATION = {
	name: "Milo",
	type: "dog",
	breed: "Terrier",
	estimatedAge: "2 years",
	size: "small",
	gender: "Male",
	colour: "Brown",
	behaviour: "Calm, gentle and patient. Comfortable around children.",
	description: "Milo is a friendly family dog who enjoys quiet environments.",
	photoUrls: ["https://res.cloudinary.com/example/milo.jpg"],
	vaccinationStatus: "vaccinated",
	veterinaryPriority: "routine",
} satisfies Parameters<typeof registerAnimal>[0];

function embed(text: string, purpose: "document" | "query"): Promise<Embedding> {
	embedCalls.push({ text, purpose });
	if (providerFailure) throw providerFailure;
	if (providerRejectsText !== null && text.includes(providerRejectsText)) {
		throw new AiSearchUnavailableError("Embedding provider returned HTTP 503");
	}
	return Promise.resolve(providerEmbedding);
}

// The stub set handed to the service in place of the live repository and
// provider. Each stub is a plain async function that records what it was asked
// to do and answers from memory - no database, no network, no module mocking.
function dependencies() {
	return {
		repository: {
			findAnimalByPublicId: async () => undefined,
			// Stands in for the INSERT + RETURNING: the saved row is whatever the
			// service decided to write, so a test can read back the real defaults.
			createAnimal: async (input: AnimalInsert) =>
				animal({ ...input, id: ANIMAL_ID } as Partial<AnimalRow>),
			updateAnimal: async (_id: string, patch: Partial<AnimalRow>) =>
				animal(patch),
			setAnimalSearchEmbedding: async (id: string, embedding: Embedding | null) => {
				embeddingWrites.push({ id, embedding });
				return { id };
			},
			findSimilarPublicAnimals: (
				embedding: Embedding,
				options: { limit: number; minSimilarity?: number },
			) => {
				searchCalls.push({ embedding, ...options });
				return Promise.resolve(storedAnimals);
			},
			findAnimalsMissingSearchEmbedding: async () => missingAnimals,
		},
		provider: {
			embedSearchQuery: (text: string) => embed(text, "query"),
			embedAnimalProfileText: (text: string) => embed(text, "document"),
		},
		limit: 10,
		minSimilarity: 0,
	};
}

beforeEach(() => {
	embedCalls = [];
	searchCalls = [];
	embeddingWrites = [];
	missingAnimals = [];
	storedAnimals = [];
	providerFailure = null;
	providerRejectsText = null;
	providerEmbedding = [0.1, 0.2, 0.3];
});

describe("the text sent to the embedding provider", () => {
	it("describes the animal using its public profile fields", () => {
		const text = buildAnimalSearchText(animal());

		assert.match(text, /Name: Milo/);
		assert.match(text, /Species: Dog/);
		assert.match(text, /Breed: Terrier/);
		assert.match(text, /Size: Small/);
		assert.match(text, /Estimated age: 2 years/);
		assert.match(text, /Gender: Male/);
		assert.match(text, /Colour: Brown/);
		assert.match(text, /Comfortable around children/);
		assert.match(text, /enjoys quiet environments/);
	});

	it("never carries rescue history, medical notes or staff identifiers", () => {
		const text = buildAnimalSearchText(animal());

		assert.doesNotMatch(text, /construction site/);
		assert.doesNotMatch(text, /tick treatment/);
		assert.doesNotMatch(text, /user_vet_1/);
	});

	it("reads enum values as plain English so a sentence can match them", () => {
		const text = buildAnimalSearchText(animal({ size: "extra_large", type: "rabbit" }));

		assert.match(text, /Size: Extra large/);
		assert.match(text, /Species: Rabbit/);
	});

	it("omits fields staff left blank rather than embedding empty labels", () => {
		const text = buildAnimalSearchText(animal({ breed: "   ", behaviour: null, description: "" }));

		assert.doesNotMatch(text, /Breed:/);
		assert.doesNotMatch(text, /Behaviour:/);
		assert.doesNotMatch(text, /Description:/);
	});

	it("treats an explicit blank as a change but an absent field as unchanged", () => {
		assert.equal(touchesSearchableField({ photoUrls: ["a.jpg"] }), false);
		assert.equal(touchesSearchableField({ status: "medically_cleared" }), false);
		assert.equal(touchesSearchableField({ description: "" }), true);
		assert.equal(touchesSearchableField({ size: "large" }), true);
	});
});

describe("natural-language search", () => {
	it("embeds the searcher's sentence and returns the ranked animals", async () => {
		storedAnimals = [
			animal({ id: "a", name: "Milo", description: "Calm around children." }),
			animal({ id: "b", name: "Buddy", description: "Boisterous and active." }),
		];

		const results = await searchAnimalsWithAI(
			"small dog which is calm around children",
			dependencies(),
		);

		assert.equal(embedCalls.length, 1);
		assert.equal(embedCalls[0].purpose, "query");
		assert.equal(embedCalls[0].text, "small dog which is calm around children");
		assert.deepEqual(results, storedAnimals);
	});

	it("collapses extra whitespace so equivalent sentences embed identically", async () => {
		await searchAnimalsWithAI("  small   calm\tdog  ", dependencies());

		assert.equal(embedCalls[0].text, "small calm dog");
	});

	it("returns the database's rows verbatim - availability is the database's call", async () => {
		// Whatever the vector search reports, the service adds no availability
		// logic of its own and invents no fields: it forwards exactly what the
		// repository returned, because the public-animal rules are SQL.
		const rows = [animal({ id: "a", description: "Calm around children." })];
		storedAnimals = rows;

		assert.deepEqual(await searchAnimalsWithAI("calm dog", dependencies()), rows);
	});

	it("passes the query vector and the configured limit to the repository", async () => {
		await searchAnimalsWithAI("calm dog", dependencies());

		assert.equal(searchCalls.length, 1);
		// Exactly the vector the provider returned for the query, and the
		// configured page size - the service decides neither.
		assert.deepEqual(searchCalls[0].embedding, providerEmbedding);
		assert.equal(searchCalls[0].limit, 10);
	});

	it("makes no provider call for an empty query", async () => {
		assert.deepEqual(await searchAnimalsWithAI("", dependencies()), []);
		assert.deepEqual(embedCalls, []);
		assert.deepEqual(searchCalls, []);
	});

	it("makes no provider call for a whitespace-only query", async () => {
		assert.deepEqual(await searchAnimalsWithAI("     ", dependencies()), []);
		assert.deepEqual(embedCalls, []);
		assert.deepEqual(searchCalls, []);
	});

	it("reports a provider outage instead of quietly returning everything", async () => {
		providerFailure = new AiSearchUnavailableError("GEMINI_API_KEY is not configured");

		await assert.rejects(
			() => searchAnimalsWithAI("calm dog", dependencies()),
			(error: unknown) => error instanceof AiSearchUnavailableError,
		);
		// Nothing was searched, so an outage can never degrade into "here is every
		// animal we have".
		assert.deepEqual(searchCalls, []);
	});

	it("bounds a runaway query before it reaches the provider", () => {
		assert.equal(normalizeSearchQuery("a".repeat(301))?.length, 300);
		assert.equal(normalizeSearchQuery("a"), null);
		assert.equal(normalizeSearchQuery("\n\t "), null);
	});
});

describe("registering an animal", () => {
	it("stores an embedding built from the saved profile", async () => {
		const created = await registerAnimal(REGISTRATION, dependencies());

		assert.match(String(created?.publicId), /^SPCA-\d{4}-\d{4}$/);
		assert.equal(created?.medicallyCleared, false);
		assert.equal(created?.status, "intake");
		assert.equal(embedCalls.length, 1);
		// A stored profile is a document, a searcher's sentence is a query: the
		// provider's retrieval models score the two differently.
		assert.equal(embedCalls[0].purpose, "document");
		assert.match(embedCalls[0].text, /Breed: Terrier/);
		assert.deepEqual(embeddingWrites, [{ id: ANIMAL_ID, embedding: providerEmbedding }]);
	});

	it("keeps the animal when the provider is unavailable", async () => {
		providerFailure = new AiSearchUnavailableError("Embedding provider returned HTTP 500");

		const created = await registerAnimal(REGISTRATION, dependencies());

		// The staff member's work is intact...
		assert.equal(created?.name, "Milo");
		// ...only the embedding is missing, so a backfill can retry it later.
		assert.deepEqual(embeddingWrites, [{ id: ANIMAL_ID, embedding: null }]);
	});

	it("never lets a registration clear its own medical gate", async () => {
		// AGENTS.md: medically_cleared has a single writer - the vet - and
		// registerAnimal hard-codes it to false whatever the caller passes.
		const created = await registerAnimal(
			{ ...REGISTRATION, medicallyCleared: true, status: "medically_cleared" },
			dependencies(),
		);

		assert.equal(created?.medicallyCleared, false);
		assert.equal(created?.status, "intake");
	});
});

describe("editing an animal", () => {
	it("re-embeds when a search-relevant description changes", async () => {
		await updateAnimalProfile(
			ANIMAL_ID,
			{ behaviour: "Energetic and active, needs an experienced owner." },
			dependencies(),
		);

		assert.equal(embedCalls.length, 1);
		assert.match(embedCalls[0].text, /Energetic and active/);
		assert.deepEqual(embeddingWrites, [{ id: ANIMAL_ID, embedding: providerEmbedding }]);
	});

	it("does not re-embed for an edit that leaves the search text unchanged", async () => {
		await updateAnimalProfile(
			ANIMAL_ID,
			{ photoUrls: ["https://res.cloudinary.com/example/new.jpg"], status: "medically_cleared" },
			dependencies(),
		);

		assert.deepEqual(embedCalls, []);
		assert.deepEqual(embeddingWrites, []);
	});

	it("clears a stale embedding when re-embedding fails", async () => {
		providerFailure = new AiSearchUnavailableError("Embedding provider returned HTTP 429");

		const updated = await updateAnimalProfile(
			ANIMAL_ID,
			{ description: "A brand new description." },
			dependencies(),
		);

		// The edit is still saved; the animal just drops out of AI search until a
		// backfill regenerates its vector, rather than matching text it no longer
		// has.
		assert.equal(updated?.description, "A brand new description.");
		assert.deepEqual(embeddingWrites, [{ id: ANIMAL_ID, embedding: null }]);
	});
});

describe("backfilling existing animals", () => {
	it("embeds only the animals that have no vector yet", async () => {
		missingAnimals = [animal({ id: "a", publicId: "SPCA-2026-0002" })];

		const result = await backfillMissingAnimalEmbeddings(dependencies());

		assert.deepEqual(result, { scanned: 1, updated: 1, failed: 0, failedAnimalIds: [] });
		assert.equal(embedCalls.length, 1);
		assert.deepEqual(embeddingWrites, [{ id: "a", embedding: providerEmbedding }]);
	});

	it("carries on after one animal fails and reports both counts", async () => {
		missingAnimals = [
			animal({ id: "a", name: "Milo", publicId: "SPCA-2026-0002" }),
			animal({ id: "b", name: "Coco", publicId: "SPCA-2026-0003" }),
		];
		providerRejectsText = "Coco";

		const result = await backfillMissingAnimalEmbeddings(dependencies());

		assert.equal(result.scanned, 2);
		assert.equal(result.updated, 1);
		assert.equal(result.failed, 1);
		assert.deepEqual(result.failedAnimalIds, ["SPCA-2026-0003"]);
		// It processed both animals rather than stopping at the first failure.
		assert.equal(embedCalls.length, 2);
	});

	it("is a no-op when every animal already has a vector", async () => {
		const result = await backfillMissingAnimalEmbeddings(dependencies());

		assert.equal(result.scanned, 0);
		assert.equal(result.updated, 0);
		assert.deepEqual(embedCalls, []);
	});
});

// What keeps an adopted, uncleared or deleted animal out of AI search is one SQL
// predicate, which no stubbed repository can verify. The guarantee asserted here
// is structural instead: the ordinary listing and the AI search both call that
// same predicate, so they cannot drift apart - the same technique
// staff.service.test.ts uses to pin the frontend and backend role lists together.
describe("public visibility is shared by the listing and AI search", () => {
	function repositorySource(): string {
		return readFileSync(join(import.meta.dirname, "animals.repository.ts"), "utf8");
	}

	function functionBody(source: string, name: string): string {
		const start = source.indexOf(`function ${name}`);
		assert.notEqual(start, -1, `${name} not found in animals.repository.ts`);
		const end = source.indexOf("\nexport ", start);
		return source.slice(start, end === -1 ? source.length : end);
	}

	it("gates the public listing and the similarity search with the same predicate", () => {
		const source = repositorySource();

		assert.match(functionBody(source, "findPublicAnimals"), /publicAnimalVisibility\(\)/);
		assert.match(functionBody(source, "findSimilarPublicAnimals"), /publicAnimalVisibility\(\)/);
	});

	it("keeps every availability condition inside that one predicate", () => {
		const predicate = functionBody(repositorySource(), "publicAnimalVisibility");

		// Not adopted, not soft-deleted, and cleared by a vet.
		assert.match(predicate, /ne\(animals\.status, "adopted"\)/);
		assert.match(predicate, /isNull\(animals\.deletedAt\)/);
		assert.match(predicate, /eq\(animals\.medicallyCleared, true\)/);
	});

	it("ranks with pgvector cosine distance and skips animals with no vector", () => {
		const source = repositorySource();

		// The distance expression itself lives in its own helper.
		assert.match(functionBody(source, "cosineDistance"), /<=>/);
		assert.match(functionBody(source, "cosineDistance"), /::vector/);

		const search = functionBody(source, "findSimilarPublicAnimals");
		assert.match(search, /isNotNull\(animals\.searchEmbedding\)/);
		assert.match(search, /\.orderBy\(asc\(distance\)\)/);
		assert.match(search, /\.limit\(options\.limit\)/);
	});

	it("never selects the embedding column into a response", () => {
		const selections = [
			...repositorySource().matchAll(/\.(?:select|returning)\(([^)]*)\)/g),
		].map((match) => match[1]);

		assert.ok(selections.length > 0, "no select()/returning() calls found");
		for (const columns of selections) {
			assert.doesNotMatch(columns, /searchEmbedding/);
		}
	});
});