# Animal AI search spelling verification

Live verification: 2026-10-21T14:35:57.947Z. All six requests ran through the real Express POST /api/animals/ai-search endpoint with the configured development database and Gemini. The diagnostic is read-only: no profiles, embeddings, schema or credentials were changed.

## Live results

Names below are in backend result order. Every returned ID was checked against public profiles and every parsed hard constraint.

| Original query | Corrected/embedded query | Correction pairs | Hard filters | Requested traits | Returned animals |
|---|---|---|---|---|---|
| small energetic vuddly bog | small energetic cuddly dog | vuddly -> cuddly; bog -> dog | {"type":"dog","size":"small"} | energetic, cuddly | Peanut |
| smal calm dog | small calm dog | smal -> small | {"type":"dog","size":"small"} | calm | Peanut |
| quiet cudly catt | quiet cuddly cat | cudly -> cuddly; catt -> cat | {"type":"cat"} | calm, cuddly | Mochi, Midnight, Marmalade, Tiger, Aqua |
| vaccinted friendly dog | vaccinated friendly dog | vaccinted -> vaccinated | {"type":"dog","vaccinationStatus":"vaccinated"} | friendly | Shadow, Daisy, Peanut |
| not energtic dog | not energetic dog | energtic -> energetic | {} | None | Shadow, Peanut, Duke, Mochi, Daisy, Tiger, Midnight, Snowball, Marmalade |
| small energetic cuddly dog | small energetic cuddly dog | None | {"type":"dog","size":"small"} | energetic, cuddly | Peanut |

The first five responses include didYouMean equal to the corrected query. The final already-correct query omits didYouMean. The required example has type=dog, size=small, traits energetic+cuddly, and returns Peanut with the existing ranking.

**Inherited parser limitation:** for "not energetic dog", the existing qualifier parser treats the following species as part of the negated phrase, so it produces no type filter. Consequently cats can appear in semantic results. Spelling preserves that existing interpretation: energetic is NOT requested as a positive trait. Negative traits are not hard exclusions. This feature does not change structured parser scope or the meaning of negative trait ranking. "dog that is not energetic" retains an explicit dog filter under the existing parser.

## Implementation

1. Normalize whitespace and preserve originalQuery. The pure correctAnimalSearchQuery function returns correctedQuery, correction pairs and changed.
2. Protect known words case-insensitively. In addition to built-in domain terms, one public database query supplies current name, breed, speciesName and colour tokens. No private fields enter spelling. If that query fails, skip correction to avoid guessing about names and continue the original search.
3. Candidate words are derived from ANIMAL_SEARCH_STRUCTURED_TERMS, shared ANIMAL_TRAITS keys/labels/literal regex aliases, and shared colour options. Regex stems are excluded through spellingFragments on the trait entries. Breed seed rows, species options, valid domain terms and common prose/negation tokens are protection-only where they are not candidates.
4. Compute optimal-string-alignment Damerau-Levenshtein distance. Accept distance exactly 1: insertion, deletion, substitution, or adjacent transposition. At distance 1 this agrees with unrestricted Damerau-Levenshtein. Consider tokens of at least four letters first. Leave ambiguous nearest meanings unchanged. cat/cats and dog/dogs are equivalent structured meanings; a tie selects the shorter spelling.
5. Three-letter substitutions only target dog/cat and require recognized domain context after the first pass, with no dog/cat already present. Thus vuddly bog becomes cuddly dog while bare bog is left alone. Preserve case, punctuation, contractions and non-ASCII words. Ignore tokens longer than 32 letters. Whitespace or capitalization alone never triggers a suggestion.
6. Feed the entire corrected sentence into the existing intent parser, shared trait extractor and single Gemini query embedding. No spelling API, per-token network request, migration, stored tags or embedding regeneration is introduced.
7. Existing ranking remains all requested tags, partial requested tags, then semantic-only; within tiers, matched count then semantic similarity, with deterministic ID ties. At least one tag match can qualify below threshold; semantic-only results must meet the configured threshold. Public visibility and all parsed hard filters still gate retrieval. Deduplication and final limit remain unchanged.

The shared pure trait definitions stay in server/src/shared/animalTraits.ts. Existing frontend animalTags imports them. Pure colour/species options now live in server/src/shared/animalOptions.ts, re-exported by the original frontend options module; no TypeScript build restructuring was needed.

## API and UI

