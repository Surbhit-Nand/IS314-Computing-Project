// The shape of an adoption application as returned by the API. Mirrors the
// `adoption_applications` + `adoption_status_history` tables in
// server/src/db/schema.ts (and matches the service's status const).
export type AdoptionStatus =
  | "submitted"
  | "under_review"
  | "approved"
  | "completed"
  | "rejected"
  | "withdrawn";

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
  // Legacy free-text answers (rows submitted before the 6-section
  // questionnaire; null for new applications).
  homeDetails: string | null;
  familyDetails: string | null;
  existingPets: string | null;
  animalExperience: string | null;
  // Section 1: applicant information (self-declared adult/minor bracket;
  // guardian fields required for minors, null for adults).
  fullName: string | null;
  contactNumber: string | null;
  applicantEmail: string | null;
  residentialAddress: string | null;
  dateOfBirth: string | null;
  ageBracket: "adult" | "minor" | null;
  guardianName: string | null;
  guardianContact: string | null;
  guardianRelationship: "parent" | "guardian" | "other" | null;
  guardianConsent: boolean;
  // Identification document (type + hosted photo URL). Required on new
  // applications; staff judge the document at review.
  idDocumentType: "voter_card" | "passport" | "drivers_licence" | "other" | null;
  idDocumentUrl: string | null;
  // Section 2: household & living situation.
  housingType: "house" | "apartment" | "other" | null;
  tenure: "own" | "rent" | null;
  landlordPetsAllowed: "yes" | "no" | "not_sure" | null;
  fencedYard: "yes" | "no" | "na" | null;
  householdSize: number | null;
  childrenAges: string | null;
  petAllergies: "yes" | "no" | null;
  respiratoryIssues: "yes" | "no" | null;
  // Section 3: pet experience.
  ownedPetsBefore: "yes" | "no" | null;
  previousPetOutcome: string | null;
  hasCurrentPets: "yes" | "no" | null;
  currentPetsDetails: string | null;
  // Section 4: care plan (vet costs + next-of-kin backup contact).
  aloneHours: string | null;
  primaryCaregiver: string | null;
  dailyRoutine: string | null;
  vetCostPlan: string | null;
  travelCarePlan: string | null;
  nextOfKinName: string | null;
  nextOfKinContact: string | null;
  // Section 5: who the adoption is for (+ household agreement, the
  // self-declared household check backed by the home-visit consent).
  adoptionFor: "self" | "gift" | null;
  householdAgreement: "yes" | "no" | null;
  // Section 6: acknowledgements.
  consentHomeVisit: boolean;
  agreeReturnToSpca: boolean;
  confirmAccurate: boolean;
  status: AdoptionStatus;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
  animal: AdoptionAnimalSummary | null;
  // Only present on the single-application detail endpoint.
  history?: AdoptionStatusHistoryEntry[];
};

// The fields an applicant fills in on the apply wizard.
export type AdoptionApplicationInput = {
  animalId: string;
  fullName: string;
  contactNumber: string;
  applicantEmail: string;
  ageBracket: "adult" | "minor";
  guardianName?: string;
  guardianContact?: string;
  guardianRelationship?: "parent" | "guardian" | "other";
  guardianConsent?: true;
  idDocumentType: "voter_card" | "passport" | "drivers_licence" | "other";
  idDocumentUrl: string;
  petAllergies: "yes" | "no";
  respiratoryIssues: "yes" | "no";
  ownedPetsBefore: "yes" | "no";
  previousPetOutcome?: string;
  hasCurrentPets: "yes" | "no";
  currentPetsDetails?: string;
  vetCostPlan: string;
  nextOfKinName: string;
  nextOfKinContact: string;
  adoptionFor: "self" | "gift";
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
    case "withdrawn":
      return "Withdrawn by you";
    default:
      return "Not approved";
  }
}

// Short pill label for status badges (track rows, review queue, modals).
// The fixed-width pill truncates the long labels above, so badges use these
// while steppers/history keep the descriptive text.
export function adoptionStatusShortLabel(status: AdoptionStatus): string {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "under_review":
      return "Under Review";
    case "approved":
      return "Approved";
    case "completed":
      return "Adopted";
    case "withdrawn":
      return "Withdrawn";
    default:
      return "Not approved";
  }
}

// Applicant-facing closure wording. An applicant never sees "withdrawn" as a
// lifecycle status: withdrawing is an action they take, so the resulting state
// reads as a cancellation. The staff queue keeps the "Withdrawn" wording (it
// needs to find and count those records), so these wrappers are used only by
// the applicant's own views.
export function applicantClosureLabel(status: AdoptionStatus): string {
  return status === "withdrawn" ? "Cancelled by you" : adoptionStatusLabel(status);
}

export function applicantClosureShortLabel(status: AdoptionStatus): string {
  return status === "withdrawn" ? "Cancelled" : adoptionStatusShortLabel(status);
}

export function adoptionStatusClass(status: AdoptionStatus): string {
  return status.replaceAll("_", "-");
}

export function adoptionStepIndex(status: AdoptionStatus): number {
  const index = ADOPTION_STATUS_STEPS.indexOf(status);
  return index === -1 ? 0 : index;
}