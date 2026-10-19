# ARA backend and hybrid animal search

The Express/TypeScript API uses Route -> Service -> Repository layers, Zod
validation, Drizzle ORM, and PostgreSQL on Neon. Animal search is public at
`POST /api/animals/ai-search` with a JSON body such as
`{"query":"small calm dog"}`.

## Search flow

`AnimalListings.tsx` -> `animalsApi` -> `animals.routes` ->
`animals.service` -> deterministic `animalSearchIntent` parser -> structured
filters plus a Gemini embedding of the **full normalized query** -> repository
SQL in PostgreSQL/pgvector -> ranked IDs -> existing frontend animal cards.

SQL combines public visibility, explicit structured constraints, non-NULL
embeddings, and the minimum similarity threshold in WHERE, then orders by
ascending cosine distance (`<=>`) and applies the result limit. Similarity is
`1 - cosine distance`; filtering happens before ordering and LIMIT.

The frontend preserves ID ranking and applies existing sidebar filters to that
result set. Zero matches remain empty; Clear all restores normal public listing.
A provider failure returns an availability error (503), allowing the frontend to
show an error and use normal listing; it is not reported as zero matches.

## Explicit structured constraints

| Field | Parser output values |
|---|---|
| Type | `dog`, `cat` |
| Size | `small`, `medium`, `large`, `extra_large` |
| Gender | `Male`, `Female` |
| Vaccination | `vaccinated`, `not_vaccinated` |

Only confidently detected, explicit whole-word values become hard filters.
Conflicting, uncertain, or negated mentions do not become positive constraints;
`not vaccinated` maps to its explicit negative enum. Gender matching normalizes
legacy database case and whitespace. Only `dog` and `cat` are inferred as types:
rabbits, hamsters and every other species are stored as `type = 'other'` with the
species in `animals.species_name`, so a species word like `rabbit` stays in the
embedding text and is matched semantically rather than becoming a `type` filter
that could never match. There is no explicit `other` recognition rule.

`small calm dog` filters dog + small while embedding the entire phrase.
`small calm pet` filters only size. `good with cats` does not force type=cat;
`family dog` does not imply small. Calm, gentle, playful, energetic, family
friendly, good with children, and temperament/compatibility descriptions remain
semantic; there are no dedicated structured compatibility/children fields.

## Public visibility

Both normal listing and AI search use `publicAnimalVisibility()`:

```sql
status <> 'adopted'
AND deleted_at IS NULL
AND medically_cleared = true
```

Embeddings may exist for adopted or uncleared animals. Visibility is enforced at
query time regardless of similarity. NULL vectors are excluded from AI search.
Only public profile text is embedded; medical notes, rescue history, staff data,
and credentials are not sent to Gemini. API search responses contain ranked IDs,
not vectors or debugging scores.

## Embedding lifecycle

- New animal: embedding attempted after registration.
- Searchable profile edit: embedding regenerated.
- Unrelated edit with a valid embedding: embedding preserved.
- Unrelated edit with a NULL embedding: retry when suitable profile text exists.
- Successful veterinary clearance with a NULL embedding: the same retry helper runs.
- Provider failure: the staff/veterinary operation still succeeds; an embedding
  may remain NULL. Later save, clearance, or backfill can retry.
- `npm run ai:backfill`: generates only missing embeddings and updates only the
  vector, preserving unrelated profile fields and `updatedAt`.

Missing-vector recovery requires a non-deleted profile with a nonblank name and
a nonblank description or behaviour. It does not require public visibility.

## Configuration and development

Backend environment loads root `.env.local` before `server/.env`; existing
process environment takes precedence. Keep actual credentials ignored and use
`server/.env.example` for placeholders. Never expose `GEMINI_API_KEY` as a
frontend `VITE_*` variable.

| Setting | Current development configuration |
|---|---|
| Provider | Gemini |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-001` |
| Vector dimensions | 768 |
| `AI_SEARCH_MIN_SIMILARITY` | `0.60` |
| `AI_SEARCH_RESULT_LIMIT` | `10` |
| Provider request timeout | 10 seconds |

The model uses RETRIEVAL_DOCUMENT for profiles and RETRIEVAL_QUERY for searches.
The threshold is environment-driven; the code fallback is 0 if omitted. Set
0.60 explicitly to reproduce the current calibration. It was calibrated against
the current small dataset, not a universal cutoff; re-evaluate it as the
adoptable dataset becomes substantially larger.

Apply required database migrations (including `0013_*` for pgvector) before
starting the API. Coordinate migrations against the shared development database.
Run `npm run server:dev` for the API (8787) and `npm run dev` separately for
the frontend (5173). The committed server command is `tsx server/src/server.ts`;
it does not auto-reload. Restart after edits, or run
`npx tsx watch server/src/server.ts` locally. A local package-script override
is intentionally not part of the committed configuration.

## Checks and limitations

Run `npm run server:check`, `npm run build`, `npm run lint`, and `npm test`.
The accepted baseline is 87 passing animal tests and 99 passing tests overall,
with three unrelated Node 22 module-mocking failures in adoptions, rescue, and
staff. Tests cover parsing, SQL/visibility, ranking, embedding lifecycle/retries,
provider failures, backfill, empty queries, and no-match results.

The parser is conservative vocabulary-based detection, not a general language
interpreter. Semantic compatibility depends on profile text quality. Provider
outages may temporarily leave NULL vectors until a retry. Recalibrate the
threshold as the dataset grows; the three Node 22 failures remain known issues.
