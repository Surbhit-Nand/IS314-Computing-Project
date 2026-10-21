import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAnimalSearchIntent, type AnimalSearchFilters } from "./animalSearchIntent.js";

const cases: [string, AnimalSearchFilters][] = [
	["small calm dog", { type: "dog", size: "small" }],
	["calm dog", { type: "dog" }],
	["small calm pet", { size: "small" }],
	["large energetic dog", { type: "dog", size: "large" }],
	["quiet cat", { type: "cat" }],
	["female small dog", { type: "dog", size: "small", gender: "Female" }],
	["calm family animal", {}],
	["calm animal", {}],
	["small calm dog good with children", { type: "dog", size: "small" }],
	["good with cats", {}],
	["good with cats, dogs and rabbits", {}],
	["not vaccinated dog", { type: "dog", vaccinationStatus: "not_vaccinated" }],
	["extra large dog", { type: "dog", size: "extra_large" }],
	// Rabbits are species "other" (migration 0015): "rabbit" stays semantic, not a type filter.
	["vaccinated male medium rabbit", { size: "medium", gender: "Male", vaccinationStatus: "vaccinated" }],
	["SMALL, CALM DOG!", { type: "dog", size: "small" }],
	["extra-large dogs", { type: "dog", size: "extra_large" }],
	["quiet cats", { type: "cat" }],
	["small rabbits", { size: "small" }],
	["family dog", { type: "dog" }],
	["quiet pet", {}],
	["other pet", {}],
	["other animal", {}],
	["small dog good with cats", { type: "dog", size: "small" }],
	["dog good with small cats and rabbits", { type: "dog" }],
	["dog good with cats and vaccinated", { type: "dog", vaccinationStatus: "vaccinated" }],
	["good with cats; female small dog", { type: "dog", size: "small", gender: "Female" }],
	["dog good with cats, dogs and rabbits", { type: "dog" }],
	["cat-friendly dog", { type: "dog" }],
	["dog friendly with cats", { type: "dog" }],
	["calm dog for small children", { type: "dog" }],
	["dog for a large family", { type: "dog" }],
	["dog or cat", {}],
	["small or medium dog", { type: "dog" }],
	["male or female cat", { type: "cat" }],
	["vaccinated or not vaccinated dog", { type: "dog" }],
	["not a dog", {}],
	// Negation scope is ambiguous here: it could mean "not a small dog".
	["not small dog", {}],
	["dog that is not small", { type: "dog" }],
	["dog not fully vaccinated", { type: "dog" }],
	["dog not yet vaccinated", { type: "dog" }],
	["dog that isn't vaccinated", { type: "dog" }],
	["maybe a cat", {}],
	["dog dog", { type: "dog" }],
	["dogmatic catalogue smallish largely femalevolent", {}],
];

describe("deterministic animal search intent", () => {
	for (const [query, expected] of cases) {
		it(query, () => {
			const { requestedTraits, ...intent } = parseAnimalSearchIntent(query);
			assert.ok(Array.isArray(requestedTraits));
			assert.deepEqual(intent, {
				type: undefined,
				size: undefined,
				gender: undefined,
				vaccinationStatus: undefined,
				...expected,
				semanticQuery: query,
			});
		});
	}
});

describe("requested search traits", () => {
	it("A: extracts hard constraints and energetic + cuddly without stripping semantic text", () => {
		assert.deepEqual(parseAnimalSearchIntent("small energetic cuddly dog"), {
			type: "dog", size: "small", gender: undefined, vaccinationStatus: undefined,
			requestedTraits: ["energetic", "cuddly"], semanticQuery: "small energetic cuddly dog",
		});
	});
	it("uses the card vocabulary, synonyms and lexicon order", () => {
		assert.deepEqual(parseAnimalSearchIntent("calm friendly dog good with children").requestedTraits,
			["good-with-children", "calm", "friendly"]);
		assert.deepEqual(parseAnimalSearchIntent("playful affectionate dog").requestedTraits, ["energetic", "cuddly"]);
	});
	for (const query of ["small dog that is not energetic", "dog that isn't cuddly", "dog that isn’t cuddly", "dog without puppy energy"]) {
		it(`H: does not request negated traits: ${query}`, () => {
			assert.deepEqual(parseAnimalSearchIntent(query).requestedTraits, []);
		});
	}
	it("I: does not invent traits for a descriptive query", () => {
		const intent = parseAnimalSearchIntent("small brown dog that likes staying near people");
		assert.deepEqual(intent.requestedTraits, []);
		assert.equal(intent.type, "dog");
		assert.equal(intent.size, "small");
	});
});
