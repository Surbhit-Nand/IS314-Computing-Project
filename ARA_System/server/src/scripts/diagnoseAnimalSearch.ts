import { writeFile } from "node:fs/promises";
import { env } from "../config/env.js";
import * as provider from "../services/aiSearchClient.js";
import * as repository from "../modules/animals/animals.repository.js";
import { normalizeSearchQuery, searchAnimalsWithAI } from "../modules/animals/animals.service.js";
import { parseAnimalSearchIntent } from "../modules/animals/animalSearchIntent.js";
import { rankAnimalSearchCandidates } from "../modules/animals/animalSearchRanking.js";

// Read-only diagnostic: invokes the actual search service and Gemini query
// embedding endpoint. Never writes profiles/vectors or runs migrations.
// Run from ARA_System:
// node --use-system-ca --import tsx server/src/scripts/diagnoseAnimalSearch.ts report.json
const queries = [
	"small energetic cuddly dog",
	"calm friendly dog",
	"small dog good with children",
	"playful affectionate dog",
	"energetic dog",
	"quiet cuddly cat",
	"friendly animal that likes people",
	"dog that is not energetic",
];

async function main() {
	const reports = [];
	for (const query of queries) {
		const { semanticQuery, requestedTraits, ...filters } = parseAnimalSearchIntent(normalizeSearchQuery(query)!);
		let candidates: Awaited<ReturnType<typeof repository.findPublicAnimalSearchCandidates>> = [];
		try {
			const results = await searchAnimalsWithAI(query, {
				provider,
				limit: env.aiSearchResultLimit,
				minSimilarity: env.aiSearchMinSimilarity,
				repository: {
					...repository,
					findPublicAnimalSearchCandidates: async (embedding, constraints) => {
						candidates = await repository.findPublicAnimalSearchCandidates(embedding, constraints);
						return candidates;
					},
					findSimilarPublicAnimals: async (embedding, options) => {
						const hits = await repository.findSimilarPublicAnimals(embedding, options);
						// Diagnostics only: fetch scores for the unchanged no-traits path.
						candidates = await repository.findPublicAnimalSearchCandidates(embedding, options.filters ?? {});
						return hits;
					},
				},
			});
			const ranked = rankAnimalSearchCandidates(candidates, requestedTraits, {
				minSimilarity: env.aiSearchMinSimilarity, limit: candidates.length,
			});
			const details = new Map(ranked.map((row) => [row.animal.id, row]));
			const report = {
				query, filters, requestedTraits, semanticQuery, eligibleCandidates: candidates.length,
				results: results.map(({ id }, index) => {
					const row = details.get(id);
					if (!row) throw new Error("A returned ID is missing from the diagnostic candidates");
					return {
						position: index + 1, id, name: row.animal.name,
						matchedTraits: row.matchedTraits, matchedTagCount: row.matchedTagCount,
						requestedTagCount: row.requestedTagCount, tagMatchRatio: row.tagMatchRatio,
						similarity: row.similarity, reason: row.reason,
					};
				}),
			};
			reports.push(report);
			console.log(JSON.stringify(report));
		} catch (error) {
			const report = { query, filters, requestedTraits, semanticQuery, error: error instanceof Error ? error.message : "Search failed" };
			reports.push(report);
			console.log(JSON.stringify(report));
			process.exitCode = 1;
		}
	}
	const output = JSON.stringify({
		generatedAt: new Date().toISOString(), model: env.geminiEmbeddingModel,
		minSimilarity: env.aiSearchMinSimilarity, limit: env.aiSearchResultLimit, queries: reports,
	}, null, 2);
	if (process.argv[2]) await writeFile(process.argv[2], `${output}\n`);
}

void main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : "Diagnostic failed");
	process.exitCode = 1;
});
