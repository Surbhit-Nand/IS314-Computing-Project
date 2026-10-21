import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { correctAnimalSearchQuery, spellingEditDistance } from "./animalSearchSpelling.js";
import { parseAnimalSearchIntent } from "./animalSearchIntent.js";

describe("high-confidence animal search spelling", () => {
	for (const [query, expected] of [
		["small energetic vuddly bog", "small energetic cuddly dog"],
		["smal energeitc cuddly dog", "small energetic cuddly dog"],
		["quiet cudly catt", "quiet cuddly cat"],
		["vaccinted friendly dog", "vaccinated friendly dog"],
		["femlae small dog", "female small dog"],
		["not energtic dog", "not energetic dog"],
		["smal calm dog", "small calm dog"],
		["vuddly bog", "cuddly dog"],
		["larg energetic dog", "large energetic dog"],
		["cudlly dog", "cuddly dog"],
		["affectionte dog", "affectionate dog"],
		["playfull puppy", "playful puppy"],
		["gentel cat", "gentle cat"],
		["brwon dog", "brown dog"],
	]) {
		it(`${query} -> ${expected}`, () => {
			const result = correctAnimalSearchQuery(query);
			assert.equal(result.originalQuery, query);
			assert.equal(result.correctedQuery, expected);
			assert.equal(result.changed, true);
		});
	}
	for (const query of [
		"small energetic cuddly dog", "Shih Tzu", "German Shepherd", "Rottweiler",
		"Labrador", "Guinea Pig", "Rabbit", "good with children", "dog that is not energetic",
		"dog with a brown coat", "dog that likes staying near people", "qxzxyz dog",
		"cals dog", // equally close to cats and calm: different meanings
		"bog", // no context for a risky three-letter substitution
	]) {
		it(`preserves ${query}`, () => {
			assert.deepEqual(correctAnimalSearchQuery(query), {
				originalQuery: query, correctedQuery: query, corrections: [], changed: false,
			});
		});
	}
	it("retains public names and custom breed/species/colour words", () => {
		const query = "Vuddly Bog the Gentel dog";
		assert.equal(correctAnimalSearchQuery(query, { protectedTerms: ["Vuddly Bog", "Gentel"] }).changed, false);
	});
	it("normalizes whitespace without a suggestion and preserves capitalization", () => {
		assert.equal(correctAnimalSearchQuery(" Small   Energetic\tCuddly DOG ").changed, false);
		assert.equal(correctAnimalSearchQuery("SMAL Cudly dog").correctedQuery, "SMALL Cuddly dog");
	});
	it("records correction pairs and feeds structured filters and traits", () => {
		const result = correctAnimalSearchQuery("small energetic vuddly bog");
		assert.deepEqual(result.corrections, [{ original: "vuddly", corrected: "cuddly" }, { original: "bog", corrected: "dog" }]);
		assert.deepEqual(parseAnimalSearchIntent(result.correctedQuery), {
			type: "dog", size: "small", requestedTraits: ["energetic", "cuddly"], semanticQuery: result.correctedQuery,
			gender: undefined, vaccinationStatus: undefined,
		});
	});
	for (const negation of ["not", "isn't", "isnt", "without", "don't", "dont", "isn\u2019t"]) {
		it(`preserves ${negation} and never requests the negated trait`, () => {
			const result = correctAnimalSearchQuery(`${negation} energtic dog`);
			assert.equal(result.correctedQuery, `${negation} energetic dog`);
			assert(!parseAnimalSearchIntent(result.correctedQuery).requestedTraits.includes("energetic"));
		});
	}
	it("counts a transposition as one edit and does not guess at multiple-edit errors", () => {
		assert.equal(spellingEditDistance("energeitc", "energetic"), 1);
		assert.equal(correctAnimalSearchQuery("enrgtc dog").changed, false);
	});
});
