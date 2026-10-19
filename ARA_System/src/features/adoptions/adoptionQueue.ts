import type { AdoptionStatus } from "../../types/adoption";

export type AdoptionQueueTab = "active" | "history";

// Terminal lifecycle states - finished applications that belong in the
// History tab rather than the live review queue. Mirrors
// ALLOWED_TRANSITIONS in adoptions.service.ts (completed/rejected/withdrawn
// accept no further transitions).
const TERMINAL_STATUSES: ReadonlySet<AdoptionStatus> = new Set([
  "completed",
  "rejected",
  "withdrawn",
]);

export function isTerminalAdoptionStatus(status: AdoptionStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

// Which lifecycle states each queue tab shows. Active is the live work;
// History is the read-only record of finished applications.
export const QUEUE_TAB_STATUSES: Record<AdoptionQueueTab, readonly AdoptionStatus[]> = {
  active: ["submitted", "under_review", "approved"],
  history: ["completed", "rejected", "withdrawn"],
};

// Status dropdown options per tab (plus the "all" option, handled by callers).
export const ACTIVE_STATUS_FILTERS = ["submitted", "under_review", "approved"] as const;
export const HISTORY_STATUS_FILTERS = ["completed", "rejected", "withdrawn"] as const;
