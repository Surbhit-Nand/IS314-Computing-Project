import assert from "node:assert/strict";
import test from "node:test";
import { filterEligibleTakeoverMissions } from "./rescueMissionFilters";
import type { RescueMission } from "../types/rescue";

function mission(overrides: Partial<RescueMission> = {}): RescueMission {
  return {
    id: "mission",
    reference: "RESCUE-1",
    animalId: null,
    reporterClerkUserId: null,
    reporterName: "Reporter",
    reporterPhone: null,
    reporterEmail: null,
    location: "Suva",
    latitude: null,
    longitude: null,
    animalType: "dog",
    animalBreed: null,
    conditionDescription: "Needs help",
    urgency: "moderate",
    photoUrls: [],
    source: "online",
    status: "assigned",
    assignedTo: "Dispatcher",
    assignedToClerkUserId: "dispatcher-b",
    assignedAt: null,
    officeNote: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    progress: [],
    updates: [],
    debrief: null,
    intakeHandoff: null,
    summary: "",
    takeoverRequests: [],
    myTakeoverRequest: null,
    ...overrides,
  };
}

test("dispatcher A sees only eligible assigned missions owned by dispatcher B", () => {
  const missions = [
    mission({ id: "b-assigned", assignedToClerkUserId: "dispatcher-b" }),
    mission({ id: "a-assigned", assignedToClerkUserId: "dispatcher-a" }),
    mission({ id: "b-progress", status: "in_progress", assignedToClerkUserId: "dispatcher-b" }),
    mission({ id: "unassigned", assignedToClerkUserId: null, assignedTo: null }),
    mission({ id: "resolved", status: "resolved", assignedToClerkUserId: "dispatcher-b" }),
  ];

  assert.deepEqual(
    filterEligibleTakeoverMissions(missions, "dispatcher-a").map(({ id }) => id),
    ["b-assigned"],
  );
});

test("dispatcher B sees dispatcher A's assigned mission, not their own", () => {
  const missions = [
    mission({ id: "a-assigned", assignedToClerkUserId: "dispatcher-a" }),
    mission({ id: "b-assigned", assignedToClerkUserId: "dispatcher-b" }),
  ];

  assert.deepEqual(
    filterEligibleTakeoverMissions(missions, "dispatcher-b").map(({ id }) => id),
    ["a-assigned"],
  );
});
