import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ADULT_AGE, calculateAge } from "./age.js";

// Run: npm test (glob covers src/**/*.test.ts).
describe("calculateAge", () => {
  const asOf = new Date(2026, 9, 6); // 6 Oct 2026

  it("computes whole years", () => {
    assert.equal(calculateAge("1995-03-12", asOf), 31);
  });

  it("waits for this year's birthday", () => {
    assert.equal(calculateAge("2000-10-07", asOf), 25);
    assert.equal(calculateAge("2000-10-06", asOf), 26);
  });

  it("rejects missing, malformed, impossible, and future dates", () => {
    assert.equal(calculateAge(null), null);
    assert.equal(calculateAge(""), null);
    assert.equal(calculateAge("12 Mar 1995", asOf), null);
    assert.equal(calculateAge("2026-02-30", asOf), null);
    assert.equal(calculateAge("2030-01-01", asOf), null);
  });

  it("defines the adult threshold", () => {
    assert.equal(ADULT_AGE, 18);
    assert.ok((calculateAge("2008-10-06", asOf) ?? 0) >= ADULT_AGE);
    assert.ok((calculateAge("2008-10-07", asOf) ?? 99) < ADULT_AGE);
  });
});
