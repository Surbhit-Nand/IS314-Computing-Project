import type {
  IntakeHandoffWithReport,
  RescueMission,
  RescueMissionUpdate,
  RescueOutcome,
  RescueReport,
  RescueReportFormInput,
  RescueTakeoverRequest,
  RescueUpdateType,
} from "../types/rescue";

// Same base URL / dev-server-not-running guard pattern used in
// animalsApi.ts and ManagerDashboard.tsx - one shared copy for every rescue
// page.
const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

export const rescueApiBaseUrl = apiBaseUrl;

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
    throw new Error((result as { error?: string }).error ?? "The rescue alert could not be submitted.");
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

// Dispatcher-only: uploads a progress/evidence image for a case update.
// Signed requests land in the "ara/rescue-progress" Cloudinary folder.
export async function uploadRescueProgressPhoto(file: File, token: string): Promise<string> {
  const formData = new FormData();
  formData.append("photo", file);

  const response = await fetch(`${apiBaseUrl}/api/rescue/upload-progress-photo`, {
    method: "POST",
    headers: authHeaders(token),
    body: formData,
  });
  const result = await readApiResponse<{ url?: string; error?: string }>(response);
  if (!response.ok || !result.url) {
    throw new Error(result.error ?? "The progress photo could not be uploaded.");
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
    throw new Error((result as { error?: string }).error ?? "Your rescue alerts could not be loaded.");
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
    throw new Error((result as { error?: string }).error ?? "Rescue alerts could not be loaded.");
  }
  return result as RescueReport[];
}

// Dispatcher-only tabs. The backend enforces each tab's rule (available = not
// assigned + submitted; mine = assigned to me + not resolved; resolved = mine
// + resolved), so the UI can never show an In Progress case under Available.
export async function fetchDispatcherAvailableReports(token: string): Promise<RescueReport[]> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/dispatcher/available`, {
    headers: authHeaders(token),
  });
  const result = await readApiResponse<RescueReport[] | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "Available cases could not be loaded.");
  }
  return result as RescueReport[];
}

export async function fetchDispatcherMyReports(token: string): Promise<RescueReport[]> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/dispatcher/mine`, {
    headers: authHeaders(token),
  });
  const result = await readApiResponse<RescueReport[] | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "Your assigned cases could not be loaded.");
  }
  return result as RescueReport[];
}

export async function fetchDispatcherResolvedReports(token: string): Promise<RescueReport[]> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/dispatcher/resolved`, {
    headers: authHeaders(token),
  });
  const result = await readApiResponse<RescueReport[] | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "Resolved cases could not be loaded.");
  }
  return result as RescueReport[];
}

// Dispatcher: assigns the case to the authenticated dispatcher, sets status
// to Assigned, and records the claim on the timeline.
export async function claimRescueReport(token: string, id: string): Promise<RescueReport> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/${id}/claim`, {
    method: "POST",
    headers: authHeaders(token),
  });
  const result = await readApiResponse<RescueReport | { error?: string }>(response);
  if (!response.ok) throw new Error((result as { error?: string }).error ?? "This rescue case could not be claimed.");
  return result as RescueReport;
}

// Dispatcher Start Rescue: writes the action plan/notes + evidence and moves
// the case to In Progress in one guarded operation.
export async function startRescue(
  token: string,
  id: string,
  input: { notes: string; imageUrls: string[] },
): Promise<RescueReport> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/${id}/start`, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  const result = await readApiResponse<RescueReport | { error?: string }>(response);
  if (!response.ok) throw new Error((result as { error?: string }).error ?? "The rescue could not be started.");
  return result as RescueReport;
}

// Dispatcher Complete Rescue: submits the final report + outcome (and any
// evidence) and only then moves the case to Resolved.
export async function resolveRescue(
  token: string,
  id: string,
  input: {
    notes: string;
    outcome: RescueOutcome;
    additionalRemarks: string;
    imageUrls: string[];
  },
): Promise<RescueReport> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/${id}/resolve`, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  const result = await readApiResponse<RescueReport | { error?: string }>(response);
  if (!response.ok) throw new Error((result as { error?: string }).error ?? "The rescue could not be resolved.");
  return result as RescueReport;
}

