import test, { beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

type AnyFunction = (...args: any[]) => unknown; // eslint-disable-line @typescript-eslint/no-explicit-any
const impls = new Map<string, AnyFunction>();
const auditEntries: Record<string, unknown>[] = [];
const historyEntries: Record<string, unknown>[] = [];
const deletedHistoryIds: string[] = [];
const debriefRows: Record<string, unknown>[] = [];
const handoffRows: Record<string, unknown>[] = [];
const deletedDebriefIds: string[] = [];

function current(name: string) {
  const implementation = impls.get(name);
  if (!implementation) throw new Error(`Unexpected call to ${name}`);
  return implementation;
}

function moduleMock(specifier: string, exports: Record<string, unknown>) {
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
}

moduleMock("./rescue.repository.js", {
  createRescueReport: (input: unknown) => current("createRescueReport")(input),
  findAllReports: () => current("findAllReports")(),
  findAvailableReports: () => current("findAvailableReports")(),
  findReportById: (id: string) => current("findReportById")(id),
  findReportByReference: (reference: string) => current("findReportByReference")(reference),
  findReportsByReporter: (id: string) => current("findReportsByReporter")(id),
  findActiveReportsByDispatcher: (id: string) => current("findActiveReportsByDispatcher")(id),
  findAssignedReportsByDispatcher: (id: string) => current("findAssignedReportsByDispatcher")(id),
  findInProgressReportsByDispatcher: (id: string) => current("findInProgressReportsByDispatcher")(id),
  findResolvedReportsByDispatcher: (id: string) => current("findResolvedReportsByDispatcher")(id),
  findStatusHistoryByReportIds: (ids: string[]) => current("findStatusHistoryByReportIds")(ids),
  updateRescueReport: (id: string, input: unknown) => current("updateRescueReport")(id, input),
  updateRescueReportStatusConditional: (id: string, userId: string, next: string, expected: string) =>
    current("updateRescueReportStatusConditional")(id, userId, next, expected),
  revertRescueReportStatus: (id: string, userId: string, from: string, to: string) =>
    current("revertRescueReportStatus")(id, userId, from, to),
  claimRescueReport: (id: string, userId: string, name: string) => current("claimRescueReport")(id, userId, name),
  releaseRescueReportAssignment: (id: string, userId: string, status: string) =>
    current("releaseRescueReportAssignment")(id, userId, status),
  reassignUnassignedRescueReport: (id: string, userId: string, name: string, status: string) =>
    current("reassignUnassignedRescueReport")(id, userId, name, status),
  addRescueStatusHistoryEntry: (input: unknown) => current("addRescueStatusHistoryEntry")(input),
  deleteStatusHistoryEntry: (id: string) => current("deleteStatusHistoryEntry")(id),
  findActiveReports: () => current("findActiveReports")(),
  findResolvedReports: () => current("findResolvedReports")(),
  findReportsByIds: (ids: string[]) => current("findReportsByIds")(ids),
  addRescueMissionUpdate: (input: unknown) => current("addRescueMissionUpdate")(input),
  findMissionUpdatesByReportIds: (ids: string[]) => current("findMissionUpdatesByReportIds")(ids),
  addRescueDebrief: (input: unknown) => current("addRescueDebrief")(input),
  deleteRescueDebrief: (id: string) => current("deleteRescueDebrief")(id),
  findDebriefByReportIds: (ids: string[]) => current("findDebriefByReportIds")(ids),
  createRescueIntakeHandoff: (input: unknown) => current("createRescueIntakeHandoff")(input),
  findIntakeHandoffByReportId: (id: string) => current("findIntakeHandoffByReportId")(id),
  findIntakeHandoffsByReportIds: (ids: string[]) => current("findIntakeHandoffsByReportIds")(ids),
  findPendingIntakeHandoffs: () => current("findPendingIntakeHandoffs")(),
  findIntakeHandoffById: (id: string) => current("findIntakeHandoffById")(id),
  markIntakeHandoffReceived: (id: string, receivedAt: Date) => current("markIntakeHandoffReceived")(id, receivedAt),
});

moduleMock("../../shared/audit/audit.service.js", {
  logAuditEntry: (input: Record<string, unknown>) => {
    auditEntries.push(input);
  },
});

moduleMock("../../services/cloudinaryClient.js", {
  cloudinary: {},
  isCloudinaryConfigured: () => false,
});

const {
  claimRescueReport,
  startRescueReport,
  resolveRescueReport,
  listAvailableRescueReports,
  listMyAssignedRescueReports,
  listMyResolvedRescueReports,
  acceptRescueMission,
  startRescueMission,
  addRescueUpdate,
  completeRescueDebrief,
  releaseRescueMission,
  listMissionBoard,
  listMissionHistory,
  listMyActiveMissions,
  listIntakeHandoffs,
  markIntakeHandoffReceived,
  RescueWorkflowError,
} = await import("./rescue.service.js");

const REPORT_ID = "report-1";
const DISPATCHER_ID = "user-dispatcher";
const OTHER_DISPATCHER_ID = "user-other";
const DISPATCHER_NAME = "Asha Kumar";

function baseReport(overrides: Record<string, unknown> = {}) {
  return {
    id: REPORT_ID,
    reference: "RESCUE-2026-1001",
    status: "submitted",
    assignedTo: null,
    assignedToClerkUserId: null,
    assignedAt: null,
    reporterName: "Mere Tui",
    reporterClerkUserId: null,
    reporterPhone: null,
    reporterEmail: null,
    location: "Lot 7, Kadavu St, Suva",
    latitude: -18.1416,
    longitude: 178.4419,
    animalType: "dog",
    animalBreed: "labrador",
    conditionDescription: "Stray dog limping near the market.",
    urgency: "high",
    photoUrls: [],
    source: "online",
    animalId: null,
    officeNote: null,
    createdAt: new Date("2026-09-23T10:30:00.000Z"),
    updatedAt: new Date("2026-09-23T10:30:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  impls.clear();
  auditEntries.length = 0;
  historyEntries.length = 0;
  deletedHistoryIds.length = 0;
  debriefRows.length = 0;
  handoffRows.length = 0;
  deletedDebriefIds.length = 0;

  impls.set("findReportById", async () => baseReport());
  impls.set("findAvailableReports", async () => []);
  impls.set("findActiveReportsByDispatcher", async () => []);
  impls.set("findAssignedReportsByDispatcher", async () => []);
  impls.set("findInProgressReportsByDispatcher", async () => []);
  impls.set("findResolvedReportsByDispatcher", async () => []);
  impls.set("findStatusHistoryByReportIds", async () => [...historyEntries]);
  impls.set("claimRescueReport", async (_id: string, userId: string, name: string) =>
    baseReport({ status: "assigned", assignedTo: name, assignedToClerkUserId: userId }),
  );
  impls.set("releaseRescueReportAssignment", async () =>
    baseReport({
      status: "awaiting_reassignment",
      assignedTo: null,
      assignedToClerkUserId: null,
      assignedAt: null,
    }),
  );
  impls.set("reassignUnassignedRescueReport", async (_id: string, userId: string, name: string, status: string) =>
    baseReport({ status, assignedTo: name, assignedToClerkUserId: userId }),
  );
  impls.set(
    "updateRescueReportStatusConditional",
    async (_id: string, _userId: string, next: string) => baseReport({ status: next, assignedToClerkUserId: DISPATCHER_ID }),
  );
  impls.set("addRescueStatusHistoryEntry", async (entry: Record<string, unknown>) => {
    const saved = {
      id: `history-${historyEntries.length + 1}`,
      createdAt: new Date("2026-09-23T11:00:00.000Z"),
      ...entry,
    };
    historyEntries.push(saved);
    return saved;
  });
  impls.set("deleteStatusHistoryEntry", async (id: string) => {
    deletedHistoryIds.push(id);
  });
  impls.set("findActiveReports", async () => []);
  impls.set("findResolvedReports", async () => []);
  impls.set("findReportsByIds", async () => []);
  impls.set("findMissionUpdatesByReportIds", async () => []);
  impls.set("findDebriefByReportIds", async () => [...debriefRows]);
  impls.set("findIntakeHandoffsByReportIds", async () => [...handoffRows]);
  impls.set("findPendingIntakeHandoffs", async () => []);
  impls.set("findIntakeHandoffByReportId", async () => undefined);
  impls.set("findIntakeHandoffById", async () => undefined);
  impls.set("addRescueMissionUpdate", async (input: Record<string, unknown>) => ({
    id: "update-1",
    createdAt: new Date("2026-09-23T12:05:00.000Z"),
    ...input,
  }));
  impls.set("addRescueDebrief", async (input: Record<string, unknown>) => {
    const saved = { id: `debrief-${debriefRows.length + 1}`, createdAt: new Date("2026-09-23T12:40:00.000Z"), ...input };
    debriefRows.push(saved);
    return saved;
  });
  impls.set("deleteRescueDebrief", async (id: string) => {
    deletedDebriefIds.push(id);
  });
  impls.set("createRescueIntakeHandoff", async (input: Record<string, unknown>) => {
    const saved = {
      id: `handoff-${handoffRows.length + 1}`,
      status: "pending",
      createdAt: new Date("2026-09-23T12:40:00.000Z"),
      receivedAt: null,
      ...input,
    };
    handoffRows.push(saved);
    return saved;
  });
  impls.set("markIntakeHandoffReceived", async (id: string, receivedAt: Date) => ({
    id,
    status: "received",
    receivedAt,
  }));
});

describe("Dispatcher rescue workflow", () => {
  test("claims an available case, assigns the dispatcher, and records Assigned", async () => {
    const result = await claimRescueReport(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME);
    assert.equal(result?.status, "assigned");
    assert.equal(result?.assignedToClerkUserId, DISPATCHER_ID);
    assert.equal(result?.assignedTo, DISPATCHER_NAME);
    assert.equal(historyEntries[0].toStatus, "assigned");
    assert.equal(historyEntries[0].dispatcherName, DISPATCHER_NAME);
    assert.equal(historyEntries[0].notes, "Dispatcher claimed this case.");
    assert.equal(auditEntries[0].action, "rescue.report.claimed");
  });

  test("cannot claim an already-assigned case", async () => {
    impls.set("findReportById", async () => baseReport({ status: "assigned", assignedTo: DISPATCHER_NAME }));
    await assert.rejects(
      claimRescueReport(REPORT_ID, OTHER_DISPATCHER_ID, "Mere Tui"),
      (error: unknown) => error instanceof RescueWorkflowError && error.status === 409,
    );
  });

  test("rejects the losing dispatcher and removes the orphaned history entry", async () => {
    impls.set("claimRescueReport", async () => undefined);
    await assert.rejects(
      claimRescueReport(REPORT_ID, OTHER_DISPATCHER_ID, "Mere Tui"),
      (error: unknown) => error instanceof RescueWorkflowError && error.status === 409 && /has changed/i.test(error.message),
    );
    assert.equal(deletedHistoryIds.length, 1, "the orphaned claim entry must be removed");
  });

  test("does not change status when saving the progress entry fails", async () => {
    impls.set("addRescueStatusHistoryEntry", async () => {
      throw new Error("db down");
    });
    let claimCalled = false;
    impls.set("claimRescueReport", async () => {
      claimCalled = true;
      return baseReport({ status: "assigned" });
    });
    await assert.rejects(
      claimRescueReport(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME),
      (error: unknown) => error instanceof RescueWorkflowError && error.status === 500,
    );
    assert.equal(claimCalled, false, "the status update must not run when the progress save failed");
    assert.equal(deletedHistoryIds.length, 0);
  });

  test("only the assigned dispatcher can start a rescue", async () => {
    impls.set("findReportById", async () => baseReport({ status: "assigned", assignedToClerkUserId: DISPATCHER_ID }));
    await assert.rejects(
      startRescueReport(REPORT_ID, OTHER_DISPATCHER_ID, "Mere Tui", { notes: "Heading over", imageUrls: [] }),
      (error: unknown) => error instanceof RescueWorkflowError && error.status === 403,
    );
  });

  test("only the assigned dispatcher can resolve a rescue", async () => {
    impls.set("findReportById", async () =>
      baseReport({ status: "in_progress", assignedToClerkUserId: DISPATCHER_ID }),
    );
    await assert.rejects(
      resolveRescueReport(REPORT_ID, OTHER_DISPATCHER_ID, "Mere Tui", {
        notes: "All done",
        outcome: "rescued_handed_to_spca",
        imageUrls: [],
      }),
      (error: unknown) => error instanceof RescueWorkflowError && error.status === 403,
    );
  });

  test("starting a rescue requires progress notes", async () => {
    impls.set("findReportById", async () => baseReport({ status: "assigned", assignedToClerkUserId: DISPATCHER_ID }));
    await assert.rejects(
      startRescueReport(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME, { notes: "   ", imageUrls: [] }),
      (error: unknown) => error instanceof RescueWorkflowError && error.status === 400,
    );
  });

  test("starting a rescue moves assigned to In Progress and saves notes and images", async () => {
    impls.set("findReportById", async () => baseReport({ status: "assigned", assignedToClerkUserId: DISPATCHER_ID }));
    const result = await startRescueReport(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME, {
      notes: "Action plan: catch the dog near the park.",
      imageUrls: ["https://example.com/progress-1.jpg"],
    });
    assert.equal(result?.status, "in_progress");
    assert.equal(historyEntries[0].fromStatus, "assigned");
    assert.equal(historyEntries[0].toStatus, "in_progress");
    assert.equal(historyEntries[0].notes, "Action plan: catch the dog near the park.");
    assert.deepEqual(historyEntries[0].imageUrls, ["https://example.com/progress-1.jpg"]);
    assert.equal(auditEntries[0].action, "rescue.report.started");
  });

  test("resolution requires a final rescue report", async () => {
    impls.set("findReportById", async () =>
      baseReport({ status: "in_progress", assignedToClerkUserId: DISPATCHER_ID }),
    );
    await assert.rejects(
      resolveRescueReport(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME, {
        notes: " ",
        outcome: "rescued_handed_to_spca",
        imageUrls: [],
      }),
      (error: unknown) => error instanceof RescueWorkflowError && error.status === 400,
    );
  });

  test("resolution requires an outcome", async () => {
    impls.set("findReportById", async () =>
      baseReport({ status: "in_progress", assignedToClerkUserId: DISPATCHER_ID }),
    );
    await assert.rejects(
      resolveRescueReport(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME, {
        notes: "Located and handed over.",
        outcome: undefined as never,
        imageUrls: [],
      }),
      (error: unknown) => error instanceof RescueWorkflowError && error.status === 400,
    );
  });

  test("an 'other' outcome requires an explanation", async () => {
    impls.set("findReportById", async () =>
      baseReport({ status: "in_progress", assignedToClerkUserId: DISPATCHER_ID }),
    );
    await assert.rejects(
      resolveRescueReport(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME, {
        notes: "Nothing found.",
        outcome: "other",
        imageUrls: [],
      }),
      (error: unknown) => error instanceof RescueWorkflowError && error.status === 400 && /explain/i.test(error.message),
    );
  });

  test("resolving moves In Progress to Resolved with the final report, outcome, and evidence", async () => {
    impls.set("findReportById", async () =>
      baseReport({ status: "in_progress", assignedToClerkUserId: DISPATCHER_ID }),
    );
    const result = await resolveRescueReport(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME, {
      notes: "Rescued the animal and transported it to the clinic.",
        outcome: "rescued_handed_to_spca",
      additionalRemarks: "Owner contacted afterwards.",
      imageUrls: ["https://example.com/evidence-1.jpg", "https://example.com/evidence-2.jpg"],
    });
    assert.equal(result?.status, "resolved");
    assert.equal(historyEntries[0].toStatus, "resolved");
    assert.equal(historyEntries[0].outcome, "rescued_handed_to_spca");
    assert.equal(historyEntries[0].additionalRemarks, "Owner contacted afterwards.");
    assert.deepEqual(historyEntries[0].imageUrls, [
      "https://example.com/evidence-1.jpg",
      "https://example.com/evidence-2.jpg",
    ]);
    assert.equal(auditEntries[0].action, "rescue.report.resolved");
  });

  test("rejects invalid, skipped, and backward transitions including from Resolved", async () => {
    // Skipped: assigned -> resolved without being In Progress first.
    impls.set("findReportById", async () => baseReport({ status: "assigned", assignedToClerkUserId: DISPATCHER_ID }));
    await assert.rejects(
      resolveRescueReport(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME, {
        notes: "Should not work.",
        outcome: "other",
        additionalRemarks: "Nope",
        imageUrls: [],
      }),
      (error: unknown) => /cannot move/i.test(String((error as Error).message)),
    );

    // Backward / no-op: resolved can never be updated again.
    impls.set("findReportById", async () => baseReport({ status: "resolved", assignedToClerkUserId: DISPATCHER_ID }));
    await assert.rejects(
      resolveRescueReport(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME, {
        notes: "Reopening?",
        outcome: "other",
        additionalRemarks: "No",
        imageUrls: [],
      }),
      (error: unknown) => /cannot move/i.test(String((error as Error).message)),
    );
  });

  test("unassigned cases cannot move to In Progress", async () => {
    impls.set("findReportById", async () => baseReport({ status: "submitted", assignedToClerkUserId: null }));
    await assert.rejects(
      startRescueReport(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME, { notes: "Not mine.", imageUrls: [] }),
      (error: unknown) => error instanceof RescueWorkflowError && error.status === 403,
    );
  });
});

describe("Dispatcher tab queries", () => {
  test("available tab returns only unassigned submitted cases", async () => {
    const available = [
      { ...baseReport(), id: "r1" },
      { ...baseReport({ status: "assigned", assignedToClerkUserId: DISPATCHER_ID }), id: "r2" },
      { ...baseReport({ status: "in_progress" }), id: "r3" },
    ];
    impls.set("findAvailableReports", async () => available);
    const result = await listAvailableRescueReports();
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "r1");
    assert.equal(result[0].status, "submitted");
  });

  test("my cases tab excludes resolved reports and other dispatchers'", async () => {
    const active = [
      { ...baseReport({ status: "assigned", assignedToClerkUserId: DISPATCHER_ID }), id: "mine-active" },
      { ...baseReport({ status: "resolved", assignedToClerkUserId: DISPATCHER_ID }), id: "mine-resolved" },
      { ...baseReport({ status: "in_progress", assignedToClerkUserId: OTHER_DISPATCHER_ID }), id: "other" },
    ];
    impls.set("findActiveReportsByDispatcher", async () => active.filter((r) => r.status !== "resolved" && r.assignedToClerkUserId === DISPATCHER_ID));
    const result = await listMyAssignedRescueReports(DISPATCHER_ID);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "mine-active");
  });

  test("resolved tab returns only my resolved cases", async () => {
    const resolved = [
      { ...baseReport({ status: "resolved", assignedToClerkUserId: DISPATCHER_ID }), id: "mine-done" },
      { ...baseReport({ status: "resolved", assignedToClerkUserId: OTHER_DISPATCHER_ID }), id: "other-done" },
    ];
    impls.set("findResolvedReportsByDispatcher", async () => resolved.filter((r) => r.assignedToClerkUserId === DISPATCHER_ID));
    const result = await listMyResolvedRescueReports(DISPATCHER_ID);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "mine-done");
  });

  test("a claimed case moves out of available and into the dispatcher's active list", async () => {
    // Claim is only possible on a submitted, unassigned case...
    impls.set("findReportById", async () => baseReport());
    const claimed = await claimRescueReport(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME);
    assert.equal(claimed?.status, "assigned");
    assert.equal(claimed?.assignedToClerkUserId, DISPATCHER_ID);

    // ...and the same id no longer qualifies for a second claim.
    impls.set("findReportById", async () => baseReport({ status: "assigned", assignedToClerkUserId: DISPATCHER_ID }));
    await assert.rejects(claimRescueReport(REPORT_ID, OTHER_DISPATCHER_ID, "Mere Tui"), (error: unknown) => error instanceof RescueWorkflowError && error.status === 409);
  });
});

