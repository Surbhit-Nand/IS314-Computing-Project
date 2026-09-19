import type {
  AdoptionApplication,
  AdoptionApplicationInput,
  AdoptionStatus,
} from "../types/adoption";

// Same base URL / dev-server-not-running guard pattern used in rescueApi.ts
// and animalsApi.ts - one shared copy for every adoption page.
const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

async function readApiResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("The SPCA API is not running. Start it with `npm run server:dev`.");
  }
  return (await response.json()) as T;
}

function authHeaders(token?: string, extra?: Record<string, string>) {
  return token
    ? { Authorization: `Bearer ${token}`, ...extra }
    : { ...extra };
}

// Signed-in user: applies to adopt an animal.
export async function submitAdoptionApplication(
  input: AdoptionApplicationInput,
  token: string,
): Promise<AdoptionApplication> {
  const response = await fetch(`${apiBaseUrl}/api/adoptions`, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  const result = await readApiResponse<AdoptionApplication | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "The application could not be submitted.");
  }
  return result as AdoptionApplication;
}

// Signed-in applicant: their own applications for the tracking page.
export async function fetchMyAdoptionApplications(token: string): Promise<AdoptionApplication[]> {
  const response = await fetch(`${apiBaseUrl}/api/adoptions/mine`, {
    headers: authHeaders(token),
  });
  const result = await readApiResponse<AdoptionApplication[] | { error?: string }>(response);
  if (!response.ok) {
    throw new Error(
      (result as { error?: string }).error ?? "Your adoption applications could not be loaded.",
    );
  }
  return result as AdoptionApplication[];
}

// Staff-only: every application, newest first, for the review queue.
export async function fetchAllAdoptionApplications(token: string): Promise<AdoptionApplication[]> {
  const response = await fetch(`${apiBaseUrl}/api/adoptions`, {
    headers: authHeaders(token),
  });
  const result = await readApiResponse<AdoptionApplication[] | { error?: string }>(response);
  if (!response.ok) {
    throw new Error(
      (result as { error?: string }).error ?? "Adoption applications could not be loaded.",
    );
  }
  return result as AdoptionApplication[];
}

// Staff-only: one application plus its status history, for the detail view.
export async function fetchAdoptionApplicationDetail(
  token: string,
  id: string,
): Promise<AdoptionApplication> {
  const response = await fetch(`${apiBaseUrl}/api/adoptions/${id}`, {
    headers: authHeaders(token),
  });
  const result = await readApiResponse<AdoptionApplication | { error?: string }>(response);
  if (!response.ok) {
    throw new Error(
      (result as { error?: string }).error ?? "The adoption application could not be loaded.",
    );
  }
  return result as AdoptionApplication;
}

// Staff-only: move an application through its lifecycle (audited server-side).
export async function updateAdoptionApplication(
  token: string,
  id: string,
  input: { status: AdoptionStatus; reviewNotes?: string },
): Promise<AdoptionApplication> {
  const response = await fetch(`${apiBaseUrl}/api/adoptions/${id}`, {
    method: "PATCH",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  const result = await readApiResponse<AdoptionApplication | { error?: string }>(response);
  if (!response.ok) {
    throw new Error(
      (result as { error?: string }).error ?? "The adoption application could not be updated.",
    );
  }
  return result as AdoptionApplication;
}