// ---- Rescue Mission workflow (Mission Board / Active Mission / History) ----

// Staff + dispatchers: active alerts, already ranked Critical -> High ->
// Moderate -> Low by the server.
export async function fetchMissionBoard(token: string): Promise<RescueMission[]> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/missions`, {
    headers: authHeaders(token),
  });
  const result = await readApiResponse<RescueMission[] | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "Mission Board could not be loaded.");
  }
  return result as RescueMission[];
}

// Staff + dispatchers: resolved missions, newest first.
export async function fetchMissionHistory(token: string): Promise<RescueMission[]> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/missions/history`, {
    headers: authHeaders(token),
  });
  const result = await readApiResponse<RescueMission[] | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "Mission history could not be loaded.");
  }
  return result as RescueMission[];
}

// Dispatcher-only: their own active missions for the Active Mission workspace.
// The server already splits them into the two strictly-disjoint groups the
// workspace tabs between: Assigned (accepted, not started) and In Progress
// (started, not resolved). A mission can never appear in both.
export type MyActiveMissions = {
  assigned: RescueMission[];
  inProgress: RescueMission[];
};

export async function fetchMyActiveMissions(token: string): Promise<MyActiveMissions> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/missions/mine`, {
    headers: authHeaders(token),
  });
  const result = await readApiResponse<MyActiveMissions | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "Your active missions could not be loaded.");
  }
  return result as MyActiveMissions;
}

// Staff + dispatchers: one mission in full (report, timeline, updates,
// debrief, and generated summary).
export async function fetchMission(token: string, id: string): Promise<RescueMission> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/missions/${id}`, {
    headers: authHeaders(token),
  });
  const result = await readApiResponse<RescueMission | { error?: string }>(response);
  if (!response.ok) throw new Error((result as { error?: string }).error ?? "Mission could not be loaded.");
  return result as RescueMission;
}

// Dispatcher-only: Accept Mission. Backend-guarded, so a double click (or two
// dispatchers racing) can never double-assign.
export async function acceptMission(token: string, id: string): Promise<RescueMission> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/missions/${id}/accept`, {
    method: "POST",
    headers: authHeaders(token),
  });
  const result = await readApiResponse<RescueMission | { error?: string }>(response);
  if (!response.ok) throw new Error((result as { error?: string }).error ?? "The mission could not be accepted.");
  return result as RescueMission;
}

// Dispatcher-only: Start Mission. Notes are optional - an en-route dispatcher
// is never blocked at a form.
export async function startMission(
  token: string,
  id: string,
  input: { notes?: string; imageUrls?: string[] } = {},
): Promise<RescueMission> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/missions/${id}/start`, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  const result = await readApiResponse<RescueMission | { error?: string }>(response);
  if (!response.ok) throw new Error((result as { error?: string }).error ?? "The mission could not be started.");
  return result as RescueMission;
}

// Dispatcher-only: Assigned missions held by another dispatcher, for the
// "Assigned to Others" list.
export async function fetchAssignedToOthers(token: string): Promise<RescueMission[]> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/missions/assigned-to-others`, {
    headers: authHeaders(token),
  });
  const result = await readApiResponse<RescueMission[] | { error?: string }>(response);
  if (!response.ok) {
    throw new Error(
      (result as { error?: string }).error ?? "Assigned-to-others missions could not be loaded.",
    );
  }
  return result as RescueMission[];
}

// Dispatcher-only: Request to Take Over an Assigned mission held by another
// dispatcher.
export async function requestMissionTakeover(
  token: string,
  id: string,
  reason: string,
): Promise<RescueMission> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/missions/${id}/takeover`, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ reason }),
  });
  const result = await readApiResponse<RescueMission | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "Takeover request could not be sent.");
  }
  return result as RescueMission;
}

