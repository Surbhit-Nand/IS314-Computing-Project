import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVE_STATUS_FILTERS,
  HISTORY_STATUS_FILTERS,
  QUEUE_TAB_STATUSES,
  isTerminalAdoptionStatus,
} from "./adoptionQueue.js";

// Run: npm test (glob covers src/**/*.test.ts).
describe("adoption queue tabs", () => {
  it("treats completed, rejected and withdrawn as terminal", () => {
    assert.equal(isTerminalAdoptionStatus("completed"), true);
    assert.equal(isTerminalAdoptionStatus("rejected"), true);
    assert.equal(isTerminalAdoptionStatus("withdrawn"), true);
    assert.equal(isTerminalAdoptionStatus("submitted"), false);
    assert.equal(isTerminalAdoptionStatus("under_review"), false);
    assert.equal(isTerminalAdoptionStatus("approved"), false);
  });

  it("splits every lifecycle status across exactly one tab", () => {
    const all = [...QUEUE_TAB_STATUSES.active, ...QUEUE_TAB_STATUSES.history].sort();
    assert.deepEqual(all, [
      "approved",
      "completed",
      "rejected",
      "submitted",
      "under_review",
      "withdrawn",
    ]);
  });

  it("matches dropdown options to their tab", () => {
    assert.deepEqual([...ACTIVE_STATUS_FILTERS], [...QUEUE_TAB_STATUSES.active]);
    assert.deepEqual([...HISTORY_STATUS_FILTERS], [...QUEUE_TAB_STATUSES.history]);
  });
});
