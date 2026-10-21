import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Animal } from "../../types/animal";
import {
  ALL_FILTERS,
  filterAnimals,
  manageView,
  searchAnimals,
  sortAnimals,
  statusOptions,
} from "./manageAnimalsView.js";

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
    medicallyCleared: true,
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
const ANIMALS_WITH_HAMSTER = [
  ...ANIMALS,
  animal({ name: "Nugget", type: "other", speciesName: "Hamster" }),
  animal({ name: "Misty", type: "other", speciesName: "Rabbit" }),
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
  it("groups non-dog/cat species under Other and combines status and vaccination filters", () => {
    assert.deepEqual(names(filterAnimals(ANIMALS, { ...ALL_FILTERS, species: "other" })), ["Clover"]);
    assert.deepEqual(names(filterAnimals(ANIMALS_WITH_HAMSTER, { ...ALL_FILTERS, species: "other" })), ["Clover", "Nugget", "Misty"]);
    assert.deepEqual(names(filterAnimals(ANIMALS, { ...ALL_FILTERS, status: "Adopted" })), ["Duke"]);
    assert.deepEqual(names(filterAnimals(ANIMALS, { ...ALL_FILTERS, vaccination: "not_vaccinated" })), ["Abby"]);
    assert.deepEqual(names(filterAnimals(ANIMALS, { species: "dog", status: "Adopted", vaccination: "all" })), ["Duke"]);
    assert.deepEqual(filterAnimals(ANIMALS, { species: "cat", status: "Adopted", vaccination: "all" }), []);
  });

  it("includes legacy rabbits under Other while keeping dogs and cats separate", () => {
    const legacy = animal({ name: "Legacy rabbit", type: "rabbit" });
    assert.deepEqual(names(filterAnimals([legacy, ...ANIMALS], { ...ALL_FILTERS, species: "other" })), ["Legacy rabbit", "Clover"]);
    assert.deepEqual(names(filterAnimals(ANIMALS, { ...ALL_FILTERS, species: "cat" })), ["Abby"]);
  });

  it("always offers the publication workflow stages, including empty queues", () => {
    assert.deepEqual(statusOptions([]), ["Awaiting clearance", "Ready to publish", "Published", "Adopted"]);
    assert(statusOptions(ANIMALS).includes("Ready to publish"));
    assert(statusOptions([animal({ status: "closed" })]).includes("Closed"));
  });

  it("separates cleared drafts, published profiles, and animals awaiting clearance", () => {
    const profiles = [animal({ name: "Draft", publishedAt: null }), animal({ name: "Public", publishedAt: "2026-10-19T00:00:00Z" }), animal({ name: "Unclear", medicallyCleared: false }), animal({ name: "Adopted", status: "adopted" })];
    assert.deepEqual(names(filterAnimals(profiles, { ...ALL_FILTERS, status: "Ready to publish" })), ["Draft"]);
    assert.deepEqual(names(filterAnimals(profiles, { ...ALL_FILTERS, status: "Published" })), ["Public"]);
    assert.deepEqual(names(filterAnimals(profiles, { ...ALL_FILTERS, status: "Awaiting clearance" })), ["Unclear"]);
  });

  it("applies search, then filters, then sort", () => {
    assert.deepEqual(names(searchAnimals(ANIMALS, "rabbit")), ["Clover"]);
    assert.deepEqual(names(manageView(ANIMALS, "", { ...ALL_FILTERS, species: "dog" }, "name-asc")), ["bella", "Duke"]);
    assert.deepEqual(names(manageView(ANIMALS, "du", { ...ALL_FILTERS, species: "dog" }, "newest")), ["Duke"]);
  });
});
