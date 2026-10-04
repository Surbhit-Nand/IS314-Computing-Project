import type { MedicalRecord } from "../../../types/veterinary";
import type { VeterinaryPriority } from "../../../types/animal";

export type Tone = "blue" | "green" | "amber" | "red" | "slate" | "outline" | "pink";

export const toneClass: Record<Tone, string> = {
  blue: "b-blue",
  green: "b-green",
  amber: "b-amber",
  red: "b-red",
  slate: "b-slate",
  outline: "b-outline",
  pink: "b-pink",
};

// Human-friendly label for snake_case database values.
export function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function fmtTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return `${fmtDate(value)} · ${fmtTime(value)}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

// Splits a stored ISO datetime into the local calendar pieces the picker uses.
export function toDateInputParts(value: string): { date: string; time: string } {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: "", time: "" };
  return {
    date: `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`,
    time: `${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`,
  };
}

// Combines the picker's "YYYY-MM-DD" + "HH:MM" into a timezone-aware ISO string
// the API expects (zod z.string().datetime()).
export function comboToIso(date: string, time: string): string {
  return new Date(`${date}T${time || "00:00"}`).toISOString();
}

export function todayInputParts(): { date: string; time: string } {
  const now = new Date();
  return {
    date: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
    time: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
  };
}

// Veterinary priority chosen by staff at registration, surfaced in the
// medical queue so vets can triage the same way staff assigned it. Critical ->
// Routine; "Not set" for animals registered before the field existed.
export function priorityFor(priority: VeterinaryPriority | null | undefined): { tone: Tone; text: string } {
  switch (priority) {
    case "critical":
      return { tone: "red", text: "Critical" };
    case "high":
      return { tone: "amber", text: "High" };
    case "moderate":
      return { tone: "blue", text: "Moderate" };
    case "routine":
      return { tone: "slate", text: "Routine" };
    default:
      return { tone: "outline", text: "Not set" };
  }
}

// Numeric rank so lists can be sorted highest-priority first. Unset/null
// animals (registered before the field existed) sort last.
export function priorityRank(priority: VeterinaryPriority | null | undefined): number {
  switch (priority) {
    case "critical":
      return 0;
    case "high":
      return 1;
    case "moderate":
      return 2;
    case "routine":
      return 3;
    default:
      return 4;
  }
}

// Maps an animal's veterinary lifecycle to a status badge.
export function veterinaryStatusFor(animal: { veterinaryStatus: string; medicallyCleared: boolean }): { tone: Tone; text: string } {
  if (animal.medicallyCleared) return { tone: "green", text: "Medically Cleared" };
  switch (animal.veterinaryStatus) {
    case "needs_initial_examination":
      return { tone: "red", text: "Needs Assessment" };
    case "awaiting_medical_clearance":
      return { tone: "green", text: "Ready for Clearance" };
    case "treatment_required":
    case "treatment_ongoing":
      return { tone: "amber", text: "Under Treatment" };
    case "under_assessment":
      return { tone: "blue", text: "Assessment in Progress" };
    default:
      return { tone: "blue", text: label(animal.veterinaryStatus) };
  }
}

const NON_CARE = ["Initial Examination", "Final Medical Clearance"];

// Tells the record pages whether the treatment stage is complete, using the
// same rule as the clearance lock: every care item except Initial Examination
// and Final Medical Clearance must be completed or not_required.
export function computeCareStatus(record: MedicalRecord) {
  const careItems = record.carePlan.filter((item) => !NON_CARE.includes(item.requirementType));
  const done = careItems.filter((item) => item.status === "completed" || item.status === "not_required").length;
  const total = careItems.length;
  return { careItems, done, total };
}

export function careStatusCopy(record: MedicalRecord): { tone: "green" | "amber" | "blue" | "red"; text: string; detail: string } {
  const { done, total } = computeCareStatus(record);
  if (record.examinations.length === 0) {
    return { tone: "red", text: "Not assessed", detail: "Initial assessment not recorded yet." };
  }
  if (total === 0) {
    return { tone: "amber", text: "No treatments required", detail: "No care items were added during assessment." };
  }
  if (done === total) {
    return { tone: "green", text: "All treatments complete", detail: "Animal is ready for final medical clearance." };
  }
  return { tone: "blue", text: `${done} of ${total} complete`, detail: `${total - done} remaining before clearance.` };
}

export type WorkflowState = "completed" | "current" | "locked" | "upcoming";

export type WorkflowStepData = {
  number: number;
  title: string;
  description: string;
  state: WorkflowState;
  meta?: string;
};

// Convenience builder: turns the current record-derived state into the three
// display stages used by every record page.
export function buildWorkflowStages({ stage, assessmentDone, treatmentsComplete, medicallyCleared = false }: { stage: 1 | 2 | 3; assessmentDone: boolean; treatmentsComplete: boolean; medicallyCleared?: boolean }): WorkflowStepData[] {
  return [
    {
      number: 1,
      title: "Initial Assessment",
      description: "Record the first veterinary examination and required care.",
      state: assessmentDone ? "completed" : stage === 1 ? "current" : "locked",
    },
    {
      number: 2,
      title: "Required Treatments",
      description: "Schedule and complete every treatment the animal needs.",
      state: !assessmentDone ? "locked" : treatmentsComplete ? "completed" : stage === 2 ? "current" : "upcoming",
    },
    {
      number: 3,
      title: "Medical Clearance",
      description: "Confirm the animal is healthy and ready for adoption.",
      state: medicallyCleared ? "completed" : !assessmentDone || !treatmentsComplete ? "locked" : stage === 3 ? "current" : "upcoming",
    },
  ];
}