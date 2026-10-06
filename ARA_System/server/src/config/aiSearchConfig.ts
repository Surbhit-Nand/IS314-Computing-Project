// Single source of truth for the AI animal-search embedding width.
//
// This constant is used in three places that MUST agree, and a mismatch
// between any two of them is a runtime Postgres error ("expected N dimensions,
// not M") rather than a TypeScript error:
//
//   1. server/src/db/schema.ts          -> vector(N) on animals.search_embedding
//   2. server/src/db/migrations/0011_*  -> the ALTER TABLE that created it
//   3. server/src/services/aiSearchClient.ts -> outputDimensionality requested
//      from the embedding provider
//
// It lives in its own dependency-free module (no env access, no side effects)
// so schema.ts can import it without dragging config/env.ts - which throws
// without CLERK_SECRET_KEY - into drizzle-kit's schema loader.
//
// 768 is gemini-embedding-001 truncated through Matryoshka (MRL). The model
// natively returns 3072 dimensions; 768 keeps a row's vector small (3KB)
// with negligible quality loss at this project's dataset size. If you ever
// change this, you also need a migration that rewrites the column type.
export const ANIMAL_SEARCH_EMBEDDING_DIMENSIONS = 768;