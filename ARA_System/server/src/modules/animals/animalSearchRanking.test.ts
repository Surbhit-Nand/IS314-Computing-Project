import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rankAnimalSearchCandidates, type AnimalSearchCandidate } from "./animalSearchRanking.js";

const options = { minSimilarity: 0.6, limit: 10 };
function candidate(id: string, behaviour: string, similarity: number | null, description = ""): AnimalSearchCandidate {
	return { id, behaviour, description, similarity };
}
const ids = (rows: ReturnType<typeof rankAnimalSearchCandidates>) => rows.map(({ animal }) => animal.id);

describe("tag-priority ranking", () => {
	it("B/D: all tags outrank partial tags, then semantically relevant descriptions", () => {
		const result = rankAnimalSearchCandidates([
			candidate("Charlie", "", 0.95, "He loves activity and affection."),
			candidate("Buddy", "Energetic", 0.90),
			candidate("Milo", "Energetic and cuddly", 0.66),
		], ["energetic", "cuddly"], options);
		assert.deepEqual(ids(result), ["Milo", "Buddy", "Charlie"]);
		assert.deepEqual(result.map((r) => r.reason), ["full tag match", "partial tag match", "semantic fallback"]);
		assert.deepEqual(result.map((r) => r.tagMatchRatio), [1, 0.5, 0]);
	});
	it("C: tag counts take priority even within the partial tier", () => {
		assert.deepEqual(ids(rankAnimalSearchCandidates([
			candidate("C", "Energetic", 0.99),
			candidate("B", "Energetic and cuddly", 0.8),
			candidate("A", "Energetic, cuddly and friendly", 0.61),
		], ["energetic", "cuddly", "friendly"], options)), ["A", "B", "C"]);
	});
	it("E/F: applies threshold only to zero-tag candidates, including the exact boundary", () => {
		assert.deepEqual(ids(rankAnimalSearchCandidates([
			candidate("irrelevant", "", 0.59), candidate("fallback", "", 0.6),
			candidate("tag", "Cuddly", 0.59),
		], ["cuddly"], options)), ["tag", "fallback"]);
	});
	it("allows missing vectors only with deterministic trait evidence", () => {
		assert.deepEqual(ids(rankAnimalSearchCandidates([
			candidate("missing", "", null), candidate("tag", "Energetic", null),
			candidate("scored-tag", "Energetic", 0.2), candidate("invalid", "", NaN),
		], ["energetic"], options)), ["scored-tag", "tag"]);
	});
	it("uses semantic similarity to break tag ties, then ID for reproducible ordering", () => {
		assert.deepEqual(ids(rankAnimalSearchCandidates([
			candidate("b", "Energetic", 0.8), candidate("a", "Energetic", 0.8),
			candidate("best", "Energetic", 0.9),
		], ["energetic", "cuddly"], options)), ["best", "a", "b"]);
	});
	it("matches traits from description and beyond the card's seven-chip display cap", () => {
		const animal = candidate("many", "Good with children, calm, energetic, house-trained, good with pets, friendly, shy, independent", 0.1, "Cuddly and loyal.");
		const result = rankAnimalSearchCandidates([animal], ["cuddly", "loyal"], options);
		assert.deepEqual(result[0].matchedTraits, ["cuddly", "loyal"]);
		assert.equal(result[0].tagMatchTier, 2);
	});
	it("does not treat an animal's negated profile traits as evidence", () => {
		assert.deepEqual(rankAnimalSearchCandidates([candidate("a", "Not energetic", 0.59)], ["energetic"], options), []);
	});
	it("J: deduplicates by ID, retaining the higher-priority match before limiting", () => {
		const result = rankAnimalSearchCandidates([
			candidate("same", "", 0.99), candidate("same", "Energetic", 0.59),
			candidate("other", "", 0.8),
		], ["energetic", "energetic"], { ...options, limit: 2 });
		assert.deepEqual(ids(result), ["same", "other"]);
		assert.equal(result[0].reason, "full tag match");
		assert.equal(result[0].requestedTagCount, 1);
	});
	it("L: finds a tag match outside the semantic top ten and applies the final limit last", () => {
		const semanticTop = Array.from({ length: 20 }, (_, i) => candidate(`semantic-${i}`, "", 0.99 - i * 0.01));
		const result = rankAnimalSearchCandidates([...semanticTop, candidate("tag-last", "Cuddly", 0.3)], ["cuddly"], options);
		assert.equal(result.length, 10);
		assert.equal(result[0].animal.id, "tag-last");
		assert.deepEqual(ids(result).slice(1), semanticTop.slice(0, 9).map((r) => r.id));
	});
	it("I: with no traits, uses only semantic scores and the threshold", () => {
		assert.deepEqual(ids(rankAnimalSearchCandidates([
			candidate("low", "Energetic and cuddly", 0.59), candidate("second", "", 0.7), candidate("first", "", 0.9),
		], [], options)), ["first", "second"]);
	});
});
