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
	["vaccinated male medium rabbit", { type: "rabbit", size: "medium", gender: "Male", vaccinationStatus: "vaccinated" }],
	["SMALL, CALM DOG!", { type: "dog", size: "small" }],
	["extra-large dogs", { type: "dog", size: "extra_large" }],
	["quiet cats", { type: "cat" }],
	["small rabbits", { type: "rabbit", size: "small" }],
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
			assert.deepEqual(parseAnimalSearchIntent(query), {
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
