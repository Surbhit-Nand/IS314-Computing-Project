import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSpeciesAndBreed, type BreedLookups } from "./speciesBreed.js";

// A stub breeds table with the same matching as breeds.repository.ts:
// case-insensitive, spaces collapsed, returning the table's spelling.
const TABLE: { species: "dog" | "cat" | "other"; speciesName: string | null; name: string }[] = [
	...["Labrador Retriever", "Siberian Husky", "Mixed breed", "Unknown"].map((name) => ({
		species: "dog" as const,
		speciesName: null,
		name,
	})),
	...["Domestic Shorthair", "Russian Blue", "Mixed breed", "Unknown"].map((name) => ({
		species: "cat" as const,
		speciesName: null,
		name,
	})),
	...["Holland Lop", "Rex", "Mixed breed", "Unknown"].map((name) => ({
		species: "other" as const,
		speciesName: "Rabbit",
		name,
	})),
	...["Abyssinian", "Rex", "Mixed breed", "Unknown"].map((name) => ({
		species: "other" as const,
		speciesName: "Guinea Pig",
		name,
	})),
];
const norm = (value: string | null) => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const tableSize = TABLE.length;

const lookups: BreedLookups = {
	findBreedName: async (species, speciesName, name) =>
		TABLE.find(
			(row) => row.species === species && norm(row.speciesName) === norm(speciesName) && norm(row.name) === norm(name),
		)?.name,
	findListedSpeciesName: async (speciesName) =>
		TABLE.find((row) => row.species === "other" && norm(row.speciesName) === norm(speciesName))?.speciesName ??
		undefined,
};

describe("resolveSpeciesAndBreed", () => {
	it("stores a listed dog/cat breed in the table's spelling", async () => {
		assert.deepEqual(await resolveSpeciesAndBreed("dog", "", "  labrador RETRIEVER ", lookups), {
			type: "dog",
			speciesName: null,
			breed: "Labrador Retriever",
		});
		assert.deepEqual(await resolveSpeciesAndBreed("cat", "", "unknown", lookups), {
			type: "cat",
			speciesName: null,
			breed: "Unknown",
		});
	});

	it("accepts a valid typed dog/cat breed that isn't listed, capitalised, without adding it", async () => {
		assert.deepEqual(await resolveSpeciesAndBreed("cat", "", "russian blue mix", lookups), {
			type: "cat",
			speciesName: null,
			breed: "Russian Blue Mix",
		});
		assert.deepEqual(await resolveSpeciesAndBreed("dog", "", "king charles's spaniel", lookups), {
			type: "dog",
			speciesName: null,
			breed: "King Charles's Spaniel",
		});
		assert.equal(TABLE.length, tableSize, "typed breeds are never added to the table");
	});

	it("rejects digits, junk, 'Other' and species words as breeds", async () => {
		const cases: [string, RegExp][] = [
			["123", /can't contain numbers/],
			["aaaa", /doesn't look like a real name/],
			["qwerty", /doesn't look like a real name/],
			["Other", /can't be "Other"/],
			["cat", /is a species, not a breed/],
			["Pit_Bull", /letters, spaces, hyphens and apostrophes/],
			["", /Breed is required/],
		];
		for (const [breed, expected] of cases) {
			assert.match((await resolveSpeciesAndBreed("dog", "", breed, lookups)).error ?? "", expected, breed);
			assert.match((await resolveSpeciesAndBreed("other", "Rabbit", breed, lookups)).error ?? "", expected, breed);
		}
	});

	it("never stores a species name for dogs or cats", async () => {
		const result = await resolveSpeciesAndBreed("dog", "Rabbit", "Siberian Husky", lookups);
		assert.equal(result.speciesName, null);
	});

	it("stores Other + a typed dog/cat (any case, plurals) as a real dog/cat, checked against that list", async () => {
		assert.deepEqual(await resolveSpeciesAndBreed("other", "  DOGS ", "siberian husky", lookups), {
			type: "dog",
			speciesName: null,
			breed: "Siberian Husky",
		});
		assert.deepEqual(await resolveSpeciesAndBreed("other", "Cat", "Russian Blue", lookups), {
			type: "cat",
			speciesName: null,
			breed: "Russian Blue",
		});
		// A breed listed only for another species is typed (not listed) for a dog.
		assert.deepEqual(await resolveSpeciesAndBreed("other", "dog", "Holland Lop", lookups), {
			type: "dog",
			speciesName: null,
			breed: "Holland Lop",
		});
	});

	it("uses a listed Other species' spelling and its breed list", async () => {
		assert.deepEqual(await resolveSpeciesAndBreed("other", " guinea   PIG ", "abyssinian", lookups), {
			type: "other",
			speciesName: "Guinea Pig",
			breed: "Abyssinian",
		});
		// "Rex" exists for both Rabbit and Guinea Pig - matched per species.
		assert.deepEqual(await resolveSpeciesAndBreed("other", "rabbit", "REX", lookups), {
			type: "other",
			speciesName: "Rabbit",
			breed: "Rex",
		});
		// Unlisted but valid typed breed for a listed species.
		assert.deepEqual(await resolveSpeciesAndBreed("other", "Rabbit", "flemish giant mix", lookups), {
			type: "other",
			speciesName: "Rabbit",
			breed: "Flemish Giant Mix",
		});
	});

	it("keeps a typed breed for a species with no list, and validates the species", async () => {
		assert.deepEqual(await resolveSpeciesAndBreed("other", "snake", "ball python", lookups), {
			type: "other",
			speciesName: "Snake",
			breed: "Ball Python",
		});
		assert.match((await resolveSpeciesAndBreed("other", "123", "Dutch", lookups)).error ?? "", /Species can't contain numbers/);
		assert.match((await resolveSpeciesAndBreed("other", "", "Dutch", lookups)).error ?? "", /Species is required/);
	});
});
