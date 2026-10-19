import type { Animal, AnimalPayload } from "../types/animal";

// Same base URL / dev-server-not-running guard pattern used in
// ManagerDashboard.tsx - centralised here so every animals page shares one
// copy instead of re-implementing it.
const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

async function readApiResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("The SPCA API is not running. Start it with `npm run server:dev`.");
  }
  return (await response.json()) as T;
}

function authHeaders(token: string, extra?: Record<string, string>) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

// Breed names for the registration/edit Breed dropdown, from the breeds table
// (GET /api/animals/breeds/:species). Dog and cat only - "other" animals type
// their animal type in instead.
export async function fetchBreeds(species: "dog" | "cat"): Promise<string[]> {
  const response = await fetch(`${apiBaseUrl}/api/animals/breeds/${species}`);
  const result = await readApiResponse<string[] | { error?: string }>(response);
  if (!response.ok || !Array.isArray(result)) {
    throw new Error((result as { error?: string }).error ?? "The breed list could not be loaded.");
  }
  return result;
}

// Breed list for a typed "other" species (GET /api/animals/breeds/other/:name),
// matched case-insensitively. speciesName is the breeds table's spelling
// ("Guinea Pig"), or null with an empty list when the species has none.
export async function fetchOtherSpeciesBreeds(
  speciesName: string,
): Promise<{ speciesName: string | null; breeds: string[] }> {
  const response = await fetch(`${apiBaseUrl}/api/animals/breeds/other/${encodeURIComponent(speciesName)}`);
  const result = await readApiResponse<{ speciesName: string | null; breeds: string[] } | { error?: string }>(
    response,
  );
  if (!response.ok || !("breeds" in result)) {
    throw new Error((result as { error?: string }).error ?? "The breed list could not be loaded.");
  }
  return result;
}

// Fetches every animal profile (staff-only) for the Manage Animal Profiles page.
export async function fetchStaffAnimals(token: string): Promise<Animal[]> {
  const response = await fetch(`${apiBaseUrl}/api/animals/staff`, {
    headers: authHeaders(token),
  });
  const result = await readApiResponse<Animal[] | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "Animal profiles could not be loaded.");
  }
  return result as Animal[];
}

// Fetches a single animal profile (staff-only), used to pre-fill the edit form.
export async function fetchAnimalById(token: string, id: string): Promise<Animal> {
  const response = await fetch(`${apiBaseUrl}/api/animals/${id}`, {
    headers: authHeaders(token),
  });
  const result = await readApiResponse<Animal | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "Animal profile could not be loaded.");
  }
  return result as Animal;
}

// Uploads one photo file to Cloudinary via the backend and returns its
// hosted URL, ready to be added to an animal's photoUrls array.
export async function uploadAnimalPhoto(token: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.append("photo", file);

  const response = await fetch(`${apiBaseUrl}/api/animals/upload-photo`, {
    method: "POST",
    headers: authHeaders(token),
    body: formData,
  });
  const result = await readApiResponse<{ url?: string; error?: string }>(response);
  if (!response.ok || !result.url) {
    throw new Error(result.error ?? "The photo could not be uploaded.");
  }
  return result.url;
}

// Creates a new animal profile. The server generates the unique Animal ID
// and returns it as part of the created record.
export async function createAnimal(token: string, input: AnimalPayload): Promise<Animal> {
  const response = await fetch(`${apiBaseUrl}/api/animals`, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  const result = await readApiResponse<Animal | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "The animal profile could not be created.");
  }
  return result as Animal;
}

// Updates an existing animal profile. `input` is partial so an editor can
// touch just one or two fields (e.g. a vet recording an estimated age
// during an assessment) without re-sending the whole form.
export async function updateAnimal(
  token: string,
  id: string,
  input: Partial<AnimalPayload>,
): Promise<Animal> {
  const response = await fetch(`${apiBaseUrl}/api/animals/${id}`, {
    method: "PATCH",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  const result = await readApiResponse<Animal | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "The animal profile could not be updated.");
  }
  return result as Animal;
}

// Soft-deletes an animal profile (passed away, transferred elsewhere, etc).
// The record stays in the database - see the `deletedAt` comment in
// server/src/db/schema.ts - it's just removed from every listing.
export async function deleteAnimal(token: string, id: string): Promise<Animal> {
  const response = await fetch(`${apiBaseUrl}/api/animals/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  const result = await readApiResponse<Animal | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "The animal profile could not be deleted.");
  }
  return result as Animal;
}

// Natural-language search: returns ranked animal IDs (most relevant first).
// Profiles are already loaded; IDs avoid duplicate data and internal fields.
export async function searchAnimalsWithAI(query: string): Promise<string[]> {
  const response = await fetch(`${apiBaseUrl}/api/animals/ai-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const result = await readApiResponse<{ results?: string[]; error?: string }>(response);
  if (!response.ok) {
    throw new Error(
      result.error ?? "The search could not be completed. Please try again.",
    );
  }
  return result.results ?? [];
}
