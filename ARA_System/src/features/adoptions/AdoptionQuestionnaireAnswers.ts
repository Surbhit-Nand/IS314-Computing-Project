import type { AdoptionApplication } from "../../types/adoption";

export type AnswerRow = { label: string; value: string; href?: string };
export type AnswerSection = { title: string; rows: AnswerRow[] };

// Short-code -> human label maps for the questionnaire radio answers.
const AGE_BRACKET_LABEL: Record<string, string> = { adult: "Adult (18+)", minor: "Under 18" };
const ID_DOCUMENT_LABEL: Record<string, string> = {
  voter_card: "Voter ID card",
  passport: "Passport",
  drivers_licence: "Driver's licence",
  other: "Other photo ID",
};
const GUARDIAN_RELATIONSHIP_LABEL: Record<string, string> = {
  parent: "Parent",
  guardian: "Guardian",
  other: "Other",
};
const YES_NO_LABEL: Record<string, string> = { yes: "Yes", no: "No" };
const ADOPTION_FOR_LABEL: Record<string, string> = {
  self: "Themselves",
  gift: "Gift for someone else (extra review)",
};

function codeLabel(value: string | null, map: Record<string, string>): string | null {
  if (!value) return null;
  return map[value] ?? value;
}

// Groups an application's questionnaire answers into titled sections for the
// staff review queue and the applicant detail modal. Rows submitted before the
// structured questionnaire (legacy free-text home/family answers) come back
// as a single legacy section so old applications still read fully.
export function questionnaireSections(application: AdoptionApplication): AnswerSection[] {
  if (!application.fullName) {
    return [
      {
        title: "Application answers",
        rows: [
          { label: "About their home", value: application.homeDetails ?? "Not provided" },
          { label: "About their family", value: application.familyDetails ?? "Not provided" },
          { label: "Existing pets", value: application.existingPets || "None mentioned" },
          {
            label: "Experience with animals",
            value: application.animalExperience || "None mentioned",
          },
        ],
      },
    ];
  }

  const sections: AnswerSection[] = [
    {
      title: "1. Applicant",
      rows: [
        { label: "Full name", value: application.fullName },
        { label: "Contact number", value: application.contactNumber ?? "Not provided" },
        { label: "Email", value: application.applicantEmail ?? "Not provided" },
        {
          label: "Age",
          value: codeLabel(application.ageBracket, AGE_BRACKET_LABEL) ?? "Not provided",
        },
        ...(application.ageBracket === "minor"
          ? [
              { label: "Guardian name", value: application.guardianName ?? "Not provided" },
              { label: "Guardian contact", value: application.guardianContact ?? "Not provided" },
              {
                label: "Guardian relationship",
                value:
                  codeLabel(application.guardianRelationship, GUARDIAN_RELATIONSHIP_LABEL) ??
                  "Not provided",
              },
              {
                label: "Guardian consent",
                value: application.guardianConsent ? "Given" : "Not given",
              },
            ]
          : []),
        {
          label: "Identification",
          value: codeLabel(application.idDocumentType, ID_DOCUMENT_LABEL) ?? "Not provided",
        },
        ...(application.idDocumentUrl
          ? [{ label: "ID photo", value: "Open document photo", href: application.idDocumentUrl }]
          : []),
      ],
    },
    {
      title: "2. Household",
      rows: [
        { label: "Pet allergies", value: codeLabel(application.petAllergies, YES_NO_LABEL) ?? "Not provided" },
        {
          label: "Asthma / respiratory condition",
          value: codeLabel(application.respiratoryIssues, YES_NO_LABEL) ?? "Not provided",
        },
      ],
    },
    {
      title: "3. Experience",
      rows: [
        { label: "Owned pets before", value: codeLabel(application.ownedPetsBefore, YES_NO_LABEL) ?? "Not provided" },
        ...(application.ownedPetsBefore === "yes"
          ? [{ label: "Previous pet outcome", value: application.previousPetOutcome || "Not provided" }]
          : []),
        { label: "Current pets", value: codeLabel(application.hasCurrentPets, YES_NO_LABEL) ?? "Not provided" },
        ...(application.hasCurrentPets === "yes"
          ? [{ label: "Current pet details", value: application.currentPetsDetails || "Not provided" }]
          : []),
      ],
    },
    {
      title: "4. Care plan",
      rows: [
        { label: "Vet cost plan", value: application.vetCostPlan ?? "Not provided" },
        { label: "Next of kin", value: application.nextOfKinName ?? "Not provided" },
        { label: "Next of kin contact", value: application.nextOfKinContact ?? "Not provided" },
      ],
    },
    {
      title: "5. Adoption for",
      rows: [
        { label: "Adoption for", value: codeLabel(application.adoptionFor, ADOPTION_FOR_LABEL) ?? "Not provided" },
      ],
    },
  ];
  return sections;
}

// Extra-review flag for gift adoptions, shown as a badge in the staff queue.
export function isGiftAdoption(application: AdoptionApplication): boolean {
  return application.adoptionFor === "gift";
}

// Safeguarding flag for minor applicants, shown as a badge in the staff
// queue so reviewers spot guardian-consent cases without opening the record.
export function isMinorApplication(application: AdoptionApplication): boolean {
  return application.ageBracket === "minor";
}
