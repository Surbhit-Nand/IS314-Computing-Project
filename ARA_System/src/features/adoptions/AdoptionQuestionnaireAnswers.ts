import type { AdoptionApplication } from "../../types/adoption";
import { calculateAge } from "../../utils/age";

export type AnswerRow = { label: string; value: string };
export type AnswerSection = { title: string; rows: AnswerRow[] };

// Short-code -> human label maps for the questionnaire radio answers.
const HOUSING_LABEL: Record<string, string> = {
  house: "House",
  apartment: "Apartment",
  other: "Other",
};
const TENURE_LABEL: Record<string, string> = { own: "Own", rent: "Rent" };
const LANDLORD_LABEL: Record<string, string> = {
  yes: "Yes",
  no: "No",
  not_sure: "Not sure",
};
const FENCED_LABEL: Record<string, string> = { yes: "Yes", no: "No", na: "N/A" };
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
        { label: "Residential address", value: application.residentialAddress ?? "Not provided" },
        {
          label: "Date of birth",
          value: (() => {
            if (!application.dateOfBirth) return "Not provided";
            const age = calculateAge(application.dateOfBirth);
            return age === null ? application.dateOfBirth : `${application.dateOfBirth} (age ${age})`;
          })(),
        },
      ],
    },
    {
      title: "2. Household",
      rows: [
        { label: "Housing type", value: codeLabel(application.housingType, HOUSING_LABEL) ?? "Not provided" },
        { label: "Own or rent", value: codeLabel(application.tenure, TENURE_LABEL) ?? "Not provided" },
        ...(application.tenure === "rent"
          ? [
              {
                label: "Landlord allows pets",
                value: codeLabel(application.landlordPetsAllowed, LANDLORD_LABEL) ?? "Not provided",
              },
            ]
          : []),
        { label: "Fenced / secure space", value: codeLabel(application.fencedYard, FENCED_LABEL) ?? "Not provided" },
        {
          label: "People in household",
          value: application.householdSize != null ? String(application.householdSize) : "Not provided",
        },
        { label: "Children's ages", value: application.childrenAges || "None mentioned" },
        { label: "Pet allergies", value: codeLabel(application.petAllergies, YES_NO_LABEL) ?? "Not provided" },
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
        { label: "Hours alone per day", value: application.aloneHours ?? "Not provided" },
        { label: "Primary caregiver", value: application.primaryCaregiver ?? "Not provided" },
        { label: "Daily routine", value: application.dailyRoutine ?? "Not provided" },
        { label: "Vet cost plan", value: application.vetCostPlan ?? "Not provided" },
        { label: "Travel care plan", value: application.travelCarePlan ?? "Not provided" },
      ],
    },
    {
      title: "5. Motivation",
      rows: [
        { label: "Why adopt", value: application.adoptionMotivation ?? "Not provided" },
        { label: "Adoption for", value: codeLabel(application.adoptionFor, ADOPTION_FOR_LABEL) ?? "Not provided" },
        {
          label: "Household agrees",
          value: codeLabel(application.householdAgreement, YES_NO_LABEL) ?? "Not provided",
        },
      ],
    },
    {
      title: "6. Acknowledgements",
      rows: [
        { label: "Home visit consent", value: application.consentHomeVisit ? "Given" : "Not given" },
        { label: "Return to SPCA Fiji", value: application.agreeReturnToSpca ? "Agreed" : "Not agreed" },
        { label: "Information accurate", value: application.confirmAccurate ? "Confirmed" : "Not confirmed" },
      ],
    },
  ];
  return sections;
}

// Extra-review flag for gift adoptions, shown as a badge in the staff queue.
export function isGiftAdoption(application: AdoptionApplication): boolean {
  return application.adoptionFor === "gift";
}
