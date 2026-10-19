import assert from "node:assert/strict";
import { test } from "node:test";

process.env.CLERK_SECRET_KEY = "test-clerk-secret-key";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/isolated_test_only";
const { listMyNotifications } = await import("./notifications.service.js");

test("the shared inbox preserves veterinary access checks and Dispatch takeover links", async () => {
  const now = new Date("2026-10-19T00:00:00Z");
  const common = {
    recipientClerkUserId: "owner", title: "Update", body: null,
    readAt: null, createdAt: now,
  };
  const items = [
    { ...common, id: "takeover", type: "rescue.takeover_requested", entityType: "rescue_report", entityId: "mission", actionId: "request" },
    { ...common, id: "emergency", type: "veterinary.emergency.immediate", entityType: "veterinary_emergency_alert", entityId: "animal", actionId: null },
  ];
  for (const veterinaryAccess of [false, true]) {
    const result = await listMyNotifications("owner", {
      access: async (id) => { assert.equal(id, "owner"); return veterinaryAccess; },
      find: async (id, limit, access) => {
        assert.equal(id, "owner"); assert.equal(limit, 30); assert.equal(access, veterinaryAccess);
        return veterinaryAccess ? items : items.slice(0, 1);
      },
      count: async (id, access) => {
        assert.equal(id, "owner"); assert.equal(access, veterinaryAccess);
        return veterinaryAccess ? 2 : 1;
      },
      takeover: async (id) => {
        assert.equal(id, "request");
        return {
          id, reportId: "mission", requestedByClerkUserId: "requester",
          requestedByName: "Dispatcher", assignedToClerkUserId: "owner",
          reason: "Available nearby", status: "pending", decidedByClerkUserId: null,
          decidedAt: null, decisionNote: null, createdAt: now,
        };
      },
    });
    assert.equal(result.unreadCount, veterinaryAccess ? 2 : 1);
    assert.equal(result.items[0].takeoverRequestStatus, "pending");
    assert.equal(result.items[0].takeoverRequestMissionId, "mission");
    if (veterinaryAccess) {
      assert.equal(result.items[1].type, "veterinary.emergency.immediate");
      assert.equal(result.items[1].takeoverRequestStatus, null);
    }
  }
});

test("takeover enrichment does not disclose another recipient's request", async () => {
  const now = new Date("2026-10-19T00:00:00Z");
  const result = await listMyNotifications("unrelated-user", {
    access: async () => false,
    find: async () => [{
      id: "notice", recipientClerkUserId: "unrelated-user", type: "rescue.takeover_requested",
      title: "Update", body: null, entityType: "rescue_report", entityId: "mission",
      actionId: "request", readAt: null, createdAt: now,
    }],
    count: async () => 1,
    takeover: async () => ({
      id: "request", reportId: "mission", requestedByClerkUserId: "requester",
      requestedByName: "Dispatcher", assignedToClerkUserId: "owner", reason: "Nearby",
      status: "pending", decidedByClerkUserId: null, decidedAt: null,
      decisionNote: null, createdAt: now,
    }),
  });
  assert.equal(result.items[0].takeoverRequestStatus, null);
  assert.equal(result.items[0].takeoverRequestMissionId, null);
});
