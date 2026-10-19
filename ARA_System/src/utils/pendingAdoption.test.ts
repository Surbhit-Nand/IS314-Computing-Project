import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clearPendingAdoption,
  readPendingAdoption,
  savePendingAdoption,
} from "./pendingAdoption.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

describe("pendingAdoption", () => {
  it("round-trips a stashed animal id", () => {
    clearPendingAdoption();
    savePendingAdoption("animal-123");
    assert.equal(readPendingAdoption(), "animal-123");
    clearPendingAdoption();
  });

  it("returns null when nothing is stashed", () => {
    clearPendingAdoption();
    assert.equal(readPendingAdoption(), null);
  });

  it("treats a week-old stash as abandoned", () => {
    clearPendingAdoption();
    savePendingAdoption("animal-123");
    assert.equal(readPendingAdoption(Date.now() + SEVEN_DAYS_MS + 1000), null);
    clearPendingAdoption();
  });

  it("clears the stash", () => {
    savePendingAdoption("animal-123");
    clearPendingAdoption();
    assert.equal(readPendingAdoption(), null);
  });
});
