import type { RescueReport, RescueReportFormInput } from "../types/rescue";

// Same base URL / dev-server-not-running guard pattern used in
// animalsApi.ts and ManagerDashboard.tsx - one shared copy for every rescue
// page.
const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

export const rescueApiBaseUrl = apiBaseUrl;

async function readApiResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("The ARA API is not running. Start it with `npm run server:dev`.");
  }
  return (await response.json()) as T;
}

function authHeaders(token?: string, extra?: Record<string, string>) {
  return token
    ? { Authorization: `Bearer ${token}`, ...extra }
    : { ...extra };
}

// Public: creates a rescue report. Works signed-in or anonymously; staff
// pass source: "phone" to log a call through the same form. Map coordinates
// are sent only when the reporter actually dropped a pin.
export async function submitRescueReport(
  input: RescueReportFormInput,
  token?: string,
): Promise<RescueReport> {
  const { latitude, longitude, ...rest } = input;
  const hasPin = latitude != null && longitude != null;
  const payload: Record<string, unknown> = hasPin
    ? { ...rest, latitude, longitude }
    : { ...rest };

  const response = await fetch(`${apiBaseUrl}/api/rescue`, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  const result = await readApiResponse<RescueReport | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "The rescue report could not be submitted.");
  }
  return result as RescueReport;
}

// Uploads one report photo to Cloudinary via the backend and returns its
// hosted URL. Public endpoint, so no token required.
export async function uploadRescuePhoto(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("photo", file);

  const response = await fetch(`${apiBaseUrl}/api/rescue/upload-photo`, {
    method: "POST",
    body: formData,
  });
  const result = await readApiResponse<{ url?: string; error?: string }>(response);
  if (!response.ok || !result.url) {
    throw new Error(result.error ?? "The photo could not be uploaded.");
  }
  return result.url;
}

// Signed-in reporter: their own reports for the tracking page.
export async function fetchMyRescueReports(token: string): Promise<RescueReport[]> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/mine`, {
    headers: authHeaders(token),
  });
  const result = await readApiResponse<RescueReport[] | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "Your rescue reports could not be loaded.");
  }
  return result as RescueReport[];
}

// Staff-only: every report, newest first, for the dispatch dashboard.
export async function fetchAllRescueReports(token: string): Promise<RescueReport[]> {
  const response = await fetch(`${apiBaseUrl}/api/rescue`, {
    headers: authHeaders(token),
  });
  const result = await readApiResponse<RescueReport[] | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "Rescue reports could not be loaded.");
  }
  return result as RescueReport[];
}

// Staff-only: dispatch update (rescue report dispatch), audited server-side.
export async function updateRescueReport(
  token: string,
  id: string,
  input: {
    status?: string;
    assignedTo?: string;
    officeNote?: string;
    animalId?: string;
  },
): Promise<RescueReport> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/${id}`, {
    method: "PATCH",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  const result = await readApiResponse<RescueReport | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "The rescue report could not be updated.");
  }
  return result as RescueReport;
}