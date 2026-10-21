# Tag-priority animal search implementation and live validation

Validated on 22 October 2026 (Pacific/Fiji). Live queries used the configured development database and Gemini; no profiles, embeddings or schema were changed. Results are a point-in-time snapshot.

## 1. Files added

- [server/src/shared/animalTraits.ts](../server/src/shared/animalTraits.ts)
- [server/src/modules/animals/animalSearchRanking.ts](../server/src/modules/animals/animalSearchRanking.ts)
- [server/src/modules/animals/animalSearchRanking.test.ts](../server/src/modules/animals/animalSearchRanking.test.ts)
- [server/src/scripts/diagnoseAnimalSearch.ts](../server/src/scripts/diagnoseAnimalSearch.ts)
- [docs/ai-tag-priority-search-report.md](../docs/ai-tag-priority-search-report.md)

## 2. Files modified

- [server/src/modules/animals/animalSearchIntent.ts](../server/src/modules/animals/animalSearchIntent.ts)
- [server/src/modules/animals/animalSearchIntent.test.ts](../server/src/modules/animals/animalSearchIntent.test.ts)
- [server/src/modules/animals/animals.repository.ts](../server/src/modules/animals/animals.repository.ts)
- [server/src/modules/animals/animals.repository.test.ts](../server/src/modules/animals/animals.repository.test.ts)
- [server/src/modules/animals/animals.service.ts](../server/src/modules/animals/animals.service.ts)
- [server/src/modules/animals/animals.service.test.ts](../server/src/modules/animals/animals.service.test.ts)
- [src/utils/animalTags.ts](../src/utils/animalTags.ts)
- [src/utils/animalTags.test.ts](../src/utils/animalTags.test.ts)
- [server/README.md](../server/README.md)
- [README.md](../README.md)
- [AGENTS.md](../AGENTS.md)

The pre-existing uncommitted search-bar centering changes in AnimalListings.tsx and AnimalListings.css were preserved and are not part of this search-ranking change.

## 3. Single source of truth

The existing pure vocabulary, labels, regexes, negation guard and extractTraits function were moved intact into server/src/shared/animalTraits.ts. The frontend animalTags.ts imports/re-exports the same objects/functions, retaining its Animal type dependency and buildAnimalTags implementation locally. The shared module has no imports, environment reads or runtime side effects. Keeping it within server/src avoids changing rootDir, emitted paths, or TypeScript configuration; Vite imports only this pure module.

## 4. Query trait extraction

parseAnimalSearchIntent preserves its existing structured parser and adds requestedTraits via extractTraits(fullNormalizedQuery, null). Traits follow vocabulary order, are unique, and the existing nearby-negation guard is reused. The entire normalized query still goes to Gemini. For small energetic cuddly dog: type=dog, size=small, requestedTraits=[energetic,cuddly]. Playful maps to energetic, affectionate to cuddly, and quiet to calm using the existing card vocabulary.

## 5. Animal trait matching

The ranker calls extractTraits(animal.behaviour, animal.description), then intersects that full set with the unique requested keys. It records matchedTagCount, requestedTagCount and tagMatchRatio internally. buildAnimalTags and its seven-chip cap are never used for ranking.

## 6. Exact ranking

After SQL eligibility filtering: tier 2 = every requested trait; tier 1 = some requested traits; tier 0 = no requested trait. Sort by tier descending, matchedTagCount descending, cosine similarity descending, then ID ascending for deterministic ties. Missing/non-finite scores sort last within their tag tier. Deduplicate by ID, then take AI_SEARCH_RESULT_LIMIT. The synthetic Milo/Buddy/Charlie test returns Milo (2/2, 0.66), Buddy (1/2, 0.90), Charlie (0/2, 0.95), exactly in that order.

## 7. Semantic fallback

The existing Gemini query embedding and pgvector cosine distance provide similarity; the stored embedding format and all 768 dimensions remain unchanged. Profiles with no requested tags can qualify semantically. With no recognized query traits, the original findSimilarPublicAnimals SQL ordering, threshold and limit path is retained.

## 8. Threshold policy

The live environment used AI_SEARCH_MIN_SIMILARITY=0.6 and AI_SEARCH_RESULT_LIMIT=10. A semantic-only candidate requires a non-NULL finite score >= the threshold. One or more matching tags qualifies independently of similarity, including a missing embedding. Neither path can bypass hard constraints or visibility. The unchanged no-traits path retains its historical behavior of disabling distance exclusion when the configured threshold is zero.

## 9. Avoiding premature LIMIT

