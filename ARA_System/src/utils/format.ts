// Capitalizes the first letter of a string, leaving the rest untouched.
// Used for display-only text sourced from lowercase data (e.g. the animal
// `type` enum: "dog", "cat", "rabbit", "other") so the UI can show "Dog"
// without changing the underlying stored/enum value.
export function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// The species to show for an animal: "Dog" / "Cat", or for type "other" the
// species staff typed (e.g. "Rabbit", "Guinea Pig"), falling back to "Other"
// only when none was recorded. Use this instead of capitalize(animal.type)
// anywhere an animal's species is displayed or filtered on.
export function speciesLabel(animal: { type: string; speciesName?: string | null }): string {
  if (animal.type === "other") {
    const typed = animal.speciesName?.trim();
    return typed ? typed : "Other";
  }
  return capitalize(animal.type);
}

// The breed line on listing cards. Dogs and cats show their breed as before;
// "other" animals lead with their typed species so a card never reads just
// "Unknown" - e.g. "Rabbit · Holland Lop", or "Hamster" when the breed is
// unknown.
export function breedLineLabel(animal: { type: string; speciesName?: string | null; breed: string | null }): string {
  const breed = animal.breed?.trim() ?? "";
  if (animal.type !== "other") return breed || "Breed not recorded";
  const species = speciesLabel(animal);
  return breed && breed.toLowerCase() !== "unknown" ? `${species} · ${breed}` : species;
}
