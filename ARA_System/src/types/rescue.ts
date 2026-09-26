// The shape of a rescue report as returned by the API. Mirrors the
// `rescue_reports` table in server/src/db/schema.ts.
export type RescueUrgency = "low" | "moderate" | "high" | "critical";

export type RescueReportSource = "online" | "phone";

export type RescueReportStatus =
  | "submitted"
  | "assigned"
  | "in_progress"
  | "awaiting_reassignment"
  | "resolved";

// Outcomes a dispatcher records when completing a rescue. Mirrors
// RESCUE_OUTCOMES in server/src/modules/rescue/rescue.service.ts.
export type RescueOutcome =
  | "rescued_handed_to_spca"
  | "not_located"
  | "unsuccessful"
  | "other";

// One entry on the rescue progress timeline, backed by the
// rescue_report_status_history table. Every claim / start / resolve milestone
// lands here along with the dispatcher's notes, outcome, and evidence photos.
export type RescueProgressEntry = {
  id: string;
  reportId: string;
  fromStatus: RescueReportStatus | null;
  toStatus: RescueReportStatus;
  changedByClerkUserId: string;
  dispatcherName: string | null;
  notes: string | null;
  outcome: RescueOutcome | null;
  additionalRemarks: string | null;
  imageUrls: string[];
  createdAt: string;
};

export type RescueReport = {
  id: string;
  reference: string;
  animalId: string | null;
  reporterClerkUserId: string | null;
  reporterName: string;
  reporterPhone: string | null;
  reporterEmail: string | null;
  location: string;
  // Map pin coordinates chosen on the form (both null when no pin was dropped).
  latitude: number | null;
  longitude: number | null;
  animalType: "dog" | "cat" | "rabbit" | "other" | null;
  animalBreed: string | null;
  conditionDescription: string;
  urgency: RescueUrgency;
  photoUrls: string[];
  source: RescueReportSource;
  status: RescueReportStatus;
  assignedTo: string | null;
  assignedToClerkUserId: string | null;
  assignedAt: string | null;
  officeNote: string | null;
  createdAt: string;
  updatedAt: string;
  // Read-only progress timeline attached to every report the API returns.
  progress: RescueProgressEntry[];
};

// The optional quick updates a dispatcher can file while a rescue mission is
// in progress (note / photo). Backed by the
// rescue_mission_updates table - timestamped server-side, never a status change.
export type RescueUpdateType = "note" | "photo";

export type RescueMissionUpdate = {
  id: string;
  reportId: string;
  updateType: RescueUpdateType;
  message: string | null;
  imageUrls: string[];
  createdByClerkUserId: string;
  dispatcherName: string | null;
  createdAt: string;
};

// The single Post-Rescue Debrief that completes a mission (one per report).
export type RescueDebrief = {
  id: string;
  reportId: string;
  outcome: RescueOutcome;
  animalCondition: string | null;
  whatHappened: string;
  destinationOrHandoff: string | null;
  veterinaryPriority: RescueUrgency | null;
  unsuccessfulDetails: string | null;
  createdByClerkUserId: string;
  dispatcherName: string | null;
  createdAt: string;
};

// One Animal Intake handoff created when a mission ends with a rescued
// animal - triaged with the debrief's veterinary priority, never the report's
// original rescue urgency. The animal profile is created later by the intake
// & profile team, so no animal is linked here.
export type RescueIntakeHandoff = {
  id: string;
  reportId: string;
  animalType: string | null;
  animalBreed: string | null;
  conditionDescription: string | null;
  veterinaryPriority: RescueUrgency | null;
  destination: string | null;
  notes: string | null;
  status: "pending" | "received";
  createdByClerkUserId: string;
  dispatcherName: string | null;
  createdAt: string;
  receivedAt: string | null;
};

// A Rescue Mission as returned by the /api/rescue/missions* endpoints: the
// report + the status timeline + the optional in-rescue updates + the debrief
// + the intake handoff + the automatically generated readable summary.
export type RescueMission = RescueReport & {
  updates: RescueMissionUpdate[];
  debrief: RescueDebrief | null;
  intakeHandoff: RescueIntakeHandoff | null;
  summary: string;
};

// An intake handoff with its original alert attached for the intake team.
export type IntakeHandoffWithReport = RescueIntakeHandoff & {
  report: RescueReport | null;
};

// The fields a reporter fills in (or a staff member fills in for a phone
// call). `source` lets staff log phone reports through the exact same form.
export type RescueReportFormInput = {
  reporterName: string;
  reporterPhone: string;
  reporterEmail: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  animalType: string;
  animalBreed: string;
  conditionDescription: string;
  urgency: RescueUrgency;
  photoUrls: string[];
  source: RescueReportSource;
};

export function rescueUrgencyLabel(urgency: RescueUrgency): string {
  switch (urgency) {
    case "critical":
      return "Critical - life threatening";
    case "high":
      return "High - needs attention soon";
    case "moderate":
      return "Moderate - not urgent";
    default:
      return "Low - can wait";
  }
}

// Human label for each lifecycle stage, shown to reporters and staff.
export function rescueStatusLabel(status: RescueReportStatus): string {
  switch (status) {
    case "submitted":
      return "Received - awaiting review";
    case "assigned":
      return "A dispatcher is assigned";
    case "in_progress":
      return "Rescue in progress";
    case "awaiting_reassignment":
      return "Needs a new dispatcher";
    default:
      return "Case resolved";
  }
}

export function rescueStatusClass(status: RescueReportStatus): string {
  return status.replaceAll("_", "-");
}

// Human-readable label for each rescue outcome choice on the completion form.
export const RESCUE_OUTCOME_LABELS: Record<RescueOutcome, string> = {
  rescued_handed_to_spca: "Animal rescued and handed to SPCA",
  not_located: "Animal could not be located",
  unsuccessful: "Attempted rescue was unsuccessful",
  other: "Other",
};

// Outcomes that mean the animal was actually rescued (an intake handoff is
// created for these). Duplicates RESCUE_SUCCESS_OUTCOMES on the server.
export const RESCUE_SUCCESS_OUTCOMES = ["rescued_handed_to_spca"] as const;

export function isRescueSuccessOutcome(outcome: RescueOutcome): boolean {
  return (RESCUE_SUCCESS_OUTCOMES as readonly string[]).includes(outcome);
}

// Short labels for the quick updates a dispatcher can file mid-rescue.
export const RESCUE_UPDATE_TYPE_LABELS: Record<RescueUpdateType, string> = {
  note: "Note",
  photo: "Photo",
};

// The phase headline shown for a timeline entry, derived from the status it
// moved the case INTO. E.g. a submitted -> assigned entry reads as the
// dispatcher claiming the case.
export function rescueProgressPhaseLabel(
  toStatus: RescueReportStatus,
  fromStatus?: RescueReportStatus | null,
): string {
  switch (toStatus) {
    case "assigned":
      return "Dispatcher accepted the case";
    case "in_progress":
      return fromStatus === "assigned" ? "Rescue started" : "Rescue in progress";
    case "awaiting_reassignment":
      return fromStatus === "in_progress"
        ? "Handover requested - awaiting a new dispatcher"
        : "Release requested - back to the Mission Board";
    case "resolved":
      return "Rescue resolved";
    default:
      return rescueStatusLabel(toStatus);
  }
}