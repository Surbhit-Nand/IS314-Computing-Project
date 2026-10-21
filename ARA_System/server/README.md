# ARA backend and tag-priority animal search

The Express/TypeScript API uses Route -> Service -> Repository layers, Zod
validation, Drizzle ORM, and PostgreSQL on Neon. Animal search is public at
`POST /api/animals/ai-search` with a JSON body such as
`{"query":"small calm dog"}`.

## Search flow

`AnimalListings.tsx` -> `animalsApi` -> `animals.routes` ->
`animals.service` -> whitespace normalization -> conservative `animalSearchSpelling`
correction -> deterministic `animalSearchIntent` parser -> structured filters and
requested traits plus a Gemini embedding of the **full corrected query** ->
repository SQL in PostgreSQL/pgvector -> tag-priority ranking in the
service -> ranked IDs -> existing frontend animal cards.

When traits are recognized, `findPublicAnimalSearchCandidates()` applies public
visibility and all explicit structured constraints in SQL, then retrieves every
eligible animal's ID, name, behaviour, description and pgvector similarity
(`1 - cosine distance`). It deliberately applies no semantic threshold or LIMIT.
`rankAnimalSearchCandidates()` extracts the full animal trait set and orders by:

1. Tag tier: all requested traits, some requested traits, then semantic-only.
2. Number of matched requested traits, descending.
3. Semantic similarity, descending (NULL scores last within a tag tier).
4. Animal ID for deterministic ties.

At least one matching trait qualifies independently of the semantic threshold,
including when a vector is missing. Zero-tag matches need a non-NULL score at
least `AI_SEARCH_MIN_SIMILARITY`. Results are deduplicated by ID, retaining the
highest-ranked occurrence, then capped at `AI_SEARCH_RESULT_LIMIT`.

When no traits are recognized, the existing `findSimilarPublicAnimals()` path
retains its SQL visibility, hard filters, non-NULL vector requirement, configured
threshold, cosine ordering and LIMIT. The historical zero-threshold setting on
that path means no distance exclusion. The full corrected query goes to Gemini
in both cases; no trait words are removed.

The single trait vocabulary and pure matching functions live in
`server/src/shared/animalTraits.ts`. `src/utils/animalTags.ts` imports/re-exports
them and keeps frontend Animal types and card-building logic locally. This
dependency-free shared module stays inside the server's existing `rootDir` and
is also compiled by Vite; no TypeScript config or output-path changes are needed.
Query traits use `extractTraits(query, null)`; profile traits use
`extractTraits(behaviour, description)`, without the seven-chip display cap.
The regex vocabulary, synonyms and negation guard are shared; the guard also
recognizes `don't`/`dont` so corrected negative traits stay negative.

The frontend preserves ID ranking and applies existing sidebar filters to that
result set. Zero matches remain empty; Clear all restores normal public listing.
A provider failure returns an availability error (503), allowing the frontend to
show an error and use normal listing; it is not reported as zero matches.

## High-confidence spelling correction

`correctAnimalSearchQuery()` is pure and returns the normalized original query,
corrected query, correction pairs and a changed flag. Correction happens before
hard-filter parsing, trait extraction and the single full-query Gemini embedding.
There is no spelling provider or per-word HTTP/database request.

Candidates come from the parser's structured term list, shared `ANIMAL_TRAITS`
keys/labels/literal regex aliases, and shared colour options. Regex fragments
such as `cuddl` are marked in the trait definition and excluded from correction
targets. Pure colour/species options live in `server/src/shared/animalOptions.ts`
and are re-exported by the existing frontend module. Breed seed terms, species,
colours, known trait/structured terms, common prose and negations are protected.
One batched query per search adds public animal names, breeds, species names and
colours using `publicAnimalVisibility()`; private fields are never read for spelling.
If that dictionary query fails, spelling is skipped and the original search runs.

The local optimal-string-alignment Damerau-Levenshtein algorithm accepts exactly
one insertion, deletion, substitution or adjacent transposition. Only a unique
nearest meaning qualifies; equally near alternatives stay unchanged. `cat/cats`
and `dog/dogs` count as one structured meaning, preferring the shorter form when
tied. Four-letter or longer tokens are considered first. Three-letter corrections
only target dog/cat, require recognized domain context after the first pass, and
are disabled if a dog/cat species is already present. Exact protected terms,
apostrophes, non-ASCII words and tokens longer than 32 letters are left intact.
Case and punctuation are retained; whitespace or capitalization alone never
creates a suggestion. Negations are never deleted or rewritten.

