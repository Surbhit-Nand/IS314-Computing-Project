import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ANIMAL_TRAITS, buildAnimalTags, extractTraits, traitLabel } from "./animalTags.js";
import type { Animal } from "../types/animal.js";
import * as sharedTraits from "../../server/src/shared/animalTraits.js";

function animal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: "1",
    publicId: "SPCA-2026-0001",
    name: "Test",
    type: "dog",
    speciesName: null,
    breed: null,
    estimatedAge: null,
    gender: "Male",
    colour: null,
    description: null,
    rescueDate: null,
    behaviour: null,
    rescueHistory: null,
    photoUrls: [],
    vaccinationStatus: "vaccinated",
    size: "small",
    veterinaryPriority: null,
    medicallyCleared: true,
    status: "medically_cleared",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("buildAnimalTags", () => {
  it("builds species, size and vaccination chips from structured fields", () => {
    const tags = buildAnimalTags(animal());
    const labels = tags.map((tag) => tag.label);
    assert.deepEqual(labels, ["Dog", "Small", "Vaccinated"]);
  });

  it("detects temperament from behaviour text", () => {
    const tags = buildAnimalTags(animal({ behaviour: "Calm and gentle with kids" }));
    assert.ok(tags.some((tag) => tag.filterValue === "good-with-children"));
  });

  it("detects temperament from the description when behaviour is blank", () => {
    const tags = buildAnimalTags(
      animal({ behaviour: null, description: "A very playful pup with high energy" }),
    );
    assert.ok(tags.some((tag) => tag.filterValue === "energetic"));
  });

  it("maps non-dog/cat species to the Other filter", () => {
    const tags = buildAnimalTags(animal({ type: "rabbit" }));
    assert.equal(tags[0]?.filterValue, "other");
  });

  it("omits the vaccination chip when not vaccinated", () => {
    const tags = buildAnimalTags(animal({ vaccinationStatus: "not_vaccinated" }));
    assert.ok(tags.every((tag) => tag.filterKey !== "vaccination"));
  });

  it("caps the number of chips", () => {
    const tags = buildAnimalTags(
      animal({ behaviour: "Calm, house-trained and good with children" }),
      3,
    );
    assert.equal(tags.length, 3);
  });
});

describe("extractTraits", () => {
  it("re-exports the exact same vocabulary and extractor used by backend search", () => {
    assert.equal(ANIMAL_TRAITS, sharedTraits.ANIMAL_TRAITS);
    assert.equal(extractTraits, sharedTraits.extractTraits);
    assert.equal(traitLabel, sharedTraits.traitLabel);
  });
  it("returns every matched trait in lexicon order", () => {
    assert.deepEqual(extractTraits("Calm and cuddly with kids", null), [
      "good-with-children",
      "calm",
      "cuddly",
    ]);
  });

  it("reads the description when behaviour is blank", () => {
    assert.deepEqual(extractTraits(null, "A desexed senior who loves walks"), [
      "loves-walks",
      "desexed",
      "senior",
    ]);
  });

  it("ignores negated mentions", () => {
    assert.deepEqual(extractTraits("Not good with children", null), []);
    assert.ok(!extractTraits("Never calm around strangers", null).includes("calm"));
  });

  it("matches whole words only", () => {
    assert.ok(!extractTraits("A shiny coat", null).includes("shy"));
  });

  it("returns an empty set for blank text", () => {
    assert.deepEqual(extractTraits(null, null), []);
    assert.deepEqual(extractTraits("   ", " "), []);
  });

  it("keeps every lexicon entry filter-routable with a label", () => {
    for (const trait of ANIMAL_TRAITS) {
      assert.equal(traitLabel(trait.key), trait.label);
    }
  });
});
