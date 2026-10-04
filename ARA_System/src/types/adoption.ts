// The shape of an adoption application as returned by the API. Mirrors the
// `adoption_applications` + `adoption_status_history` tables in
// server/src/db/schema.ts (and matches the service's status const).
export type AdoptionStatus =
  | "submitted"
  | "under_review"
  | "approved"
  | "completed"
  | "rejected";

export type AdoptionStatusHistoryEntry = {
  id: string;
  applicationId: string;
  status: AdoptionStatus;
  changedByClerkUserId: string | null;
  note: string | null;
  createdAt: string;
};

// The display fields the API joins in for the animal being applied for.
export type AdoptionAnimalSummary = {
  id: string;
  publicId: string;
  name: string;
  type: "dog" | "cat" | "rabbit" | "other";
  breed: string | null;
  photoUrls: string[];
  // Vet-issued medical clearance. Staff can't approve an application for an
  // un-cleared animal, so the review queue reads this to warn them up front.
  medicallyCleared: boolean;
};

export type AdoptionApplication = {
  id: string;
  animalId: string;
  applicantClerkUserId: string;
  homeDetails: string;
  familyDetails: string;
  existingPets: string | null;
  animalExperience: string | null;
  status: AdoptionStatus;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
  animal: AdoptionAnimalSummary | null;
  // Only present on the single-application detail endpoint.
  history?: AdoptionStatusHistoryEntry[];
};

// The fields an applicant fills in on the apply form.
export type AdoptionApplicationInput = {
  animalId: string;
  homeDetails: string;
  familyDetails: string;
  existingPets?: string;
  animalExperience?: string;
};

// The forward path shown to applicants as a stepper. Rejection is a branch
// off submitted/under_review and is handled separately by the tracking UI.
export const ADOPTION_STATUS_STEPS: AdoptionStatus[] = [
  "submitted",
  "under_review",
  "approved",
  "completed",
];

// Human label for each lifecycle stage, shown to applicants and staff.
export function adoptionStatusLabel(status: AdoptionStatus): string {
  switch (status) {
    case "submitted":
      return "Submitted - awaiting review";
    case "under_review":
      return "Under review by our team";
    case "approved":
      return "Approved - one step to go";
    case "completed":
      return "Adopted - welcome home!";
    default:
      return "Not approved";
  }
}

export function adoptionStatusClass(status: AdoptionStatus): string {
  return status.replaceAll("_", "-");
}

export function adoptionStepIndex(status: AdoptionStatus): number {
  const index = ADOPTION_STATUS_STEPS.indexOf(status);
  return index === -1 ? 0 : index;
}