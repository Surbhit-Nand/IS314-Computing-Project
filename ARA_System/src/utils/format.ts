// Capitalizes the first letter of a string, leaving the rest untouched.
// Used for display-only text sourced from lowercase data (e.g. the animal
// `type` enum: "dog", "cat", "rabbit", "other") so the UI can show "Dog"
// without changing the underlying stored/enum value.
export function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Shared date formatting for tracking pages, timelines, and the staff
// queues. One definition so every "12 Mar 2026" renders identically.
export function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
