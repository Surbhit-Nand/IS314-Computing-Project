import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { rankAnimalSearchCandidates } from "./animalSearchRanking.js";
import { correctAnimalSearchQuery } from "./animalSearchSpelling.js";

process.env.CLERK_SECRET_KEY = "test-clerk-secret-key";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/ara_test";

const { db } = await import("../../db/client.js");
const { findSimilarPublicAnimals, findPublicAnimalSearchCandidates, findPublicAnimals, findAnimalMissingSearchEmbedding, findAnimalsMissingSearchEmbedding, setAnimalSearchEmbedding } = await import("./animals.repository.js");
const { parseAnimalSearchIntent } = await import("./animalSearchIntent.js");
const { findPublicAnimalSpellingTerms } = await import("./animals.repository.js");

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
	it("loads only public name, breed, species and colour in one spelling dictionary query", async () => {
		assert.deepEqual(await findPublicAnimalSpellingTerms(), []);
		assert.equal(queries.length, 1);
		const { sql, params } = queries[0];
		assert.equal(sql.split(" from ")[0], 'select "name", "breed", "species_name", "colour"');
		assert.match(sql, /"medically_cleared" =/);
		assert.match(sql, /"deleted_at" is null/);
		assert.match(sql, /"published_at" is not null/);
		assert(params.includes("adopted") && params.includes("closed"));
	});
	it("retrieves every eligible tag candidate without semantic threshold or early LIMIT", async () => {
		await findPublicAnimalSearchCandidates([1, 0, 0], { type: "dog", size: "small", gender: "Female", vaccinationStatus: "vaccinated" });
		const { sql, params } = queries[0];
		const where = sql.split(" where ")[1];
		assert.equal(parameterFor(where, params, /"type" = \$(\d+)/), "dog");
		assert.equal(parameterFor(where, params, /"size" = \$(\d+)/), "small");
		assert.equal(parameterFor(where, params, /lower\(trim\("animals"\."gender"\)\) = \$(\d+)/), "female");
		assert.equal(parameterFor(where, params, /"vaccination_status" = \$(\d+)/), "vaccinated");
		assert.doesNotMatch(where, /search_embedding|<=>|limit|order by/i);
		assert.match(sql, /1 - \("animals"\."search_embedding" <=> \$\d+::vector\)/);
		assert.doesNotMatch(sql, /rescue_history|medical_clearance_notes|medical_cleared_by_clerk_user_id/);
	});
	it("G/K: executes the real tag-candidate WHERE against excluded animals, including perfect matches", async () => {
		// PGlite has no pgvector here. Evaluate the production WHERE unchanged,
		// using fixture similarity scores only for ranking (not a mock of filtering).
		const local = new PGlite();
		try {
			await local.exec(`CREATE TABLE animals(id text, behaviour text, description text,
				type text, size text, gender text, vaccination_status text, status text,
				deleted_at timestamptz, medically_cleared boolean, published_at timestamptz,
				similarity double precision);
				INSERT INTO animals VALUES ('A','Energetic and cuddly','A companion','dog','small',' Female ',
				'vaccinated','medically_cleared',NULL,true,now(),0.59);`);
			const excluded = [
				["large", "size='large'"], ["medium", "size='medium'"], ["extra-large", "size='extra_large'"],
				["cat", "type='cat'"], ["male", "gender='Male'"], ["unvaccinated", "vaccination_status='not_vaccinated'"],
				["adopted", "status='adopted'"], ["closed", "status='closed'"],
				["deleted", "deleted_at=now()"], ["uncleared", "medically_cleared=false"], ["unpublished", "published_at=NULL"],
			];
			for (const [id, change] of excluded) {
				await local.query(`INSERT INTO animals SELECT $1,behaviour,description,type,size,gender,
					vaccination_status,status,deleted_at,medically_cleared,published_at,0.99 FROM animals WHERE id='A'`, [id]);
				await local.query(`UPDATE animals SET ${change} WHERE id=$1`, [id]);
			}
			for (const query of ["small energetic dog", "female calm dog", "vaccinated friendly cat", "female small vaccinated energetic dog", "femlae smal vaccinted energtic bog"]) {
				const intent = parseAnimalSearchIntent(correctAnimalSearchQuery(query).correctedQuery);
				await findPublicAnimalSearchCandidates([1, 0, 0], intent);
				const generated = queries.at(-1)!;
				const params: unknown[] = [];
				const where = generated.sql.split(" where ")[1].replace(/\$(\d+)/g, (_, n: string) => {
					params.push(generated.params[Number(n) - 1]);
					return `$${params.length}`;
				});
				const result = await local.query<{ id: string; behaviour: string; description: string; similarity: number }>(
					`SELECT id,behaviour,description,similarity FROM animals WHERE ${where}`, params);
				const actual = result.rows.map((r) => r.id).sort();
				const expected = query === "small energetic dog" ? ["A", "male", "unvaccinated"]
					: query === "female calm dog" ? ["A", "extra-large", "large", "medium", "unvaccinated"]
					: query === "vaccinated friendly cat" ? ["cat"] : ["A"];
				assert.deepEqual(actual, expected, query);
				if (query === "female small vaccinated energetic dog") {
					assert.deepEqual(rankAnimalSearchCandidates(result.rows, intent.requestedTraits, { limit: 10, minSimilarity: 0.6 })
						.map((r) => r.animal.id), ["A"], "below-threshold tag match still obeys every gate");
				}
			}
		} finally { await local.close(); }
	});
	it("requires staff publication for both normal and AI public listings", async () => {
		await findPublicAnimals();
		await findSimilarPublicAnimals([0.1, 0.2, 0.3], { limit: 7, minSimilarity: 0.4 });
		for (const query of queries) {
			const where = query.sql.split(" where ")[1];
			assert.match(where, /"published_at" is not null/);
			assert.match(where, /"medically_cleared" =/);
			assert(query.params.includes("closed"));
			assert(query.params.includes("adopted"));
		}
	});
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
