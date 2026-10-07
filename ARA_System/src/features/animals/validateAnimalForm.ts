import type { AnimalFormInput } from "../../types/animal";

// Free-text fields must be at least this long (after trimming) - short
// enough for a real one-line note, long enough to rule out "n/a"-style
// placeholder junk.
const MIN_TEXT_LENGTH = 10;

// Catches the kind of garbage the lecturer demo flagged (e.g. "B, B, B, B"),
// where a field looks non-empty but is really the same letter repeated with
// punctuation/spacing around it. Strips everything but letters and checks
// there's more than one distinct one.
function isNonsenseText(value: string): boolean {
  const letters = value.replace(/[^a-zA-Z]/g, "");
  if (letters.length === 0) return true;
  return new Set(letters.toLowerCase()).size <= 1;
}

// Runs the length + nonsense checks shared by every long free-text field,
// returning a field-specific error message or null if it passes.
function validateFreeText(value: string, fieldLabel: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return `Please enter ${fieldLabel}.`;
  }
  if (trimmed.length < MIN_TEXT_LENGTH) {
    return `Please enter at least ${MIN_TEXT_LENGTH} characters for ${fieldLabel}.`;
  }
  if (isNonsenseText(trimmed)) {
    return `${fieldLabel[0].toUpperCase()}${fieldLabel.slice(1)} doesn't look like a real entry - please check it.`;
  }
  return null;
}

// Checks the required fields on the registration/edit form before it's
// submitted to the server. Returns the first problem found (or null if the
// form is valid) so the caller can both alert() it and show it inline,
// per the brief's "block submission and show an alert" requirement.
export function validateAnimalForm(input: AnimalFormInput): string | null {
  if (!input.name.trim()) {
    return "Please enter the animal's name.";
  }
  if (!input.breed.trim()) {
    return "Please select the animal's breed.";
  }
  if (!input.estimatedAge.trim()) {
    return "Please enter the animal's estimated age.";
  }
  if (!input.gender.trim()) {
    return "Please select the animal's gender.";
  }
  if (!input.colour.trim()) {
    return "Please select the animal's colour.";
  }
  if (!input.size) {
    return "Please select the animal's size.";
  }

  const descriptionError = validateFreeText(input.description, "a description for the animal");
  if (descriptionError) return descriptionError;

  const behaviourError = validateFreeText(input.behaviour, "the animal's behaviour/temperament");
  if (behaviourError) return behaviourError;

  const rescueHistoryError = validateFreeText(input.rescueHistory, "the animal's rescue history");
  if (rescueHistoryError) return rescueHistoryError;

  if (input.photoUrls.length === 0) {
    return "Please upload at least one photo of the animal.";
  }
  if (input.photoUrls.length > 3) {
    return "Please upload no more than 3 photos of the animal.";
  }
  if (!input.veterinaryPriority) {
    return "Please select the animal's veterinary priority.";
  }
  // Vaccination status is checked by value below, which also rejects the
  // empty string - a separate truthiness check here would be redundant.
  if (input.vaccinationStatus !== "not_vaccinated" && input.vaccinationStatus !== "vaccinated") {
    return "Please select a vaccination status.";
  }

  return null;
}
