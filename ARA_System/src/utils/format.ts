// Capitalizes the first letter of a string, leaving the rest untouched.
// Used for display-only text sourced from lowercase data (e.g. the animal
// `type` enum: "dog", "cat", "rabbit", "other") so the UI can show "Dog"
// without changing the underlying stored/enum value.
export function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
