import type { AnimalFormInput } from "../../types/animal";
import { validateNarrativeText, validateSpeciesName, validateTypedBreedName } from "./animalFieldRules";
import { findListedBreed } from "./breedChoice";

export type AnimalFormField = keyof AnimalFormInput;
export type AnimalFormErrors = Partial<Record<AnimalFormField, string>>;

// Every problem on the registration/edit form, keyed by field, so each error
// can be shown under its own input (and decides each field's red asterisk).
// The text rules (Description, Behaviour, Rescue history, the typed species
// and a typed breed) come from animalFieldRules.ts and are enforced again by
// the API. `knownBreeds` is the current species' list from the breeds table
// (dog, cat, or a typed species like Rabbit; empty when it has none, e.g.
// Snake): a listed breed is always fine; any other breed - typed via the
// dropdown's "Other" option, a legacy value like "Russian Blue Mix", or a
// breed of a species with no list - must pass the typed-breed rules (so a
// legacy "cat" has to be fixed, "Husky" doesn't).
export function getAnimalFormErrors(input: AnimalFormInput, knownBreeds?: string[]): AnimalFormErrors {
  const errors: AnimalFormErrors = {};

  if (!input.name.trim()) errors.name = "Please enter the animal's name.";

  if (input.type !== "dog" && input.type !== "cat" && input.type !== "other") {
    errors.type = "Please choose Dog, Cat or Other.";
  }

  if (input.type === "other") {
    const speciesProblem = validateSpeciesName(input.speciesName);
    if (speciesProblem) errors.speciesName = speciesProblem;
  }

  // Breed, for every species: a listed breed is always fine; anything else
  // must pass the typed-breed rules. An empty breed gets the dropdown wording
  // when the species has a list, the typed-box wording when it doesn't.
  const hasBreedList = knownBreeds !== undefined && knownBreeds.length > 0;
  if (!input.breed.trim() && hasBreedList) {
    errors.breed = "Please select the animal's breed, or choose Other and type it.";
  } else if (!findListedBreed(input.breed, knownBreeds)) {
    const breedProblem = validateTypedBreedName(input.breed);
    if (breedProblem) errors.breed = breedProblem;
  }

  // Veterinary priority (see VeterinaryPriorityField.tsx).
  if (!["critical", "high", "moderate", "routine"].includes(input.veterinaryPriority)) {
    errors.veterinaryPriority = "Please select the animal's veterinary priority.";
  }

  if (!input.estimatedAge.trim()) errors.estimatedAge = "Please enter the animal's estimated age.";
  if (!input.gender.trim()) errors.gender = "Please select the animal's gender.";
  if (!input.colour.trim()) errors.colour = "Please select the animal's colour.";
  if (!input.size) errors.size = "Please select the animal's size.";

  const description = validateNarrativeText(input.description, "Description");
  if (description) errors.description = description;
  const behaviour = validateNarrativeText(input.behaviour, "Behaviour");
  if (behaviour) errors.behaviour = behaviour;
  const rescueHistory = validateNarrativeText(input.rescueHistory, "Rescue history");
  if (rescueHistory) errors.rescueHistory = rescueHistory;

  if (input.photoUrls.length === 0) {
    errors.photoUrls = "Please upload at least one photo of the animal.";
  } else if (input.photoUrls.length > 3) {
    errors.photoUrls = "Please upload no more than 3 photos of the animal.";
  }

  if (input.vaccinationStatus !== "not_vaccinated" && input.vaccinationStatus !== "vaccinated") {
    errors.vaccinationStatus = "Please select a vaccination status.";
  }

  return errors;
}

// Order errors are reported in when the form is submitted - top to bottom,
// matching the order the fields appear on screen.
const FIELD_ORDER: AnimalFormField[] = [
  "name",
  "type",
  "speciesName",
  "breed",
  "veterinaryPriority",
  "estimatedAge",
  "gender",
  "colour",
  "size",
  "vaccinationStatus",
  "description",
  "behaviour",
  "rescueHistory",
  "photoUrls",
];

// Checks the form before it's submitted to the server. Returns the first
// problem found (or null if the form is valid) so the caller can both
// alert() it and show it inline, per the brief's "block submission and show
// an alert" requirement.
export function validateAnimalForm(input: AnimalFormInput, knownBreeds?: string[]): string | null {
  const errors = getAnimalFormErrors(input, knownBreeds);
  for (const field of FIELD_ORDER) {
    if (errors[field]) return errors[field];
  }
  return null;
}
