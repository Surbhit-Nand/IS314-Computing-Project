# ARA: Animal Rescue and Adoption Management System

ARA uses a React/TypeScript Vite frontend and an Express/TypeScript backend with
PostgreSQL on Neon. Start the frontend with `npm run dev` and the API separately
with `npm run server:dev` after configuring local environment files and applying
required migrations.

Animal listings support hybrid search: explicit structured characteristics
restrict public candidates, while Gemini embeddings and pgvector rank those
candidates semantically. Existing cards, sidebar filters, no-match handling, and
reset behavior are preserved.

See [backend setup and AI search](server/README.md) for configuration, visibility,
embedding retries/backfill, development reload instructions, and known test
limitations. See [architecture](ARCHITECTURE.md) for system layers.

Validation: `npm run server:check`, `npm run build`, `npm run lint`, and
`npm test`. Never commit actual environment files or credentials.