Trait queries use findPublicAnimalSearchCandidates, selecting every eligible profile with ID, name, behaviour, description and SQL-computed similarity. There is no semantic threshold, non-NULL-vector filter, ordering cap or LIMIT on this candidate query. Tag ranking and the final result cap happen in the service. This guarantees that a below-threshold tag match or a tag match outside the semantic top ten can reach the final ranking.

## 10. Deduplication

After sorting, a Map keyed by animal ID retains the highest-ranked occurrence. Deduplication precedes the final limit so duplicates cannot consume result slots. The current single-table candidate query naturally returns one row per animal; the ranker also handles repeated candidates safely.

## 11. Hard filters

Both repository paths use publicSearchEligibility for type, size, case/whitespace-normalized gender and vaccination. Existing ambiguity and negation behavior in the structured parser is unchanged. Tests execute the production WHERE against an isolated PGlite fixture containing large/medium/extra-large dogs, cats, males and unvaccinated animals to verify each applicable constraint.

## 12. Public visibility and API/frontend boundary

publicAnimalVisibility remains mandatory: status is neither adopted nor closed; deletedAt is NULL; medicallyCleared is true; publishedAt is not NULL. Fixture tests exclude perfect-scoring adopted, closed, deleted, uncleared and unpublished profiles. The HTTP POST /api/animals/ai-search check returned status 200 and only a results array of unique ordered IDs (Shadow, Daisy, Duke, Peanut for calm friendly dog). No scores, vectors or private fields enter that response. AnimalListings continues to preserve backend order, then apply sidebar filters; empty results, reset behavior and existing cards remain unchanged.

## 13-14. Live queries

The following tables follow the IDs actually returned by the search service. Similarities are rounded to six decimal places for readability; ordering uses unrounded values. "missing vector" is SQL NULL, not zero. The full normalized query is the displayed query in every case.

### 1. small energetic cuddly dog

Hard filters: `{"type":"dog","size":"small"}`. Requested traits: `["energetic","cuddly"]`. Eligible candidates before ranking: 1.

| Rank | Animal | Matched trait keys | Matches | Similarity | Ranking reason |
|---|---|---|---|---|---|
| 1 | Peanut | none | 0/2 | 0.647466 | semantic fallback |

### 2. calm friendly dog

Hard filters: `{"type":"dog"}`. Requested traits: `["calm","friendly"]`. Eligible candidates before ranking: 5.

| Rank | Animal | Matched trait keys | Matches | Similarity | Ranking reason |
|---|---|---|---|---|---|
| 1 | Shadow | calm, friendly | 2/2 | 0.681176 | full tag match |
| 2 | Daisy | calm, friendly | 2/2 | 0.675448 | full tag match |
| 3 | Duke | calm | 1/2 | 0.688324 | partial tag match |
| 4 | Peanut | calm | 1/2 | 0.671764 | partial tag match |

### 3. small dog good with children

Hard filters: `{"type":"dog","size":"small"}`. Requested traits: `["good-with-children"]`. Eligible candidates before ranking: 1.

| Rank | Animal | Matched trait keys | Matches | Similarity | Ranking reason |
|---|---|---|---|---|---|
| 1 | Peanut | none | 0/1 | 0.659276 | semantic fallback |

### 4. playful affectionate dog

Hard filters: `{"type":"dog"}`. Requested traits: `["energetic","cuddly"]`. Eligible candidates before ranking: 5.

| Rank | Animal | Matched trait keys | Matches | Similarity | Ranking reason |
|---|---|---|---|---|---|
| 1 | Daisy | cuddly | 1/2 | 0.665572 | partial tag match |
| 2 | Duke | cuddly | 1/2 | 0.653986 | partial tag match |
| 3 | Fufu | energetic | 1/2 | missing vector | partial tag match |
| 4 | Shadow | none | 0/2 | 0.677727 | semantic fallback |
| 5 | Peanut | none | 0/2 | 0.651079 | semantic fallback |

### 5. energetic dog

Hard filters: `{"type":"dog"}`. Requested traits: `["energetic"]`. Eligible candidates before ranking: 5.

| Rank | Animal | Matched trait keys | Matches | Similarity | Ranking reason |
|---|---|---|---|---|---|
| 1 | Fufu | energetic | 1/1 | missing vector | full tag match |
| 2 | Shadow | none | 0/1 | 0.677172 | semantic fallback |
| 3 | Peanut | none | 0/1 | 0.644318 | semantic fallback |
| 4 | Duke | none | 0/1 | 0.635363 | semantic fallback |
| 5 | Daisy | none | 0/1 | 0.625654 | semantic fallback |

### 6. quiet cuddly cat

Hard filters: `{"type":"cat"}`. Requested traits: `["calm","cuddly"]`. Eligible candidates before ranking: 5.

