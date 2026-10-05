import { backfillMissingAnimalEmbeddings } from "../modules/animals/animals.service.js";

// One-off (but safely re-runnable) maintenance script: gives every animal that
// predates AI search - or whose embedding failed to generate while it was being
// registered - the search vector it needs to be findable by
// POST /api/animals/ai-search.
//
// Run: npm run ai:backfill
//
// It only ever fills in a missing search_embedding on an existing row: it never
// inserts an animal, never edits any other field, and picks up exactly where it
// left off if interrupted. Animals that fail (provider down, rate limit) are
// logged and retried on the next run.
async function main() {
	console.log("Backfilling AI search embeddings for animals that have none...");

	const result = await backfillMissingAnimalEmbeddings();

	console.log(
		`Done. Scanned ${result.scanned}, updated ${result.updated}, failed ${result.failed}.`,
	);

	if (result.failed > 0) {
		console.warn(
			`Animals that still need an embedding: ${result.failedAnimalIds.join(", ")}. ` +
				"Re-run `npm run ai:backfill` once the cause (usually the embedding provider) is fixed.",
		);
	}

	if (result.scanned === 0) {
		console.log("Nothing to do - every animal already has a search embedding.");
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("AI search embedding backfill failed:", error);
		process.exit(1);
	});