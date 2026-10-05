import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: "server/.env" });

const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkWebhookSigningSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
const databaseUrl = process.env.DATABASE_URL;
const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!clerkSecretKey) {
	throw new Error("CLERK_SECRET_KEY is required to start the API");
}

if (!databaseUrl) {
	throw new Error("DATABASE_URL is required to start the API");
}

// Cloudinary is optional at startup so local development can run without
// image-upload credentials. Uploads fail fast only when a route actually
// attempts to send a file to Cloudinary.

// DEV-ONLY. Defaults to false/off whenever the variable is absent (including
// in production, where it should never be set). Lets a developer without
// Clerk dashboard access skip the staff-role check locally - see
// requireRole() in middleware/rbac.ts for where this is actually applied.
// The value only ever comes from server/.env, which is gitignored, so this
// can't turn on by accident from anything checked into version control.
const devBypassAuth = process.env.DEV_BYPASS_AUTH === "true";

if (devBypassAuth) {
	console.warn(
		"[DEV_BYPASS_AUTH] Role checks are bypassed for every request. " +
			"This must never be enabled outside local development.",
	);
}

export const env = {
	clerkSecretKey,
	clerkWebhookSigningSecret,
	databaseUrl,
	port: Number(process.env.API_PORT ?? 8787),
	clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
	cloudinaryCloudName,
	cloudinaryApiKey,
	cloudinaryApiSecret,
	devBypassAuth,
	// AI animal search. Optional like Cloudinary: the API still boots without a
	// key, and only an actual AI search attempt fails (with a clear message the
	// frontend turns into "AI search is unavailable"), so ordinary listing,
	// filtering and profile browsing never depend on the provider. Backend-only
	// by design - there is deliberately no VITE_* equivalent, because anything
	// in VITE_* is shipped to the browser in the built bundle.
	geminiApiKey,
	geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",
	// How many ranked matches an AI search returns. Kept small so the listing
	// stays a shortlist of suggestions rather than a near-full catalogue dump.
	aiSearchResultLimit: Number(process.env.AI_SEARCH_RESULT_LIMIT ?? 10),
	// Optional minimum cosine similarity (0-1) a match must reach to be
	// returned. Defaults to 0, i.e. no exclusion - only ranking and the result
	// limit apply. Embedding models have a high baseline similarity between
	// unrelated sentences, so an invented cut-off would silently hide real
	// matches. Raise this only after checking it against real animal records
	// (see the AI search section of AGENTS.md).
	aiSearchMinSimilarity: Number(process.env.AI_SEARCH_MIN_SIMILARITY ?? 0),
};
