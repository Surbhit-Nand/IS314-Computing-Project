import type { AppNotification } from "../types/notification";

// Where the bell parks a takeover-review deep link. The header writes it, then
// either hands it straight to the mounted Rescue Operations portal (via the
// event below) or - if the portal isn't open yet - navigates to "rescue-active"
// and the portal consumes it on mount. Surviving in sessionStorage is what lets
// the same alert reopen correctly after a page refresh.
export const TAKEOVER_REVIEW_STORAGE_KEY = "ara.rescue.takeover-review";

// Fired on the window in the same tab so an already-mounted portal reacts
// immediately instead of waiting for a remount (the header and the portal can
// both be showing at once on a rescue page).
export const TAKEOVER_REVIEW_EVENT = "ara:rescue-takeover-review";

export type TakeoverReviewTarget = {
  missionId: string;
  requestId: string | null;
};

// Resolves a notification to the exact rescue alert (and, when it has one, the
// exact takeover request) it should deep-link to. Every rescue takeover notice
// stores the alert id in `entityId`, so the mission target is reliable even for
// status-only notices that carry no request id. Returns null for anything that
// isn't a takeover notice or has no alert to open.
export function takeoverReviewTarget(notification: AppNotification): TakeoverReviewTarget | null {
  if (!notification.type.startsWith("rescue.takeover_")) return null;
  const missionId = notification.takeoverRequestMissionId ?? notification.entityId;
  if (!missionId) return null;
  return { missionId, requestId: notification.actionId };
}
