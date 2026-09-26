import type { AnimalFormInput } from "../../types/animal";

// Checks the required fields on the registration/edit form before it's
// submitted to the server. Returns the first problem found (or null if the
// form is valid) so the caller can both alert() it and show it inline,
// per the brief's "block submission and show an alert" requirement.
export function validateAnimalForm(input: AnimalFormInput): string | null {
  if (!input.name.trim()) {
    return "Please enter the animal's name.";
  }
  if (!input.breed.trim()) {
    return "Please enter the animal's breed.";
  }
  if (!input.estimatedAge.trim()) {
    return "Please enter the animal's estimated age.";
  }
  if (!input.gender.trim()) {
    return "Please select the animal's gender.";
  }
  if (!input.colour.trim()) {
    return "Please enter the animal's colour.";
  }
  if (!input.size) {
    return "Please select the animal's size.";
  }
  if (!input.description.trim()) {
    return "Please enter a description for the animal.";
  }
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
