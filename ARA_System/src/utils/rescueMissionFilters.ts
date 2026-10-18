import type { RescueMission } from "../types/rescue";

export function filterEligibleTakeoverMissions(
  missions: RescueMission[],
  viewerClerkUserId: string | undefined,
): RescueMission[] {
  if (!viewerClerkUserId) return [];

  return missions.filter(
    (mission) =>
      mission.status === "assigned" &&
      mission.assignedToClerkUserId != null &&
      mission.assignedToClerkUserId !== viewerClerkUserId,
  );
}
