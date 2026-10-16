import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Animal } from "../../types/animal";
import { ALL_FILTERS, filterAnimals, manageView, searchAnimals, sortAnimals, statusOptions } from "./manageAnimalsView.js";

// Run: npm test. The Manage animal profiles page's search -> filter -> sort.
function animal(overrides: Partial<Animal>): Animal {
  return {
    id: overrides.name ?? "id",
    publicId: "SPCA-2026-0001",
    name: "Animal",
    type: "dog",
    speciesName: null,
    breed: "Beagle",
    estimatedAge: "2 Years",
    gender: "Male",
    colour: "Brown",
    description: null,
    rescueDate: null,
    behaviour: null,
    rescueHistory: null,
    photoUrls: [],
    vaccinationStatus: "vaccinated",
    size: "medium",
    veterinaryPriority: null,
    medicallyCleared: false,
    status: "intake",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

const ANIMALS = [
  animal({ name: "bella", createdAt: "2026-09-03T00:00:00Z", veterinaryPriority: "routine" }),
  animal({ name: "Abby", type: "cat", createdAt: "2026-09-01T00:00:00Z", vaccinationStatus: "not_vaccinated" }),
  animal({ name: "Clover", type: "other", speciesName: "Rabbit", createdAt: "2026-09-02T00:00:00Z", veterinaryPriority: "critical" }),
  animal({ name: "Duke", status: "adopted", createdAt: "2026-09-02T00:00:00Z", veterinaryPriority: "critical" }),
];
const names = (list: Animal[]) => list.map((entry) => entry.name);

describe("sortAnimals", () => {
  it("newest / oldest added, ties broken by name", () => {
    assert.deepEqual(names(sortAnimals(ANIMALS, "newest")), ["bella", "Clover", "Duke", "Abby"]);
    assert.deepEqual(names(sortAnimals(ANIMALS, "oldest")), ["Abby", "Clover", "Duke", "bella"]);
  });

  it("name A-Z / Z-A ignoring upper/lower case", () => {
    assert.deepEqual(names(sortAnimals(ANIMALS, "name-asc")), ["Abby", "bella", "Clover", "Duke"]);
    assert.deepEqual(names(sortAnimals(ANIMALS, "name-desc")), ["Duke", "Clover", "bella", "Abby"]);
  });

  it("vet priority: most urgent first, none last, ties by name", () => {
    assert.deepEqual(names(sortAnimals(ANIMALS, "priority")), ["Clover", "Duke", "bella", "Abby"]);
  });

  it("doesn't change the original list", () => {
    sortAnimals(ANIMALS, "name-desc");
    assert.deepEqual(names(ANIMALS), ["bella", "Abby", "Clover", "Duke"]);
  });
});

describe("filterAnimals / statusOptions / search", () => {
  it("filters by species (Other = typed species), status and vaccination", () => {
    assert.deepEqual(names(filterAnimals(ANIMALS, { ...ALL_FILTERS, species: "other" })), ["Clover"]);
    assert.deepEqual(names(filterAnimals(ANIMALS, { ...ALL_FILTERS, status: "Adopted" })), ["Duke"]);
    assert.deepEqual(names(filterAnimals(ANIMALS, { ...ALL_FILTERS, vaccination: "not_vaccinated" })), ["Abby"]);
    assert.deepEqual(names(filterAnimals(ANIMALS, { species: "dog", status: "Adopted", vaccination: "all" })), ["Duke"]);
    assert.deepEqual(filterAnimals(ANIMALS, { species: "cat", status: "Adopted", vaccination: "all" }), []);
  });

  it("offers only statuses that exist", () => {
    assert.deepEqual(statusOptions(ANIMALS), ["Adopted", "Available for Adoption"]);
    assert.deepEqual(statusOptions([ANIMALS[0]]), ["Available for Adoption"]);
  });

  it("applies search, then filters, then sort", () => {
    assert.deepEqual(names(searchAnimals(ANIMALS, "rabbit")), ["Clover"]);
    assert.deepEqual(names(manageView(ANIMALS, "", { ...ALL_FILTERS, species: "dog" }, "name-asc")), ["bella", "Duke"]);
    assert.deepEqual(names(manageView(ANIMALS, "du", { ...ALL_FILTERS, species: "dog" }, "newest")), ["Duke"]);
  });
});
