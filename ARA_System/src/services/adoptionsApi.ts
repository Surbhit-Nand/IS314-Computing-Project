import type {
  AdoptionApplication,
  AdoptionApplicationInput,
  AdoptionStatus,
} from "../types/adoption";
import { apiBaseUrl, authHeaders, readApiResponse } from "./apiClient.js";

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

// Signed-in applicant: uploads the identification photo before submitting.
// Returns the hosted URL, which the wizard sends back with the application.
export async function uploadAdoptionIdDocument(file: File, token: string): Promise<string> {
  const body = new FormData();
  body.append("document", file);
  const response = await fetch(`${apiBaseUrl}/api/adoptions/id-document`, {
    method: "POST",
    headers: authHeaders(token),
    body,
  });
  const result = await readApiResponse<{ url?: string; error?: string }>(response);
  if (!response.ok || !result.url) {
    throw new Error(result.error ?? "The identification photo could not be uploaded.");
  }
  return result.url;
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

// Signed-in applicant: withdraw their own application before a decision is
// made. Allowed only while the application is submitted or under review; the
// server returns the updated row, or 400/403/404 with { error }.
export async function withdrawAdoptionApplication(
  token: string,
  id: string,
): Promise<AdoptionApplication> {
  const response = await fetch(`${apiBaseUrl}/api/adoptions/${id}/withdraw`, {
    method: "POST",
    headers: authHeaders(token),
  });
  const result = await readApiResponse<AdoptionApplication | { error?: string }>(response);
  if (!response.ok) {
    throw new Error(
      (result as { error?: string }).error ?? "The adoption application could not be withdrawn.",
    );
  }
  return result as AdoptionApplication;
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