// Search, filter and sort for the Manage animal profiles page. Pure functions
// over the list already loaded from GET /api/animals/staff (not paginated),
// so they run in the browser and are unit-tested in manageAnimalsView.test.ts.
// Order: search, then filter, then sort.
import { adoptionStatusLabel, type Animal, type VeterinaryPriority } from "../../types/animal";
import { speciesLabel } from "../../utils/format";

export type ManageSort = "newest" | "oldest" | "name-asc" | "name-desc" | "priority";

export const SORT_OPTIONS: { value: ManageSort; label: string }[] = [
  { value: "newest", label: "Newest added" },
  { value: "oldest", label: "Oldest added" },
  { value: "name-asc", label: "Name A-Z" },
  { value: "name-desc", label: "Name Z-A" },
  { value: "priority", label: "Vet priority (most urgent first)" },
];

export type ManageFilters = {
  species: "all" | "dog" | "cat" | "other";
  // An adoptionStatusLabel ("Available for Adoption", "Adopted") or "all".
  status: string;
  vaccination: "all" | "vaccinated" | "not_vaccinated";
};

export const ALL_FILTERS: ManageFilters = { species: "all", status: "all", vaccination: "all" };

// Most urgent first; animals with no priority last.
const PRIORITY_RANK: Record<VeterinaryPriority, number> = { critical: 0, high: 1, moderate: 2, routine: 3 };

function priorityRank(animal: Animal): number {
  return animal.veterinaryPriority ? PRIORITY_RANK[animal.veterinaryPriority] : 4;
}

function byName(first: Animal, second: Animal): number {
  return first.name.localeCompare(second.name, undefined, { sensitivity: "base" });
}

// Free-text search across the fields staff are most likely to search by.
export function searchAnimals(animals: Animal[], searchTerm: string): Animal[] {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return animals;
  return animals.filter((animal) =>
    [animal.publicId, animal.name, animal.breed ?? "", animal.type, speciesLabel(animal)]
      .join(" ")
      .toLowerCase()
      .includes(term),
  );
}

export function filterAnimals(animals: Animal[], filters: ManageFilters): Animal[] {
  return animals.filter((animal) => {
    if (filters.species !== "all") {
      // "Other" covers every typed species (and any legacy "rabbit" row).
      const species = animal.type === "dog" || animal.type === "cat" ? animal.type : "other";
      if (species !== filters.species) return false;
    }
    if (filters.status !== "all" && adoptionStatusLabel(animal.status) !== filters.status) return false;
    if (filters.vaccination !== "all" && animal.vaccinationStatus !== filters.vaccination) return false;
    return true;
  });
}

// Returns a new array; ties are broken by name (case-insensitive).
export function sortAnimals(animals: Animal[], sort: ManageSort): Animal[] {
  const created = (animal: Animal) => new Date(animal.createdAt).getTime();
  const comparators: Record<ManageSort, (first: Animal, second: Animal) => number> = {
    newest: (first, second) => created(second) - created(first) || byName(first, second),
    oldest: (first, second) => created(first) - created(second) || byName(first, second),
    "name-asc": (first, second) => byName(first, second),
    "name-desc": (first, second) => byName(second, first),
    priority: (first, second) => priorityRank(first) - priorityRank(second) || byName(first, second),
  };
  return [...animals].sort(comparators[sort]);
}

// The Status filter's options: only statuses that actually exist in the list.
export function statusOptions(animals: Animal[]): string[] {
  return [...new Set(animals.map((animal) => adoptionStatusLabel(animal.status)))].sort();
}

export function manageView(animals: Animal[], searchTerm: string, filters: ManageFilters, sort: ManageSort): Animal[] {
  return sortAnimals(filterAnimals(searchAnimals(animals, searchTerm), filters), sort);
}