describe("Rescue mission workflow", () => {
  test("Accept Mission assigns the dispatcher and records Assigned", async () => {
    const mission = await acceptRescueMission(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME);
    assert.equal(mission?.status, "assigned");
    assert.equal(mission?.assignedToClerkUserId, DISPATCHER_ID);
    assert.equal(historyEntries[0].toStatus, "assigned");
    assert.equal(historyEntries[0].notes, "Dispatcher accepted this mission.");
    assert.equal(auditEntries[0].action, "rescue.mission.accepted");
  });

  test("cannot accept an already-accepted mission", async () => {
    impls.set("findReportById", async () => baseReport({ status: "assigned", assignedToClerkUserId: DISPATCHER_ID }));
    await assert.rejects(
      acceptRescueMission(REPORT_ID, OTHER_DISPATCHER_ID, "Mere Tui"),
      (error: unknown) => error instanceof RescueWorkflowError && error.status === 409,
    );
  });

  test("Release Mission clears the assignment and puts the alert back on the board", async () => {
    impls.set("findReportById", async () => baseReport({ status: "assigned", assignedToClerkUserId: DISPATCHER_ID }));
    const mission = await releaseRescueMission(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME, {
      reason: "Trip cancelled - unable to reach the site.",
    });
    assert.equal(mission?.status, "awaiting_reassignment");
    assert.equal(mission?.assignedToClerkUserId, null);
    assert.equal(historyEntries[0].toStatus, "awaiting_reassignment");
    assert.equal(historyEntries[0].notes, "Trip cancelled - unable to reach the site.");
    assert.equal(historyEntries[0].dispatcherName, DISPATCHER_NAME);
    assert.equal(auditEntries[0].action, "rescue.mission.released");
  });

  test("Release Mission requires a reason", async () => {
    impls.set("findReportById", async () => baseReport({ status: "assigned", assignedToClerkUserId: DISPATCHER_ID }));
    await assert.rejects(
      releaseRescueMission(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME, { reason: "   " }),
      (error: unknown) => error instanceof RescueWorkflowError && error.status === 400,
    );
  });

  test("only the assigned dispatcher can release a mission", async () => {
    impls.set("findReportById", async () => baseReport({ status: "assigned", assignedToClerkUserId: DISPATCHER_ID }));
    await assert.rejects(
      releaseRescueMission(REPORT_ID, OTHER_DISPATCHER_ID, "Mere Tui", { reason: "Not mine to release." }),
      (error: unknown) => error instanceof RescueWorkflowError && error.status === 403,
    );
  });

  test("Request Handover keeps the mission on the board as awaiting reassignment", async () => {
    impls.set("findReportById", async () => baseReport({ status: "in_progress", assignedToClerkUserId: DISPATCHER_ID }));
    const mission = await releaseRescueMission(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME, {
      reason: "Shift ending - no backup available.",
    });
    assert.equal(mission?.status, "awaiting_reassignment");
    assert.equal(mission?.assignedTo, null);
    assert.equal(historyEntries[0].toStatus, "awaiting_reassignment");
    assert.equal(historyEntries[0].notes, "Shift ending - no backup available.");
    assert.equal(auditEntries[0].action, "rescue.mission.handover_requested");
  });

  test("a released alert is accepted again as a fresh Assigned mission", async () => {
    impls.set("findReportById", async () =>
      baseReport({ status: "awaiting_reassignment", assignedToClerkUserId: null, assignedTo: null }),
    );
    historyEntries.push({
      fromStatus: "assigned",
      toStatus: "awaiting_reassignment",
      notes: "Trip cancelled - unable to reach the site.",
    });
    const mission = await acceptRescueMission(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME);
    assert.equal(mission?.status, "assigned");
    assert.equal(mission?.assignedToClerkUserId, DISPATCHER_ID);
    assert.equal(historyEntries[historyEntries.length - 1].toStatus, "assigned");
    assert.equal(historyEntries[historyEntries.length - 1].notes, "Dispatcher accepted this alert after it was released.");
  });

  test("a handed-over mission resumes In Progress for the accepting dispatcher", async () => {
    impls.set("findReportById", async () =>
      baseReport({ status: "awaiting_reassignment", assignedToClerkUserId: null, assignedTo: null }),
    );
    historyEntries.push({
      fromStatus: "in_progress",
      toStatus: "awaiting_reassignment",
      notes: "Shift ending - no backup available.",
    });
    const mission = await acceptRescueMission(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME);
    assert.equal(mission?.status, "in_progress");
    assert.equal(mission?.assignedToClerkUserId, DISPATCHER_ID);
    assert.equal(historyEntries[historyEntries.length - 1].toStatus, "in_progress");
    assert.equal(historyEntries[historyEntries.length - 1].notes, "Dispatcher accepted the handover and is continuing the rescue.");
  });

  test("two dispatchers accepting the same released alert cannot both win", async () => {
    // The loser bypasses the pre-check because the row still looked free, then
    // the guarded repository UPDATE returns nothing and the service rolls its
    // history entry back with a friendly conflict.
    impls.set("findReportById", async () =>
      baseReport({ status: "awaiting_reassignment", assignedToClerkUserId: null, assignedTo: null }),
    );
    impls.set("reassignUnassignedRescueReport", async () => undefined);
    await assert.rejects(
      acceptRescueMission(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME),
      (error: unknown) => error instanceof RescueWorkflowError && error.status === 409,
    );
    assert.equal(deletedHistoryIds.length, 1, "the orphaned history entry must be rolled back");
  });

  test("released and handed-over alerts appear on the Mission Board", async () => {
    impls.set("findAvailableReports", async () => [
      baseReport({ status: "awaiting_reassignment", assignedToClerkUserId: null, assignedTo: null }),
    ]);
    const board = await listMissionBoard();
    assert.equal(board.length, 1);
    assert.equal(board[0].status, "awaiting_reassignment");
  });

  test("an in-flight mission never leaks onto the Mission Board", async () => {
    impls.set("findAvailableReports", async () => [
      baseReport({ status: "in_progress", assignedToClerkUserId: DISPATCHER_ID }),
    ]);
    const board = await listMissionBoard();
    assert.equal(board.length, 0);
  });

  test("Start Mission works without a note (no forced form)", async () => {
    impls.set("findReportById", async () => baseReport({ status: "assigned", assignedToClerkUserId: DISPATCHER_ID }));
    const mission = await startRescueMission(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME, {});
    assert.equal(mission?.status, "in_progress");
    assert.equal(historyEntries[0].toStatus, "in_progress");
    assert.equal(historyEntries[0].notes, "Rescue started.");
    assert.equal(auditEntries[0].action, "rescue.mission.started");
  });

  test("only the assigned dispatcher can start their mission", async () => {
    impls.set("findReportById", async () => baseReport({ status: "assigned", assignedToClerkUserId: DISPATCHER_ID }));
    await assert.rejects(
      startRescueMission(REPORT_ID, OTHER_DISPATCHER_ID, "Mere Tui", { notes: "Sneak" }),
      (error: unknown) => error instanceof RescueWorkflowError && error.status === 403,
    );
  });

  test("quick updates are rejected unless the mission is In Progress", async () => {
    impls.set("findReportById", async () => baseReport({ status: "assigned", assignedToClerkUserId: DISPATCHER_ID }));
    await assert.rejects(
      addRescueUpdate(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME, { updateType: "note", message: "Scene check" }),
      (error: unknown) => error instanceof RescueWorkflowError && error.status === 409,
    );
  });

  test("a note update is timestamped and does not change the mission status", async () => {
    impls.set("findReportById", async () => baseReport({ status: "in_progress", assignedToClerkUserId: DISPATCHER_ID }));
    const result = await addRescueUpdate(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME, {
      updateType: "note",
      message: "Tree limb down blocking the driveway",
      imageUrls: [],
    });
    assert.ok(result);
    assert.equal(result.update.updateType, "note");
    assert.equal(result.update.message, "Tree limb down blocking the driveway");
    assert.equal(result.mission.status, "in_progress");
  });

  test("a photo update requires an image", async () => {
    impls.set("findReportById", async () => baseReport({ status: "in_progress", assignedToClerkUserId: DISPATCHER_ID }));
    await assert.rejects(
      addRescueUpdate(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME, { updateType: "photo", imageUrls: [] }),
      (error: unknown) => error instanceof RescueWorkflowError && error.status === 400,
    );
  });

  test("a rescued debrief requires a veterinary priority", async () => {
    impls.set("findReportById", async () => baseReport({ status: "in_progress", assignedToClerkUserId: DISPATCHER_ID }));
    await assert.rejects(
      completeRescueDebrief(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME, {
        outcome: "rescued_handed_to_spca",
        whatHappened: "Calmed the dog and transported it.",
      }),
      (error: unknown) => error instanceof RescueWorkflowError && error.status === 400,
    );
  });

  test("a rescued debrief resolves the mission and creates one intake handoff", async () => {
    impls.set("findReportById", async () => baseReport({ status: "in_progress", assignedToClerkUserId: DISPATCHER_ID }));
    const mission = await completeRescueDebrief(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME, {
      outcome: "rescued_handed_to_spca",
      whatHappened: "Calmed the dog and transported it to the clinic.",
      veterinaryPriority: "high",
      animalCondition: "Limping but calm",
    });
    assert.equal(mission?.status, "resolved");
    assert.equal(historyEntries[0].toStatus, "resolved");
    assert.equal(historyEntries[0].outcome, "rescued_handed_to_spca");
    assert.equal(debriefRows[0].reportId, REPORT_ID);
    assert.equal(debriefRows[0].veterinaryPriority, "high");
    assert.equal(debriefRows[0].destinationOrHandoff, null);
    assert.equal(handoffRows.length, 1);
    assert.equal(handoffRows[0].status, "pending");
    assert.equal(handoffRows[0].reportId, REPORT_ID);
    assert.equal(handoffRows[0].destination, "SPCA Fiji");
    assert.equal(auditEntries[0].action, "rescue.mission.resolved");
  });

  test("an unsuccessful rescue resolves without creating an intake handoff", async () => {
    impls.set("findReportById", async () => baseReport({ status: "in_progress", assignedToClerkUserId: DISPATCHER_ID }));
    const mission = await completeRescueDebrief(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME, {
      outcome: "unsuccessful",
      whatHappened: "Attempted to approach but the dog retreated into a den.",
      unsuccessfulDetails: "Returned to base - will re-attempt tomorrow.",
    });
    assert.equal(mission?.status, "resolved");
    assert.equal(handoffRows.length, 0);
    assert.equal(debriefRows[0].outcome, "unsuccessful");
  });

  test("a lost debrief race cleans up the orphaned timeline and debrief rows", async () => {
    impls.set("findReportById", async () => baseReport({ status: "in_progress", assignedToClerkUserId: DISPATCHER_ID }));
    impls.set("updateRescueReportStatusConditional", async () => undefined);
    await assert.rejects(
      completeRescueDebrief(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME, {
        outcome: "unsuccessful",
        whatHappened: "Could not safely approach the animal.",
      }),
      (error: unknown) => error instanceof RescueWorkflowError && error.status === 409,
    );
    assert.equal(deletedHistoryIds.length, 1);
    assert.equal(deletedDebriefIds.length, 1);
  });

  test("mission board ranks Critical above High and oldest first within a band", async () => {
    const oldCritical = { ...baseReport({ urgency: "critical", createdAt: new Date("2026-09-20T08:00:00Z") }), id: "c1" };
    const newerCritical = { ...baseReport({ urgency: "critical", createdAt: new Date("2026-09-22T08:00:00Z") }), id: "c2" };
    const high = { ...baseReport({ urgency: "high", createdAt: new Date("2026-09-23T08:00:00Z") }), id: "h1" };
    const low = { ...baseReport({ urgency: "low", createdAt: new Date("2026-09-23T08:00:00Z") }), id: "l1" };
    impls.set("findAvailableReports", async () => [low, high, newerCritical, oldCritical]);
    const board = await listMissionBoard();
    assert.deepEqual(board.map((mission) => mission.id), ["c1", "c2", "h1", "l1"]);
  });

  test("mission board shows only unassigned submitted alerts", async () => {
    const available = [
      { ...baseReport(), id: "open-alert" },
      { ...baseReport({ status: "assigned", assignedToClerkUserId: DISPATCHER_ID, assignedTo: DISPATCHER_NAME }), id: "claimed" },
      { ...baseReport({ status: "in_progress", assignedToClerkUserId: DISPATCHER_ID, assignedTo: DISPATCHER_NAME }), id: "working" },
      { ...baseReport({ status: "resolved", assignedToClerkUserId: DISPATCHER_ID, assignedTo: DISPATCHER_NAME }), id: "done" },
    ];
    impls.set("findAvailableReports", async () => available);
    const board = await listMissionBoard();
    assert.deepEqual(board.map((mission) => mission.id), ["open-alert"]);
    assert.equal(board[0].status, "submitted");
    assert.equal(board[0].assignedToClerkUserId, null);
  });

  test("a claimed case leaves the board for the accepting dispatcher's Assigned group", async () => {
    impls.set("findReportById", async () => baseReport());
    const mission = await acceptRescueMission(REPORT_ID, DISPATCHER_ID, DISPATCHER_NAME);
    assert.equal(mission?.status, "assigned");

    // The same id would no longer be returned by the board's available query.
    impls.set("findAssignedReportsByDispatcher", async () => [
      { ...baseReport({ status: "assigned", assignedToClerkUserId: DISPATCHER_ID }), id: REPORT_ID },
    ]);
    impls.set("findAvailableReports", async () => []);
    const [board, mine] = await Promise.all([
      listMissionBoard(),
      listMyActiveMissions(DISPATCHER_ID),
    ]);
    assert.equal(board.length, 0, "an accepted case must not appear on the Mission Board");
    assert.deepEqual(mine.assigned.map((item) => item.id), [REPORT_ID]);
    assert.deepEqual(mine.inProgress, []);
  });

  test("my active missions split into Assigned and In Progress groups only", async () => {
    const assigned = [
      { ...baseReport({ status: "assigned", assignedToClerkUserId: DISPATCHER_ID, urgency: "critical" }), id: "crit-mine" },
      { ...baseReport({ status: "assigned", assignedToClerkUserId: OTHER_DISPATCHER_ID, urgency: "high" }), id: "other-assigned" },
    ];
    const inProgress = [
      { ...baseReport({ status: "in_progress", assignedToClerkUserId: DISPATCHER_ID, urgency: "low" }), id: "low-mine" },
      { ...baseReport({ status: "resolved", assignedToClerkUserId: DISPATCHER_ID }), id: "resolved-mine" },
    ];
    impls.set("findAssignedReportsByDispatcher", async () =>
      assigned.filter((report) => report.assignedToClerkUserId === DISPATCHER_ID),
    );
    impls.set("findInProgressReportsByDispatcher", async () =>
      inProgress.filter((report) => report.status !== "resolved" && report.assignedToClerkUserId === DISPATCHER_ID),
    );
    const mine = await listMyActiveMissions(DISPATCHER_ID);
    assert.deepEqual(mine.assigned.map((mission) => mission.id), ["crit-mine"]);
    assert.deepEqual(mine.inProgress.map((mission) => mission.id), ["low-mine"]);
  });

  test("mission history shows only resolved missions, ranked by urgency", async () => {
    const rows = [
      { ...baseReport({ status: "resolved", urgency: "low", createdAt: new Date("2026-09-18T08:00:00Z") }), id: "r-low" },
      { ...baseReport({ status: "resolved", urgency: "critical", createdAt: new Date("2026-09-21T08:00:00Z") }), id: "r-crit-new" },
      { ...baseReport({ status: "resolved", urgency: "critical", createdAt: new Date("2026-09-20T08:00:00Z") }), id: "r-crit-old" },
      { ...baseReport({ status: "in_progress", urgency: "critical" }), id: "still-open" },
    ];
    impls.set("findResolvedReports", async () => rows);
    const history = await listMissionHistory();
    // Critical first, newest first within the band; the open mission is filtered out.
    assert.deepEqual(history.map((mission) => mission.id), ["r-crit-new", "r-crit-old", "r-low"]);
  });

  test("intake handoffs attach the original alert for the intake team", async () => {
    impls.set("findPendingIntakeHandoffs", async () => [
      { id: "handoff-1", reportId: REPORT_ID, status: "pending" },
    ]);
    impls.set("findReportsByIds", async (ids: string[]) => ids.map((id) => baseReport({ id })));
    const handoffs = await listIntakeHandoffs();
    assert.equal(handoffs.length, 1);
    assert.equal(handoffs[0].report?.reference, "RESCUE-2026-1001");
  });

  test("marking an intake handoff received records the timestamp and audits it", async () => {
    impls.set("findIntakeHandoffById", async () => ({ id: "handoff-1", reportId: REPORT_ID, status: "pending" }));
    impls.set("findReportsByIds", async () => [baseReport()]);
    const received = await markIntakeHandoffReceived("handoff-1", DISPATCHER_ID);
    assert.ok(received, "handoff should exist");
    assert.equal(received.status, "received");
    assert.ok(received.receivedAt instanceof Date);
    assert.equal(auditEntries[0].action, "rescue.intake.received");
  });
});