// Dispatcher-only: withdraw your own pending takeover request.
export async function withdrawMissionTakeover(
  token: string,
  requestId: string,
): Promise<RescueTakeoverRequest> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/missions/takeover/${requestId}/withdraw`, {
    method: "POST",
    headers: authHeaders(token),
  });
  const result = await readApiResponse<RescueTakeoverRequest | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "Takeover request could not be withdrawn.");
  }
  return result as RescueTakeoverRequest;
}

// Dispatcher-only: read one takeover request by id (the notification
// deep-link). Only the mission owner the request was addressed to, or the
// requester, may read it.
export async function fetchTakeoverRequest(
  token: string,
  requestId: string,
): Promise<RescueTakeoverRequest> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/missions/takeover/${requestId}`, {
    headers: authHeaders(token),
  });
  const result = await readApiResponse<RescueTakeoverRequest | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "The takeover request could not be loaded.");
  }
  return result as RescueTakeoverRequest;
}

// Dispatcher-only: approve or decline a pending takeover request (owner only).
export async function decideMissionTakeover(
  token: string,
  requestId: string,
  decision: "approved" | "declined",
  decisionNote?: string,
): Promise<RescueMission> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/missions/takeover/${requestId}/decide`, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ decision, decisionNote }),
  });
  const result = await readApiResponse<RescueMission | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "Takeover decision could not be saved.");
  }
  return result as RescueMission;
}

// Dispatcher-only: Release Mission / Request Handover. Only the assigned
// dispatcher can give the alert up; the reason is kept on the timeline for
// the next dispatcher. The alert returns to the Mission Board.
export async function releaseMission(
  token: string,
  id: string,
  reason: string,
): Promise<RescueMission> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/missions/${id}/release`, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ reason }),
  });
  const result = await readApiResponse<RescueMission | { error?: string }>(response);
  if (!response.ok) throw new Error((result as { error?: string }).error ?? "The mission could not be released.");
  return result as RescueMission;
}

// Dispatcher-only: optional quick update mid-rescue (note / photo). Never
// changes the mission status.
export async function postRescueUpdate(
  token: string,
  id: string,
  input: { updateType: RescueUpdateType; message?: string; imageUrls?: string[] },
): Promise<{ update: RescueMissionUpdate; mission: RescueMission }> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/missions/${id}/updates`, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  const result = await readApiResponse<
    { update?: RescueMissionUpdate; mission?: RescueMission; error?: string }
  >(response);
  if (!response.ok || !result.update || !result.mission) {
    throw new Error(result.error ?? "The mission update could not be saved.");
  }
  return result as { update: RescueMissionUpdate; mission: RescueMission };
}

// Dispatcher-only: the single Post-Rescue Debrief that completes a mission.
export async function completeMissionDebrief(
  token: string,
  id: string,
  input: {
    outcome: RescueOutcome;
    whatHappened: string;
    animalCondition?: string;
    unsuccessfulDetails?: string;
  },
): Promise<RescueMission> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/missions/${id}/debrief`, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  const result = await readApiResponse<RescueMission | { error?: string }>(response);
  if (!response.ok) throw new Error((result as { error?: string }).error ?? "The debrief could not be saved.");
  return result as RescueMission;
}

// Staff and above: the open Animal Intake queue.
export async function fetchIntakeHandoffs(token: string): Promise<IntakeHandoffWithReport[]> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/handoffs`, {
    headers: authHeaders(token),
  });
  const result = await readApiResponse<IntakeHandoffWithReport[] | { error?: string }>(response);
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "Intake handoffs could not be loaded.");
  }
  return result as IntakeHandoffWithReport[];
}

// Staff and above: mark an intake handoff as received.
export async function markIntakeHandoffReceived(
  token: string,
  id: string,
): Promise<IntakeHandoffWithReport> {
  const response = await fetch(`${apiBaseUrl}/api/rescue/handoffs/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  const result = await readApiResponse<IntakeHandoffWithReport | { error?: string }>(response);
  if (!response.ok) throw new Error((result as { error?: string }).error ?? "The handoff could not be marked received.");
  return result as IntakeHandoffWithReport;
}