The API remains ordered IDs, with optional metadata only when a spelling changes:

```json
{"results":["animal-id"],"didYouMean":"small energetic cuddly dog"}
```

The original normalized query is retained internally, and the input retains the
user's original text for transparency. A clickable **Did you mean** phrase sits
beneath the search box. Accepting it replaces the input and searches again. New
searches, input edits, Clear all, empty input, acceptance and no-correction
responses clear the previous suggestion. Request sequencing rejects stale responses.

This is bounded, domain-aware English correction, not a general dictionary or a
guarantee for every typo/language. Unknown or ambiguous terms remain unchanged.
Public/custom vocabulary protects exact tokens; unlisted valid words cannot all
be guaranteed. Correction does not paraphrase, add preferences or replace the
existing semantic fallback, visibility, ranking, thresholds or embedding lifecycle.

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
`family dog` does not imply small. Recognized traits such as calm, energetic,
cuddly and good-with-children influence ranking, never hard eligibility. Other
descriptive phrases continue to match semantically. There are no new stored tags
or structured compatibility/children fields.

## Public visibility

Both normal listing and AI search use `publicAnimalVisibility()`:

```sql
status <> 'adopted'
AND status <> 'closed'
AND deleted_at IS NULL
AND medically_cleared = true
AND published_at IS NOT NULL
```

Embeddings may exist for adopted or uncleared animals. Visibility is enforced at
query time regardless of tag count or similarity. NULL vectors can qualify only
through a requested tag match; they cannot be semantic-only results.
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
the frontend (5173). The committed server command is
`node --use-system-ca --import tsx server/src/server.ts`;
it does not auto-reload. Restart after edits, or run
`npx tsx watch server/src/server.ts` locally. A local package-script override
is intentionally not part of the committed configuration.

## Checks and limitations

Run `npm run server:check`, `npm run build`, `npm run lint`, and `npm test`.
Focused tests cover parsing, shared vocabulary identity, full/partial tag tiers,
semantic fallback, threshold exceptions, NULL vectors, deduplication, late LIMIT,
SQL/visibility, embedding lifecycle/retries, provider failures and no-match results.
The candidate WHERE clause is also executed against an isolated PGlite fixture
to verify hard filters and every visibility exclusion without touching Neon.

Run the read-only live diagnostic (eight example queries, no profile/vector writes):

```sh
node --use-system-ca --import tsx server/src/scripts/diagnoseAnimalSearch.ts report.json
```

It calls the actual search service, Gemini and the development database. Its
local report includes filters, requested/matched traits, names, scores and ranking
reasons. Normal API responses contain ranked IDs and optional `didYouMean` only.
See [the recorded live results](../docs/ai-tag-priority-search-report.md).

Run the six spelling examples through the actual Express API with:

```sh
node --use-system-ca --import tsx server/src/scripts/diagnoseAnimalSearchSpelling.ts report.json
```

See [spelling verification](../docs/ai-search-spelling-report.md) for corrections,
filters, traits, returned names and regression results. Focused tests include
unit spelling cases, HTTP/service integration, SQL eligibility and real Chromium
suggestion/reset/race interactions. The browser test uses `ANIMAL_TEST_BROWSER`
or the default Windows Chrome path; it skips if no executable is available.

Trait queries read all eligible profiles to guarantee that no tag match is lost
behind a semantic candidate cap. This is suitable for the current small catalogue;
large catalogues will need a scalable, equivalent candidate strategy. There is no
silent candidate cap. No migration or embedding regeneration is needed.

The inherited regex matcher is not a general language interpreter: synonyms and
nearby negation are recognized, but complex negation and substring matches retain
the existing card vocabulary's limitations. A negated trait is not positively
requested; it is not a hard exclusion either. Semantic compatibility depends on
profile text quality and model calibration. Provider outages still return 503,
even for a tag query, preserving the current availability contract. Missing-vector
recovery and the 768-dimensional embedding lifecycle remain unchanged.