POST /api/animals/ai-search still accepts a query and returns ordered result IDs. Only changed spellings add optional didYouMean. It exposes no embeddings, similarity scores, internal confidence or full animal objects.

AnimalListings retains the original input and immediately shows results for the corrected phrase. The clickable Did you mean suggestion appears beneath the box. Clicking replaces the text, searches again and clears the suggestion. Editing, a new submission, empty/short input, Clear all, and no-correction responses clear it. Request sequence guards reject stale replies. Existing card ordering, sidebar narrowing, no-match behavior and provider-failure fallback are preserved.

Negations are never removed or rewritten. The shared trait negation guard also recognizes don't/dont, ensuring those corrected negative traits cannot become positive requested traits. Spelling itself has no dependency on Gemini; the HTTP search still preserves the existing 503 behavior when Gemini fails.

## Files added for spelling

- server/src/modules/animals/animalSearchSpelling.ts
- server/src/modules/animals/animalSearchSpelling.test.ts
- server/src/shared/animalOptions.ts (pure constants moved from frontend)
- server/src/scripts/diagnoseAnimalSearchSpelling.ts
- src/components/AnimalListings.browser.test.ts
- docs/ai-search-spelling-report.md

## Existing files updated for spelling

- server/src/modules/animals/animalSearchIntent.ts: exports its structured vocabulary for reuse.
- server/src/shared/animalTraits.ts: identifies regex fragments and extends shared negation protection.
- server/src/modules/animals/animals.repository.ts and animals.repository.test.ts: batched public dictionary and corrected-query SQL gate tests.
- server/src/modules/animals/animals.service.ts and animals.service.test.ts: one correction/search pipeline, original query metadata, integration and HTTP tests.
- server/src/modules/animals/animals.routes.ts: optional suggestion response and injectable handler for HTTP tests.
- src/services/animalsApi.ts: typed result IDs plus optional suggestion.
- src/components/AnimalListings.tsx and AnimalListings.css: suggestion state, clickable phrase and styling.
- src/features/animals/animalOptions.ts: re-exports shared constants.
- README.md, server/README.md, AGENTS.md: pipeline and behavior documentation.

Earlier uncommitted tag-priority/centering work is retained. No authentication, adoption, rescue, veterinary, dashboard or other production modules were changed for spelling.

## Verification

| Check | Result |
|---|---|
| npm run server:check | Passed |
| npm run build | Passed |
| npm run lint | Passed, no diagnostics |
| npm test | 548 passed, 0 failed, 0 skipped; 62 suites |
| Focused spelling/service/repository tests | 94 passed, 0 failed |
| Isolated Chromium suggestion test | Passed |
| Six live backend queries | Passed |

The supplied baseline was 503 passing tests; this feature adds 45. No failures
remain. The first full run hit an existing Medical Queue browser assertion;
the new browser test now uses its own Vite cache to avoid shared cache
interference. The subsequent complete suite passed, including that unchanged
Medical Queue test. No veterinary production code or tests were modified.

Focused tests cover all requested typo examples, general profile examples, case/whitespace, protected breeds and public names, unknown/ambiguous words, negation, corrected hard filters/traits, HTTP metadata and ranked IDs, provider failure, dictionary failure, unchanged ranking and real SQL visibility gates. Real Chromium interactions cover rendering, acceptance/research, resets, no correction, stale responses, sidebar narrowing, backend order and no-match/provider failure behavior.

## Limitations

- This is high-confidence domain-aware English correction, not a general-English dictionary or multilingual spell checker. Multiple-edit errors, unfamiliar names absent from public/seed data, and arbitrary valid prose are not universally covered. Ambiguous suggestions remain unchanged.
- Literal alias extraction follows the current shared trait regex grammar. New regex stems must be marked as spellingFragments, and more complex future regex syntax needs tests before becoming a spelling candidate source.
- The public dictionary is loaded once per search without per-word queries or a stale cache. Its cost grows with the public catalogue; the current catalogue is small. Existing tag candidate retrieval likewise remains uncapped before ranking.
- The inherited negation/type-scope limitation above and existing trait regex matching behavior remain. Spelling does not solve general language interpretation.
- Browser tests require an installed Chromium executable (ANIMAL_TEST_BROWSER can override the default Windows Chrome path).

Reproduce live verification from ARA_System with: node --use-system-ca --import tsx server/src/scripts/diagnoseAnimalSearchSpelling.ts report.json.
