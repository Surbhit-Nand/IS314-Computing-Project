import { ANIMAL_SEARCH_EMBEDDING_DIMENSIONS } from "../config/aiSearchConfig.js";
import { env } from "../config/env.js";
import { AiSearchUnavailableError } from "../shared/errors/applicationError.js";

// The one place in the codebase that knows which AI provider we use.
//
// Per AGENTS.md, third-party providers sit behind a service layer rather than
// being called from deep in the code, because vendor lock-in is a named risk.
// Swapping Gemini for OpenAI (or a self-hosted model) means rewriting the body
// of `requestEmbedding` below and changing GEMINI_API_KEY - nothing in
// animals.routes.ts, animals.repository.ts, animals.service.ts or the React
// frontend knows a provider exists.
//
// What this module is allowed to do: turn text into a vector.
// What it must never do: touch the database, decide whether an animal is
// adoptable, read or write an animal record, or build an HTTP response.
// Availability stays a database decision (animals.repository.ts); this file
// only measures how similar two pieces of text are.

// Throws AiSearchUnavailableError on any provider problem. The error type lives
// in shared/errors so routes and services can handle it without importing
// anything provider-specific from this module. Callers decide what a failure
// means - the search endpoint turns it into a 503 the frontend shows as "AI
// search is unavailable", while registration/edit logs it and carries on with a
// null embedding so the staff member's work is never lost.

const EMBEDDING_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

// An embedding call sits between a public visitor and their search results, so
// it gets a hard ceiling rather than hanging the request indefinitely. 10s is
// well inside the few-seconds budget the listing page expects.
const REQUEST_TIMEOUT_MS = 10_000;

// Gemini's embedding models are tuned asymmetrically: `RETRIEVAL_DOCUMENT`
// for the text being stored, `RETRIEVAL_QUERY` for the text being searched
// for. Using the matching task type for each side measurably improves ranking
// over embedding both as plain text, and it is the reason this file takes a
// `purpose` argument instead of just "give me a vector".
export type EmbeddingPurpose = "document" | "query";

const TASK_TYPES: Record<EmbeddingPurpose, string> = {
	document: "RETRIEVAL_DOCUMENT",
	query: "RETRIEVAL_QUERY",
};

export function isAiSearchConfigured(): boolean {
	return Boolean(env.geminiApiKey);
}

// Optional at startup, exactly like Cloudinary: the API boots and every
// non-AI feature works without the key, and only an actual search reports
// itself unavailable.
if (!isAiSearchConfigured()) {
	console.warn(
		"[AI search] GEMINI_API_KEY is not set; AI animal search is unavailable until it is. " +
			"Listing, filtering and animal profiles are unaffected.",
	);
}

// Turns one piece of text into an embedding vector of exactly
// ANIMAL_SEARCH_EMBEDDING_DIMENSIONS numbers.
//
// Throws AiSearchUnavailableError on any provider problem rather than returning
// a partial/short vector: a vector of the wrong width is rejected by Postgres
// on insert and on search, so failing loudly here is what keeps a bad response
// from corrupting an animal's stored search text.
async function requestEmbedding(text: string, purpose: EmbeddingPurpose): Promise<number[]> {
	const apiKey = env.geminiApiKey;
	if (!apiKey) {
		throw new AiSearchUnavailableError("GEMINI_API_KEY is not configured");
	}

	if (text.trim() === "") {
		throw new AiSearchUnavailableError("Cannot embed empty text");
	}

	// Sent as a header rather than a `?key=` query string so the credential
	// cannot end up in a URL that gets logged.
	let response: Response;
	try {
		response = await fetch(
			`${EMBEDDING_ENDPOINT}/${encodeURIComponent(env.geminiEmbeddingModel)}:embedContent`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-goog-api-key": apiKey,
				},
				body: JSON.stringify({
					content: { parts: [{ text }] },
					taskType: TASK_TYPES[purpose],
					outputDimensionality: ANIMAL_SEARCH_EMBEDDING_DIMENSIONS,
				}),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			},
		);
	} catch (error) {
		// Network error or the timeout above. The provider's message can name
		// internal details, so only our own message is surfaced.
		throw new AiSearchUnavailableError(
			`Could not reach the embedding provider: ${
				error instanceof Error ? error.message : "unknown error"
			}`,
		);
	}

	if (!response.ok) {
		// Provider error text is useful in the server log and must never reach
		// the browser, so it is logged here and not put in the thrown message.
		const detail = await response.text().catch(() => "");
		console.warn(
			`[AI search] Embedding request failed with HTTP ${response.status}: ${detail.slice(0, 500)}`,
		);
		throw new AiSearchUnavailableError(
			`Embedding provider returned HTTP ${response.status}`,
		);
	}

	const payload = (await response.json()) as {
		embedding?: { values?: unknown };
	};
	const values = payload.embedding?.values;

	if (!Array.isArray(values) || values.length === 0) {
		throw new AiSearchUnavailableError("Embedding provider returned no vector");
	}
	if (values.length !== ANIMAL_SEARCH_EMBEDDING_DIMENSIONS) {
		throw new AiSearchUnavailableError(
			`Embedding provider returned ${values.length} dimensions, expected ${ANIMAL_SEARCH_EMBEDDING_DIMENSIONS}`,
		);
	}

	return values as number[];
}

// Embeds an animal profile for storage. `document` because this text is the
// thing being searched for later.
export function embedAnimalProfileText(text: string): Promise<number[]> {
	return requestEmbedding(text, "document");
}

// Embeds a searcher's sentence for comparison against stored animal vectors.
// `query` because this is the question being asked of the catalogue.
export function embedSearchQuery(text: string): Promise<number[]> {
	return requestEmbedding(text, "query");
}