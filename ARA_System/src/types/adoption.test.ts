import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adoptionStatusLabel,
  adoptionStatusShortLabel,
  applicantClosureLabel,
  applicantClosureShortLabel,
  type AdoptionStatus,
} from "./adoption.js";

// Run: npm test (glob covers src/**/*.test.ts).
//
// The applicant never sees "withdrawn" as a lifecycle status: withdrawing is an
// action they take, so the resulting state reads as a cancellation. Staff views
// keep the "Withdrawn" wording, so these wrappers exist to stop the staff label
// leaking back into the applicant's own view.
const ALL_STATUSES: AdoptionStatus[] = [
  "submitted",
  "under_review",
  "approved",
  "completed",
  "rejected",
  "withdrawn",
];

describe("applicant closure wording", () => {
  it("presents a withdrawal as a cancellation, not a status", () => {
    assert.equal(applicantClosureShortLabel("withdrawn"), "Cancelled");
    assert.equal(applicantClosureLabel("withdrawn"), "Cancelled by you");
  });

  it("delegates every other status to the shared labels", () => {
    for (const status of ALL_STATUSES) {
      if (status === "withdrawn") continue;
      assert.equal(applicantClosureShortLabel(status), adoptionStatusShortLabel(status));
      assert.equal(applicantClosureLabel(status), adoptionStatusLabel(status));
    }
  });

  it("never shows the word withdrawn to the applicant", () => {
    for (const status of ALL_STATUSES) {
      assert.ok(
        !applicantClosureShortLabel(status).toLowerCase().includes("withdrawn"),
        `short label for ${status} leaked "withdrawn"`,
      );
      assert.ok(
        !applicantClosureLabel(status).toLowerCase().includes("withdrawn"),
        `long label for ${status} leaked "withdrawn"`,
      );
    }
  });
});