| Rank | Animal | Matched trait keys | Matches | Similarity | Ranking reason |
|---|---|---|---|---|---|
| 1 | Mochi | calm, cuddly | 2/2 | 0.698309 | full tag match |
| 2 | Midnight | calm, cuddly | 2/2 | 0.697267 | full tag match |
| 3 | Marmalade | calm | 1/2 | 0.673071 | partial tag match |
| 4 | Tiger | calm | 1/2 | 0.671927 | partial tag match |
| 5 | Aqua | calm | 1/2 | missing vector | partial tag match |

### 7. friendly animal that likes people

Hard filters: `{}`. Requested traits: `["friendly"]`. Eligible candidates before ranking: 14.

| Rank | Animal | Matched trait keys | Matches | Similarity | Ranking reason |
|---|---|---|---|---|---|
| 1 | Shadow | friendly | 1/1 | 0.676042 | full tag match |
| 2 | Daisy | friendly | 1/1 | 0.654238 | full tag match |
| 3 | Domino | friendly | 1/1 | 0.637199 | full tag match |
| 4 | Duke | none | 0/1 | 0.661411 | semantic fallback |
| 5 | Honey | none | 0/1 | 0.660027 | semantic fallback |
| 6 | Tiger | none | 0/1 | 0.657799 | semantic fallback |
| 7 | Peanut | none | 0/1 | 0.653130 | semantic fallback |
| 8 | Marmalade | none | 0/1 | 0.650872 | semantic fallback |
| 9 | Midnight | none | 0/1 | 0.643035 | semantic fallback |
| 10 | Snowball | none | 0/1 | 0.640051 | semantic fallback |

### 8. dog that is not energetic

Hard filters: `{"type":"dog"}`. Requested traits: `[]`. Eligible candidates before ranking: 5.

| Rank | Animal | Matched trait keys | Matches | Similarity | Ranking reason |
|---|---|---|---|---|---|
| 1 | Shadow | none | 0/0 | 0.679013 | semantic fallback |
| 2 | Duke | none | 0/0 | 0.648746 | semantic fallback |
| 3 | Peanut | none | 0/0 | 0.647858 | semantic fallback |
| 4 | Daisy | none | 0/0 | 0.630615 | semantic fallback |

For small energetic cuddly dog, Peanut is the only eligible small dog in this database snapshot. It has no requested energetic/cuddly tags and qualifies as semantic fallback at 0.647466. The live dataset does not currently contain a small published dog with both requested tags; the controlled ranking tests cover that scenario without changing development data.

Fufu (energetic) and Aqua (calm) have missing embeddings but deterministic trait evidence, so they qualify for relevant trait queries. Their vectors were not regenerated. Existing retries and backfill remain available.

## 15-18. Validation

| Check | Result |
|---|---|
| npm run server:check | Passed |
| npm run build | Passed |
| npm run lint | Passed |
| npm test | Passed: 503 tests, 60 suites, 0 failed, 0 skipped |
| Focused search/tag tests | Passed: 124 tests |
| Real HTTP API response | Passed: 200, ordered unique IDs only |
| Eight live Gemini/database queries | All completed successfully |
| git diff --check | Passed |

No new failures were introduced. The full suite passes on this machine despite historical module-mocking warnings in repository documentation. No unrelated modules were changed to make tests pass. Registration generation, searchable-edit regeneration, unrelated-edit preservation, missing-vector retry, veterinary-clearance retry, provider failure tolerance and backfill tests all pass.

## 19. Limitations

- Trait queries scan all profiles that pass SQL visibility/hard filters and rank them in memory. This is intentional to avoid hiding exact matches and is suitable for the current small catalogue (14 public candidates in the broad live query). Larger catalogues need an equivalent scalable strategy; silently capping candidates would break the guarantee.
- Trait extraction retains the existing regex patterns and nearby-negation behavior. It is not a general natural-language parser; broad substrings and complex negation remain vocabulary limitations. Negative trait wording prevents a positive request but does not add a hard exclusion. Such queries still rely on semantic matching.
- A Gemini outage still returns the existing 503 availability response, including for trait queries. This change does not add a provider-independent degraded search mode.
- Existing model calibration may admit imperfect semantic matches at 0.60. Tag counts deliberately outrank embedding scores. No live examples prove a universally optimal threshold.
- Similarities can vary with provider/model changes and results can change with publication, adoption or profile edits. The stored embedding format was not changed, and no migration or embedding backfill was run.

Reproduce the live report from ARA_System:

```sh
node --use-system-ca --import tsx server/src/scripts/diagnoseAnimalSearch.ts report.json
```
