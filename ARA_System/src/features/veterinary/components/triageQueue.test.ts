import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MedicalQueueAnimal, RapidTriageAssessment, RapidTriageInterventionUrgency } from "../../../types/veterinary.js";
import { criticalTriageCategory, organizeCriticalTriageQueue } from "./vetHelpers.js";

function animal(
  id: string,
  veterinaryPriority: MedicalQueueAnimal["veterinaryPriority"] = "critical",
  urgency?: RapidTriageInterventionUrgency,
  conditionTrend: RapidTriageAssessment["conditionTrend"] = "unchanged",
): MedicalQueueAnimal {
  return {
    id,
    publicId: `SPCA-${id}`,
    name: `Animal ${id}`,
    type: "dog",
    breed: null,
    rescueDate: null,
    status: "intake",
    veterinaryStatus: "needs_initial_examination",
    medicallyCleared: false,
    veterinaryPriority,
    latestTriageAssessment: urgency ? {
      id: `assessment-${id}`,
      animalId: id,
      clinicalStability: "currently_stable",
      interventionUrgency: urgency,
      conditionTrend,
      emergencyFindings: [],
      notes: null,
      performedByClerkUserId: "vet",
      assessedAt: "2026-10-13T10:00:00.000Z",
    } : null,
    triageStatusUnavailable: false,
  };
}

describe("Critical Medical Queue triage ordering", () => {
  it("orders Critical animals by selected urgency and preserves the existing order within categories", () => {
    const queue = [
      animal("urgent-a", "critical", "urgent_evaluation"),
      animal("immediate-a", "critical", "immediate_intervention"),
      animal("unassessed", "critical"),
      animal("stable", "critical", "stabilized_monitoring"),
      animal("immediate-b", "critical", "immediate_intervention"),
      animal("high-priority", "high", "immediate_intervention"),
    ];

    assert.deepEqual(
      organizeCriticalTriageQueue(queue).map(({ id }) => id),
      ["immediate-a", "immediate-b", "unassessed", "urgent-a", "stable", "high-priority"],
    );
  });

  it("keeps missing and unavailable triage prominent without presenting either as stable", () => {
    const unassessed = animal("unassessed");
    const unavailable = { ...animal("unavailable"), triageStatusUnavailable: true };

    assert.equal(criticalTriageCategory(unassessed), "needs_rapid_triage");
    assert.equal(criticalTriageCategory(unavailable), "triage_status_unavailable");
    assert.deepEqual(
      organizeCriticalTriageQueue([animal("urgent", "critical", "urgent_evaluation"), unavailable, unassessed]).map(({ id }) => id),
      ["unavailable", "unassessed", "urgent"],
    );
  });

  it("uses the latest veterinarian-selected urgency even when that assessment records deterioration", () => {
    const reassessed = animal("reassessed", "critical", "urgent_evaluation", "deteriorating");

    assert.equal(reassessed.latestTriageAssessment?.conditionTrend, "deteriorating");
    assert.equal(criticalTriageCategory(reassessed), "urgent_evaluation");
  });

  it("does not apply Critical triage ordering to other priority levels", () => {
    const queue = [
      animal("routine-a", "routine", "stabilized_monitoring"),
      animal("high", "high", "immediate_intervention"),
      animal("critical", "critical", "urgent_evaluation"),
      animal("routine-b", "routine", "immediate_intervention"),
    ];

    assert.deepEqual(
      organizeCriticalTriageQueue(queue).map(({ id }) => id),
      ["critical", "routine-a", "high", "routine-b"],
    );
  });
});
