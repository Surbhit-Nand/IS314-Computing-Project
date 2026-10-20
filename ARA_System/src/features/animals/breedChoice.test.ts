import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AnimalFormInput } from "../../types/animal";
import { BREED_OTHER_OPTION, findListedBreed, orderBreedOptions } from "./breedChoice.js";
import { getAnimalFormErrors, validateAnimalForm, toAnimalPayload } from "./validateAnimalForm.js";

// Run: npm test. The dog/cat Breed dropdown's "Other" option and the typed
// breed box (AnimalProfileFields.tsx) are driven by these helpers and by
// getAnimalFormErrors, so this covers the rules without a browser.

// As returned by GET /api/animals/breeds/dog - alphabetical from the table.
const DOG_BREEDS = ["Beagle", "Labrador Retriever", "Mixed breed", "Siberian Husky", "Unknown"];

describe("orderBreedOptions", () => {
  it("lists real breeds A-Z, then Mixed breed and Unknown last", () => {
    assert.deepEqual(orderBreedOptions(DOG_BREEDS), [
      "Beagle",
      "Labrador Retriever",
      "Siberian Husky",
      "Mixed breed",
      "Unknown",
    ]);
  });

  it("never contains the form-only Other option", () => {
    assert.ok(!orderBreedOptions(DOG_BREEDS).includes(BREED_OTHER_OPTION));
    assert.ok(!orderBreedOptions(DOG_BREEDS).includes("Other"));
  });
});

describe("findListedBreed", () => {
  it("matches typed text to a listed breed, trimmed and case-insensitive", () => {
    assert.equal(findListedBreed("  siberian   HUSKY ", DOG_BREEDS), "Siberian Husky");
    assert.equal(findListedBreed("unknown", DOG_BREEDS), "Unknown");
  });

  it("returns undefined for unlisted text, partial matches, Other, or no list", () => {
    assert.equal(findListedBreed("Russian Blue Mix", DOG_BREEDS), undefined);
    assert.equal(findListedBreed("Husky", DOG_BREEDS), undefined);
    assert.equal(findListedBreed("Other", DOG_BREEDS), undefined);
    assert.equal(findListedBreed("", DOG_BREEDS), undefined);
    assert.equal(findListedBreed("Beagle", undefined), undefined);
  });
});

const VALID_FORM: AnimalFormInput = {
  name: "Koda",
  type: "dog",
  speciesName: "",
  breed: "Siberian Husky",
  ageValue: "2",
  ageUnit: "years",
  gender: "Male",
  colour: "Black and White",
  description: "Striking husky with a grey-and-white coat and a fluffy tail.",
  behaviour: "Energetic and playful, needs plenty of daily exercise and a yard.",
  rescueHistory: "Surrendered by an owner in Nadi who could not manage his exercise needs.",
  photoUrls: ["https://example.com/koda.jpg"],
  vaccinationStatus: "vaccinated",
  size: "large",
  veterinaryPriority: "moderate",
};

it("registration accepts an empty rescue journey and record saves leave it to publication review", () => {
  const form = { ...VALID_FORM, rescueHistory: "" };
  assert.equal(validateAnimalForm(form, DOG_BREEDS), null);
  assert.equal("rescueHistory" in toAnimalPayload(form), false);
  assert.equal("rescueHistory" in toAnimalPayload(VALID_FORM), false);
});

function breedError(breed: string, type: AnimalFormInput["type"] = "dog") {
  return getAnimalFormErrors({ ...VALID_FORM, type, speciesName: type === "other" ? "Rabbit" : "", breed }, DOG_BREEDS)
    .breed;
}

describe("getAnimalFormErrors: breed", () => {
  it("accepts a listed breed", () => {
    assert.equal(breedError("Siberian Husky"), undefined);
    assert.equal(validateAnimalForm(VALID_FORM, DOG_BREEDS), null);
  });

  it("accepts valid typed breeds that aren't listed - existing animals open without an error", () => {
    // Luna, Duke, Blackie, Koda, Rocky/Bula on the shared database.
    for (const breed of ["Russian Blue Mix", "Rottweiler Mix", "German Shepard", "Husky", "Fijian mixed breed"]) {
      assert.equal(breedError(breed), undefined, breed);
    }
  });

  it("flags invalid saved or typed breeds so staff must fix them", () => {
    assert.match(breedError("cat") ?? "", /is a species, not a breed/); // Aqua
    assert.match(breedError("Other") ?? "", /can't be "Other"/);
    assert.match(breedError("123") ?? "", /can't contain numbers/);
    assert.match(breedError("aaaa") ?? "", /real name/);
    assert.match(breedError("qwerty") ?? "", /real name/);
    assert.match(breedError("") ?? "", /select the animal's breed, or choose Other/);
  });

  it("uses a typed species' list like a dog's: listed ok, empty asks to select or type", () => {
    const RABBIT = ["Dutch", "Holland Lop", "Mixed breed", "Unknown"];
    const rabbit = { ...VALID_FORM, type: "other" as const, speciesName: "Rabbit" };
    assert.equal(getAnimalFormErrors({ ...rabbit, breed: "Holland Lop" }, RABBIT).breed, undefined);
    assert.equal(getAnimalFormErrors({ ...rabbit, breed: "Lionhead Mix" }, RABBIT).breed, undefined);
    assert.match(getAnimalFormErrors({ ...rabbit, breed: "" }, RABBIT).breed ?? "", /select the animal's breed, or choose Other/);
    assert.match(getAnimalFormErrors({ ...rabbit, breed: "Other" }, RABBIT).breed ?? "", /can't be "Other"/);
  });

  it("a species with no list (empty array) types its breed, with the typed-box wording when empty", () => {
    const snake = { ...VALID_FORM, type: "other" as const, speciesName: "Snake" };
    assert.equal(getAnimalFormErrors({ ...snake, breed: "Ball Python" }, []).breed, undefined);
    assert.match(getAnimalFormErrors({ ...snake, breed: "" }, []).breed ?? "", /Breed is required/);
  });

  it("applies the same typed-breed rules to Other species", () => {
    assert.equal(breedError("Holland Lop", "other"), undefined);
    assert.equal(breedError("Unknown", "other"), undefined);
    assert.match(breedError("Other", "other") ?? "", /can't be "Other"/);
  });
});
