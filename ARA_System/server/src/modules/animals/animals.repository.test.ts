import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

process.env.CLERK_SECRET_KEY = "test-clerk-secret-key";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/ara_test";

const { db } = await import("../../db/client.js");
const { findSimilarPublicAnimals, findPublicAnimals, findAnimalMissingSearchEmbedding, findAnimalsMissingSearchEmbedding, setAnimalSearchEmbedding } = await import("./animals.repository.js");
const { parseAnimalSearchIntent } = await import("./animalSearchIntent.js");

// Execute the real Drizzle builder, intercepting only the transport. This checks
// actual SQL and bound parameters without a live database or module mocking.
let queries: { sql: string; params: unknown[] }[] = [];
beforeEach(() => {
	queries = [];
	mock.method(db.$client, "query", async (sql: string, params: unknown[]) => {
		queries.push({ sql, params });
		return { rows: [] };
	});
});
afterEach(() => mock.restoreAll());

function parameterFor(sql: string, params: unknown[], expression: RegExp): unknown {
	const match = sql.match(expression);
	assert.ok(match, `Missing SQL condition: ${expression}`);
	return params[Number(match[1]) - 1];
}

describe("hybrid search SQL", () => {
	it("looks up only a missing non-deleted vector for the requested animal", async () => {
		assert.equal(await findAnimalMissingSearchEmbedding("animal-id"), undefined);
		const { sql, params } = queries[0];
		assert.equal(parameterFor(sql, params, /"id" = \$(\d+)/), "animal-id");
		assert.match(sql, /"search_embedding" is null/);
		assert.match(sql, /"deleted_at" is null/);
		assert.doesNotMatch(sql.split(" from ")[0], /search_embedding/);
	});

	it("backfills missing non-deleted vectors without excluding adopted or uncleared animals", async () => {
		await findAnimalsMissingSearchEmbedding();
		const where = queries[0].sql.split(" where ")[1];
		assert.match(where, /"search_embedding" is null/);
		assert.match(where, /"deleted_at" is null/);
		assert.doesNotMatch(where, /"status"|"medically_cleared"/);
	});

	it("writes only the embedding and leaves updatedAt and profile fields alone", async () => {
		await setAnimalSearchEmbedding("animal-id", [1, 0, 0]);
		assert.match(queries[0].sql, /^update "animals" set "search_embedding" = \$\d+ where/);
		assert.doesNotMatch(queries[0].sql, /updated_at|description|medically_cleared/);
	});
	it("filters candidates before cosine threshold, ordering and limit", async () => {
		const filters = parseAnimalSearchIntent("female small dog not vaccinated");
		await findSimilarPublicAnimals([0.1, 0.2, 0.3], { filters, limit: 7, minSimilarity: 0.4 });
		const { sql, params } = queries[0];
		const where = sql.slice(sql.indexOf(" where "), sql.indexOf(" order by "));
		assert.equal(parameterFor(where, params, /"type" = \$(\d+)/), "dog");
		assert.equal(parameterFor(where, params, /"size" = \$(\d+)/), "small");
		assert.equal(parameterFor(where, params, /lower\(trim\("animals"\."gender"\)\) = \$(\d+)/), "female");
		assert.equal(parameterFor(where, params, /"vaccination_status" = \$(\d+)/), "not_vaccinated");
		assert.ok(where.indexOf('"vaccination_status"') < where.indexOf("<=>"));
		assert.match(where, /"search_embedding" is not null/);
		assert.equal(parameterFor(where, params, /::vector <= \$(\d+)/), 0.6);
		assert.match(sql, /order by "animals"\."search_embedding" <=> \$\d+::vector asc limit \$\d+$/);
		assert.equal(parameterFor(sql, params, /limit \$(\d+)/), 7);
		assert.equal(parameterFor(sql, params, /<=> \$(\d+)::vector/), "[0.1,0.2,0.3]");
	});

	it("retains the public visibility gate in both listing and hybrid search", async () => {
		await findPublicAnimals();
		await findSimilarPublicAnimals([1, 0, 0], { filters: { type: "dog", size: "small" }, limit: 10 });
		assert.equal(queries.length, 2);
		for (const { sql, params } of queries) {
			assert.equal(parameterFor(sql, params, /"status" <> \$(\d+)/), "adopted");
			assert.equal(parameterFor(sql, params, /"medically_cleared" = \$(\d+)/), true);
			assert.match(sql, /"deleted_at" is null/);
		}
	});

	it("omits unspecified constraints and retains zero-threshold behavior", async () => {
		await findSimilarPublicAnimals([1, 0, 0], { limit: 10, minSimilarity: 0 });
		const where = queries[0].sql.split(" where ")[1].split(" order by ")[0];
		assert.doesNotMatch(where, /"(?:type|size|gender|vaccination_status)"/);
		assert.doesNotMatch(where, /<=>|<=/);
	});

	it("uses only the supplied species constraint for calm dog", async () => {
		await findSimilarPublicAnimals([1, 0, 0], { filters: parseAnimalSearchIntent("calm dog"), limit: 10 });
		const { sql, params } = queries[0];
		const where = sql.split(" where ")[1].split(" order by ")[0];
		assert.equal(parameterFor(where, params, /"type" = \$(\d+)/), "dog");
		assert.doesNotMatch(where, /"(?:size|gender|vaccination_status)"/);
	});

	it("returns an empty result with one constrained query and no fallback", async () => {
		assert.deepEqual(await findSimilarPublicAnimals([1, 0, 0], { filters: { type: "dog", size: "small" }, limit: 10 }), []);
		assert.equal(queries.length, 1);
	});
});
