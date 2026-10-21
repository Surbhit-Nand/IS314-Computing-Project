import type { Animal } from "../types/animal";
import { capitalize } from "./format";
import { extractTraits, traitLabel } from "../../server/src/shared/animalTraits.js";

export { ANIMAL_TRAITS, extractTraits, traitLabel } from "../../server/src/shared/animalTraits.js";
export type { TraitEntry, TraitGroup } from "../../server/src/shared/animalTraits.js";

// A summary chip shown on animal cards. `filterKey`/`filterValue` match the
// `Filters` shape in AnimalListings.tsx, so a clicked tag can apply the
// sidebar filter it names. Display-only surfaces (Home, profile page) ignore
// the filter fields and render the label.
export type AnimalTagFilterKey = "type" | "size" | "vaccination" | "behaviour";

export type AnimalTag = {
  label: string;
  filterKey: AnimalTagFilterKey;
  filterValue: string;
  title: string;
};

const SIZE_LABELS: Record<string, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  extra_large: "Extra large",
};

// Builds at most `max` summary chips from public profile fields only — the
// same fields a visitor already sees on the card. Order is fixed (species,
// traits, size, vaccination) so cards scan consistently. Gender is
// deliberately NOT a chip: the card's gender • age line already shows it,
// and a chip would repeat it. Every trait chip is clickable to its Behaviour
// filter value.
export function buildAnimalTags(animal: Animal, max = 7): AnimalTag[] {
  const tags: AnimalTag[] = [];

  // The listing groups every non-dog/cat species under "Other", so a rabbit's
  // tag filters to "other" rather than a species option that does not exist.
  const speciesValue = animal.type === "dog" || animal.type === "cat" ? animal.type : "other";
  tags.push({
    label: speciesValue === "other" ? "Other pet" : capitalize(animal.type),
    filterKey: "type",
    filterValue: speciesValue,
    title: "Show only animals of this species",
  });

  const traits = extractTraits(animal.behaviour, animal.description);
  for (const key of traits) {
    tags.push({
      label: traitLabel(key),
      filterKey: "behaviour",
      filterValue: key,
      title: `Show only ${traitLabel(key).toLowerCase()} animals`,
    });
  }

  if (animal.size) {
    tags.push({
      label: SIZE_LABELS[animal.size] ?? capitalize(animal.size),
      filterKey: "size",
      filterValue: animal.size,
      title: "Show only animals of this size",
    });
  }

  // Only a positive vaccination state gets a chip — "not vaccinated" is a
  // filter, not a selling point.
  if (animal.vaccinationStatus === "vaccinated") {
    tags.push({
      label: "Vaccinated",
      filterKey: "vaccination",
      filterValue: "vaccinated",
      title: "Show only vaccinated animals",
    });
  }

  return tags.slice(0, max);
}
