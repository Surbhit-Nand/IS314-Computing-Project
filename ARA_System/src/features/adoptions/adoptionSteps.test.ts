import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stepperState, stepperSummary } from "./adoptionSteps.js";
import type { AdoptionStatus } from "../../types/adoption";

// Run: npm test (glob covers src/**/*.test.ts).
function history(...statuses: AdoptionStatus[]) {
  return statuses.map((status, index) => ({
    id: `h${index}`,
    applicationId: "app-1",
    status,
    changedByClerkUserId: null,
    note: null,
    createdAt: "2026-09-01T00:00:00Z",
  }));
}

describe("adoption phase rail position", () => {
  it("maps a live status straight to its forward step", () => {
    assert.deepEqual(stepperState("submitted", []), { reached: 0, stopped: false });
    assert.deepEqual(stepperState("under_review", []), { reached: 1, stopped: false });
    assert.deepEqual(stepperState("approved", []), { reached: 2, stopped: false });
    assert.deepEqual(stepperState("completed", []), { reached: 3, stopped: false });
  });

  // The regression this guards: a rejected application must not paint
  // "Submitted" as its current stage just because rejection is not a step.
  it("stops a rejected application on the furthest stage it actually reached", () => {
    assert.deepEqual(stepperState("rejected", history("submitted", "rejected")), {
      reached: 0,
      stopped: true,
    });
    assert.deepEqual(stepperState("rejected", history("submitted", "under_review", "rejected")), {
      reached: 1,
      stopped: true,
    });
    assert.deepEqual(
      stepperState("rejected", history("submitted", "under_review", "approved", "rejected")),
      { reached: 2, stopped: true },
    );
  });

  it("stops a withdrawn application the same way", () => {
    assert.deepEqual(stepperState("withdrawn", history("submitted", "under_review", "withdrawn")), {
      reached: 1,
      stopped: true,
    });
  });

  // No stage was ever reached, so nothing is highlighted and the rail is not
  // painted as a stop either - a neutral read rather than a wrong "step 1".
  it("leaves a terminal application with no history unhighlighted", () => {
    assert.deepEqual(stepperState("withdrawn", []), { reached: -1, stopped: false });
    assert.deepEqual(stepperState("rejected", []), { reached: -1, stopped: false });
  });
});

describe("adoption phase rail summary", () => {
  it("counts the stages for a live application", () => {
    assert.equal(stepperSummary("submitted", []), "Step 1 of 4");
    assert.equal(stepperSummary("under_review", []), "Step 2 of 4");
    assert.equal(stepperSummary("approved", []), "Step 3 of 4");
    assert.equal(stepperSummary("completed", []), "Step 4 of 4");
  });

  it("names the stage a stopped application got to", () => {
    assert.equal(
      stepperSummary("rejected", history("submitted", "under_review", "rejected")),
      "Stopped at Under Review",
    );
    assert.equal(stepperSummary("withdrawn", history("submitted", "withdrawn")), "Stopped at Submitted");
  });

  it("says so when a terminal application has no progress on record", () => {
    assert.equal(stepperSummary("withdrawn", []), "No progress recorded yet.");
  });
});
