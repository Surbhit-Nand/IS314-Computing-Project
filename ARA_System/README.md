# ARA: Animal Rescue and Adoption Management System

ARA uses a React/TypeScript Vite frontend and an Express/TypeScript backend with
PostgreSQL on Neon. Start the frontend with `npm run dev` and the API separately
with `npm run server:dev` after configuring local environment files and applying
required migrations.

Animal listings support tag-priority search with semantic fallback: explicit
structured characteristics restrict public candidates, then matches from the
shared animal-card trait vocabulary rank ahead of semantic-only matches.
Gemini embeddings and pgvector break tag ties and find relevant descriptions.
Existing cards, sidebar filters, no-match handling, and reset behavior are preserved.
High-confidence spelling correction runs before interpretation and embedding.
When a query is corrected, search uses the corrected text immediately and shows
a clickable **Did you mean** suggestion while retaining the original input.
Uncertain words are left unchanged; spelling does not replace semantic search.
See [spelling verification and limitations](docs/ai-search-spelling-report.md).

Adopters with approved or completed applications can use **My Animals** to view
their animal's veterinary history and manage owner-booked appointments.
Ownership is checked against the adoption application on each API request;
approval transfers ownership and removes the animal from public listings.
Owner appointments use the same `vet_appointments` schedule as veterinary
follow-ups; slots are offered in Fiji time, Monday-Friday 08:00-17:00 and
Saturday 08:00-13:00, in 30-minute increments. Apply pending database changes
with `npm run db:migrate`, after `npm install` and before starting the API. The
shared database matches the journal as of 19 October 2026, including the
guarded `0021_remove_rapid_triage` cleanup and the `adoption_status_valid`
CHECK. See
[docs/kara-merge-migration-review.md](docs/kara-merge-migration-review.md).

See [backend setup and AI search](server/README.md) for configuration, visibility,
embedding retries/backfill, development reload instructions, and known test
limitations. See [architecture](ARCHITECTURE.md) for system layers.

Validation: `npm run server:check`, `npm run build`, `npm run lint`, and
`npm test`. Never commit actual environment files or credentials.
