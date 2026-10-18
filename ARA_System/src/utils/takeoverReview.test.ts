import test from "node:test";
import assert from "node:assert/strict";

import { takeoverReviewTarget } from "./takeoverReview";
import type { AppNotification } from "../types/notification";

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "notification-1",
    recipientClerkUserId: "user-owner",
    type: "rescue.takeover_requested",
    title: "Takeover requested",
    body: null,
    entityType: "rescue_report",
    entityId: "report-1",
    actionId: "takeover-1",
    takeoverRequestStatus: "pending",
    takeoverRequestMissionId: "report-1",
    readAt: null,
    createdAt: "2026-09-23T10:30:00.000Z",
    ...overrides,
  };
}

test("a requested notice links to the exact mission and request", () => {
  assert.deepEqual(takeoverReviewTarget(notification()), {
    missionId: "report-1",
    requestId: "takeover-1",
  });
});

test("links different alerts to their own mission ids", () => {
  const first = takeoverReviewTarget(notification({ entityId: "report-1", takeoverRequestMissionId: "report-1" }));
  const second = takeoverReviewTarget(
    notification({ entityId: "report-2", takeoverRequestMissionId: "report-2", actionId: "takeover-2" }),
  );
  assert.equal(first?.missionId, "report-1");
  assert.equal(second?.missionId, "report-2");
  assert.equal(second?.requestId, "takeover-2");
});

test("a status-only notice still links to the alert using its entity id", () => {
  const target = takeoverReviewTarget(
    notification({
      type: "rescue.takeover_approved",
      actionId: null,
      takeoverRequestStatus: "approved",
      takeoverRequestMissionId: null,
      entityId: "report-9",
    }),
  );
  assert.deepEqual(target, { missionId: "report-9", requestId: null });
});

test("non-takeover notifications do not deep-link", () => {
  assert.equal(
    takeoverReviewTarget(notification({ type: "adoption.status", entityType: "adoption_application" })),
    null,
  );
});

test("a takeover notice with no alert id does not deep-link", () => {
  assert.equal(
    takeoverReviewTarget(notification({ entityId: null, takeoverRequestMissionId: null, actionId: null })),
    null,
  );
});
