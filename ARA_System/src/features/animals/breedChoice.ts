// Pure helpers for the dog/cat Breed dropdown and its "Other" (typed breed)
// option. No React here, so they're unit-tested in breedChoice.test.ts.

// The dropdown value of the "Other" option. Form-only: choosing it turns the
// dropdown into a text box, and the word "Other" is never stored as a breed
// (validateTypedBreedName rejects it, on the form and on the server).
export const BREED_OTHER_OPTION = "__other_breed__";

// Listed in the breeds table for every species, but shown after the real
// breeds, just before "Other".
const GENERAL_BREEDS = ["Mixed breed", "Unknown"];

// Dropdown order: real breeds A-Z, then "Mixed breed" and "Unknown" (when the
// table has them). The page appends "Other" as the last option itself.
export function orderBreedOptions(options: string[]): string[] {
  const isGeneral = (breed: string) => GENERAL_BREEDS.some((general) => general.toLowerCase() === breed.toLowerCase());
  const specific = options.filter((breed) => !isGeneral(breed)).sort((a, b) => a.localeCompare(b));
  const general = GENERAL_BREEDS.flatMap((general) =>
    options.filter((breed) => breed.toLowerCase() === general.toLowerCase()),
  );
  return [...specific, ...general];
}

// The listed breed that typed text refers to (trimmed, case-insensitive,
// spaces collapsed), in the list's own spelling - or undefined. Used to switch
// the typed box back to the dropdown when staff type a breed that's listed.
export function findListedBreed(text: string, options: string[] | undefined): string | undefined {
  const typed = text.trim().replace(/\s+/g, " ").toLowerCase();
  if (!typed || !options) return undefined;
  return options.find((breed) => breed.toLowerCase() === typed);
}
