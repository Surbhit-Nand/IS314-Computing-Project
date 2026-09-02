// The shape of a rescue report as returned by the API. Mirrors the
// `rescue_reports` table in server/src/db/schema.ts.
export type RescueUrgency = "low" | "moderate" | "high" | "critical";

export type RescueReportSource = "online" | "phone";

export type RescueReportStatus = "submitted" | "assigned" | "rescued" | "closed";

export type RescueReport = {
  id: string;
  reference: string;
  animalId: string | null;
  reporterClerkUserId: string | null;
  reporterName: string;
  reporterPhone: string | null;
  reporterEmail: string | null;
  location: string;
  // Map pin coordinates chosen on the form (both null when no pin was dropped).
  latitude: number | null;
  longitude: number | null;
  animalType: "dog" | "cat" | "rabbit" | "other" | null;
  animalBreed: string | null;
  conditionDescription: string;
  urgency: RescueUrgency;
  photoUrls: string[];
  source: RescueReportSource;
  status: RescueReportStatus;
  assignedTo: string | null;
  assignedToClerkUserId: string | null;
  officeNote: string | null;
  createdAt: string;
  updatedAt: string;
};

// The fields a reporter fills in (or a staff member fills in for a phone
// call). `source` lets staff log phone reports through the exact same form.
export type RescueReportFormInput = {
  reporterName: string;
  reporterPhone: string;
  reporterEmail: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  animalType: string;
  animalBreed: string;
  conditionDescription: string;
  urgency: RescueUrgency;
  photoUrls: string[];
  source: RescueReportSource;
};

export function rescueUrgencyLabel(urgency: RescueUrgency): string {
  switch (urgency) {
    case "critical":
      return "Critical - life threatening";
    case "high":
      return "High - needs attention soon";
    case "moderate":
      return "Moderate - not urgent";
    default:
      return "Low - can wait";
  }
}

// Human label for each lifecycle stage, shown to reporters and staff.
export function rescueStatusLabel(status: RescueReportStatus): string {
  switch (status) {
    case "submitted":
      return "Received - awaiting review";
    case "assigned":
      return "A rescuer is assigned";
    case "rescued":
      return "Animal picked up safely";
    default:
      return "Case closed";
  }
}

export function rescueStatusClass(status: RescueReportStatus): string {
  return status.replaceAll("_", "-");
}