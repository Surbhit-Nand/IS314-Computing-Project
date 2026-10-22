import { SignInButton, useAuth, useUser } from "@clerk/react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import "./adoption-application-form.css";
import { submitAdoptionApplication, uploadAdoptionIdDocument } from "../../services/adoptionsApi";
import type { Animal } from "../../types/animal";
import { clearPendingAdoption } from "../../utils/pendingAdoption";
import { DEFAULT_DIAL_CODE, dialCodeByCode, expectedLengthLabel, formatPhone, isValidPhoneNational } from "../../utils/phone";
import { PhoneInput } from "../../components/PhoneInput";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader, type SiteHeaderView } from "../../components/SiteHeader";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import {
  answerLabel,
  yesNoLabel,
  type AnswerSection,
} from "./AdoptionQuestionnaireAnswers";

type AdoptionApplicationFormProps = {
  // The animal being applied for (the one whose profile "Adopt" was clicked
  // on) - passed down whole, matching how App.tsx carries viewedAnimal around
  // instead of re-fetching.
  animal: Animal | null;
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  onShowMyApplications: () => void;
  onNavigate: (view: SiteHeaderView) => void;
};

type FormState = {
  fullName: string;
  contactCode: string;
  contactNumber: string;
  applicantEmail: string;
  ageBracket: "" | "adult" | "minor";
  guardianName: string;
  guardianCode: string;
  guardianContact: string;
  guardianRelationship: "" | "parent" | "guardian" | "other";
  guardianConsent: boolean;
  idDocumentType: "" | "voter_card" | "passport" | "drivers_licence" | "other";
  idDocumentUrl: string;
  petAllergies: "" | "yes" | "no";
  respiratoryIssues: "" | "yes" | "no";
  ownedPetsBefore: "" | "yes" | "no";
  previousPetOutcome: string;
  hasCurrentPets: "" | "yes" | "no";
  currentPetsDetails: string;
  vetCostPlan: string;
  nextOfKinName: string;
  nextOfKinCode: string;
  nextOfKinContact: string;
  adoptionFor: "" | "self" | "gift";
};

const emptyForm: FormState = {
  fullName: "",
  contactCode: DEFAULT_DIAL_CODE,
  contactNumber: "",
  applicantEmail: "",
  ageBracket: "",
  guardianName: "",
  guardianCode: DEFAULT_DIAL_CODE,
  guardianContact: "",
  guardianRelationship: "",
  guardianConsent: false,
  idDocumentType: "",
  idDocumentUrl: "",
  petAllergies: "",
  respiratoryIssues: "",
  ownedPetsBefore: "",
  previousPetOutcome: "",
  hasCurrentPets: "",
  currentPetsDetails: "",
  vetCostPlan: "",
  nextOfKinName: "",
  nextOfKinCode: DEFAULT_DIAL_CODE,
  nextOfKinContact: "",
  adoptionFor: "",
};

// One screen of the wizard. The guardian step only exists for minors, so the
// visible step list is derived from the applicant's age bracket.
type StepId = "applicant" | "guardian" | "identification" | "household" | "experience" | "care" | "review";

const STEP_TITLES: Record<StepId, string> = {
  applicant: "About you",
  guardian: "Parent or guardian",
  identification: "Identification",
  household: "Your home",
  experience: "Pet experience",
  care: "Care plan",
  review: "Review & submit",
};

function visibleSteps(form: FormState): StepId[] {
  const steps: StepId[] = ["applicant"];
  if (form.ageBracket === "minor") steps.push("guardian");
  steps.push("identification", "household", "experience", "care", "review");
  return steps;
}

// Permissive client-side check mirroring the server's message; the server
// remains authoritative (it also rejects disposable/undeliverable domains).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Matches the multer limit on POST /api/adoptions/id-document (8 MB).
const MAX_ID_PHOTO_BYTES = 8 * 1024 * 1024;

// Read-only recap of everything entered so far, shown on the final step so
// "Review & submit" actually reviews something before the applicant commits.
// Labels come from AdoptionQuestionnaireAnswers so the wording matches the
// staff review queue.
function reviewSummary(form: FormState): AnswerSection[] {
  const text = (value: string) => value.trim() || "Not provided";
  const phone = (code: string, national: string) =>
    national.trim() ? formatPhone(code, national) : "Not provided";

  return [
    {
      title: "1. Applicant",
      rows: [
        { label: "Full name", value: text(form.fullName) },
        { label: "Contact number", value: phone(form.contactCode, form.contactNumber) },
        { label: "Email", value: text(form.applicantEmail) },
        { label: "Age", value: answerLabel("ageBracket", form.ageBracket) ?? "Not provided" },
        ...(form.ageBracket === "minor"
          ? [
              { label: "Guardian name", value: text(form.guardianName) },
              { label: "Guardian contact", value: phone(form.guardianCode, form.guardianContact) },
              {
                label: "Guardian relationship",
                value:
                  answerLabel("guardianRelationship", form.guardianRelationship) ?? "Not provided",
              },
              { label: "Guardian consent", value: form.guardianConsent ? "Given" : "Not given" },
            ]
          : []),
        {
          label: "Identification",
          value: answerLabel("idDocumentType", form.idDocumentType) ?? "Not provided",
        },
        { label: "ID photo", value: form.idDocumentUrl ? "Photo uploaded" : "Not uploaded yet" },
      ],
    },
    {
      title: "2. Household",
      rows: [
        { label: "Pet allergies", value: yesNoLabel(form.petAllergies) ?? "Not provided" },
        {
          label: "Asthma / respiratory condition",
          value: yesNoLabel(form.respiratoryIssues) ?? "Not provided",
        },
      ],
    },
    {
      title: "3. Experience",
      rows: [
        { label: "Owned pets before", value: yesNoLabel(form.ownedPetsBefore) ?? "Not provided" },
        ...(form.ownedPetsBefore === "yes"
          ? [{ label: "Previous pet outcome", value: text(form.previousPetOutcome) }]
          : []),
        { label: "Current pets", value: yesNoLabel(form.hasCurrentPets) ?? "Not provided" },
        ...(form.hasCurrentPets === "yes"
          ? [{ label: "Current pet details", value: text(form.currentPetsDetails) }]
          : []),
      ],
    },
    {
      title: "4. Care plan",
      rows: [
        { label: "Vet cost plan", value: text(form.vetCostPlan) },
        { label: "Next of kin", value: text(form.nextOfKinName) },
        { label: "Next of kin contact", value: phone(form.nextOfKinCode, form.nextOfKinContact) },
      ],
    },
  ];
}

// Public, signed-in apply-to-adopt wizard for one animal: one question group
// per screen (no scrolling), Back/Next with per-page checks, and a review
// screen before submitting. Reuses the shared animal-form CSS so the wizard
// needs no new layout styles.
export function AdoptionApplicationForm({
  animal,
  isLoaded,
  isSignedIn,
  onShowMyApplications,
  onNavigate,
}: AdoptionApplicationFormProps) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [stepIndex, setStepIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingId, setIsUploadingId] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [submittedAnimal, setSubmittedAnimal] = useState<string | null>(null);

  // Pre-fill name + email from the Clerk account once it hydrates (guarded by
  // account id, same pattern as MyProfilePage, so typing is never clobbered).
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (user && seededFor !== user.id) {
    setSeededFor(user.id);
    setForm((previous) => ({
      ...previous,
      fullName:
        previous.fullName ||
        [user.firstName, user.lastName].filter(Boolean).join(" "),
      applicantEmail:
        previous.applicantEmail || user.primaryEmailAddress?.emailAddress || "",
    }));
  }

  const steps = visibleSteps(form);
  const step = steps[Math.min(stepIndex, steps.length - 1)] as StepId;
  const progressRef = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    progressRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [step]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  // Returns the first problem on the given page, or null when it is complete.
  // The cat/asthma health gate is checked here (up front, before typing
  // further) and again server-side, which is the layer that enforces it.
  function pageError(page: StepId): string | null {
    switch (page) {
      case "applicant":
        if (!form.fullName.trim()) return "Tell us your full name.";
        if (!isValidPhoneNational(form.contactNumber, form.contactCode)) {
          const band = dialCodeByCode(form.contactCode);
          return `Enter a valid ${band.name} contact number (${expectedLengthLabel(form.contactCode)}).`;
        }
        if (!EMAIL_PATTERN.test(form.applicantEmail.trim())) {
          return "Enter a valid email address.";
        }
        if (!form.ageBracket) return "Tell us whether you are 18 or older.";
        return null;
      case "guardian":
        if (!form.guardianName.trim()) return "Tell us your parent or guardian's full name.";
        if (!isValidPhoneNational(form.guardianContact, form.guardianCode)) {
          const band = dialCodeByCode(form.guardianCode);
          return `Enter a valid ${band.name} guardian number (${expectedLengthLabel(form.guardianCode)}).`;
        }
        if (!form.guardianRelationship) return "Choose their relationship to you.";
        if (!form.guardianConsent) return "Your parent or guardian must consent to this adoption.";
        return null;
      case "identification":
        if (!form.idDocumentType) return "Choose your identification document type.";
        if (!form.idDocumentUrl) return "Upload a photo of your identification document.";
        return null;
      case "household":
        if (!form.petAllergies) return "Tell us whether anyone has pet allergies.";
        if (!form.respiratoryIssues) return "Tell us about asthma or respiratory conditions.";
        if (animal?.type === "cat" && form.respiratoryIssues === "yes") {
          return "Applicants with asthma or a respiratory condition cannot adopt cats, for health and safety. Our team can suggest a dog, rabbit or other pet instead.";
        }
        return null;
      case "experience":
        if (!form.ownedPetsBefore) return "Tell us whether you have owned pets before.";
        if (form.ownedPetsBefore === "yes" && !form.previousPetOutcome.trim()) {
          return "Tell us what happened to your previous pet(s).";
        }
        if (!form.hasCurrentPets) return "Tell us whether you currently have other pets.";
        if (form.hasCurrentPets === "yes" && !form.currentPetsDetails.trim()) {
          return "Tell us about your current pets.";
        }
        return null;
      case "care":
        if (!form.vetCostPlan.trim()) return "Tell us how you will cover veterinary costs.";
        if (!form.nextOfKinName.trim()) {
          return "Tell us who looks after the animal when you are unavailable.";
        }
        if (!isValidPhoneNational(form.nextOfKinContact, form.nextOfKinCode)) {
          const band = dialCodeByCode(form.nextOfKinCode);
          return `Enter a valid ${band.name} next-of-kin number (${expectedLengthLabel(form.nextOfKinCode)}).`;
        }
        return null;
      case "review":
        if (!form.adoptionFor) return "Choose who this adoption is for.";
        return null;
    }
  }

  function goNext() {
    const problem = pageError(step);
    if (problem) {
      setErrorMessage(problem);
      return;
    }
    setErrorMessage("");
    setStepIndex((index) => Math.min(index + 1, steps.length - 1));
  }

  function goBack() {
    setErrorMessage("");
    setStepIndex((index) => Math.max(index - 1, 0));
  }

  async function handleIdPhoto(file: File | undefined) {
    // Uploads immediately on selection so the review page never waits: the
    // hosted URL is what the final submit sends. Content is not judged here -
    // staff decide at review, and the applicant always continues.
    if (!file) return;
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setErrorMessage("Upload a photo of your identification document (JPG or PNG).");
      return;
    }
    if (file.size > MAX_ID_PHOTO_BYTES) {
      setErrorMessage(
        "Your identification photo must be 8 MB or smaller. Please upload a JPG or PNG under 8 MB.",
      );
      return;
    }
    setErrorMessage("");
    setIsUploadingId(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your sign-in session has expired. Please sign in again.");
      const url = await uploadAdoptionIdDocument(file, token);
      setField("idDocumentUrl", url);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The identification photo could not be uploaded.",
      );
    } finally {
      setIsUploadingId(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = pageError("review");
    if (problem) {
      setErrorMessage(problem);
      return;
    }
    setErrorMessage("");
    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your sign-in session has expired. Please sign in again.");
      if (!animal) throw new Error("This animal is not available for adoption right now.");
      if (!form.ageBracket) throw new Error("Tell us whether you are 18 or older.");
      if (!form.idDocumentType || !form.idDocumentUrl) {
        throw new Error("Upload your identification document before submitting.");
      }
      if (!form.petAllergies || !form.respiratoryIssues) {
        throw new Error("Answer every household question before submitting.");
      }
      if (!form.ownedPetsBefore || !form.hasCurrentPets || !form.adoptionFor) {
        throw new Error("Answer every required question before submitting.");
      }
      await submitAdoptionApplication(
        {
          animalId: animal.id,
          fullName: form.fullName.trim(),
          contactNumber: formatPhone(form.contactCode, form.contactNumber),
          applicantEmail: form.applicantEmail.trim(),
          ageBracket: form.ageBracket,
          ...(form.ageBracket === "minor"
            ? {
                guardianName: form.guardianName.trim(),
                guardianContact: formatPhone(form.guardianCode, form.guardianContact),
                guardianRelationship: form.guardianRelationship as "parent" | "guardian" | "other",
                guardianConsent: true as const,
              }
            : {}),
          idDocumentType: form.idDocumentType,
          idDocumentUrl: form.idDocumentUrl,
          petAllergies: form.petAllergies,
          respiratoryIssues: form.respiratoryIssues,
          ownedPetsBefore: form.ownedPetsBefore,
          previousPetOutcome: form.previousPetOutcome.trim() || undefined,
          hasCurrentPets: form.hasCurrentPets,
          currentPetsDetails: form.currentPetsDetails.trim() || undefined,
          vetCostPlan: form.vetCostPlan.trim(),
          nextOfKinName: form.nextOfKinName.trim(),
          nextOfKinContact: formatPhone(form.nextOfKinCode, form.nextOfKinContact),
          adoptionFor: form.adoptionFor,
        },
        token,
      );
      setSubmittedAnimal(animal.name);
      // The stashed Adopt intent has now been fulfilled - it must not
      // resurface on the visitor's next sign-in.
      clearPendingAdoption();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Your adoption application could not be submitted.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="home-page adoption-public-page"
      style={animal?.photoUrls[0] ? ({ "--adoption-backdrop": `url("${animal.photoUrls[0]}")` } as CSSProperties) : undefined}
    >
      <SiteHeader
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage="adoption-apply"
        onNavigate={onNavigate}
      />

      <main className={`page-shell${submittedAnimal ? " adoption-confirmation-page" : ""}`}>
        <Breadcrumbs
          trail={[
            { label: "Home", onClick: () => onNavigate("home") },
            { label: "Animals", onClick: () => onNavigate("animal-listings") },
            {
              label: animal?.name ?? "this animal",
              onClick: animal ? () => onNavigate("animal-profile") : undefined,
            },
            { label: submittedAnimal ? "Application received" : "Apply to adopt" },
          ]}
        />
        {!submittedAnimal && <section className="catalog-hero">
          <p className="eyebrow">Adoption application</p>
          <h1>Apply to adopt {animal?.name ?? "this animal"}</h1>
          <p className="lead-copy">
            Tell us about yourself, your home, and your care plan so our team
            can match you with {animal?.name ?? "this animal"}. A staff member
            will review every application before an animal is approved.
          </p>
        </section>}

        {!animal ? (
          <section className="rescue-form-panel">
            <p className="dashboard-data-state">
              No animal selected. Go back to the listings and open a profile
              you would like to adopt.
            </p>
            <button
              type="button"
              className="teal-button"
              onClick={() => onNavigate("animal-listings")}
            >
              Browse animals
            </button>
          </section>
        ) : !isLoaded ? (
          <section className="rescue-form-panel">
            <SkeletonLoader variant="card" />
          </section>
        ) : !isSignedIn ? (
          <section className="rescue-form-panel">
            <div className="security-note">
              <p>
                You need an SPCA Fiji account to apply for an adoption, so we
                can keep your application linked to you and let you track its
                progress.
              </p>
              <SignInButton mode="modal">
                <button type="button" className="teal-button">
                  Sign in to continue
                </button>
              </SignInButton>
            </div>
          </section>
        ) : submittedAnimal ? (
          <section className="rescue-form-panel adoption-confirmation">
            <div className="rescue-success" role="status" aria-live="polite">
              <span className="adoption-confirmation-check" aria-hidden="true">✓</span>
              <h1>Application received</h1>
              <p>
                Thank you for applying to adopt {submittedAnimal}. Our team will review your application and get back to you.
              </p>
              <button
                type="button"
                className="teal-button"
                onClick={onShowMyApplications}
              >
                View my applications
              </button>
            </div>
          </section>
        ) : (
          <section className="rescue-form-panel">
            <div className="adoption-form-animal">
              {animal.photoUrls[0] && (
                <img src={animal.photoUrls[0]} alt={animal.name} className="adoption-form-photo" />
              )}
              <div>
                <p className="eyebrow">
                  {animal.publicId} · {animal.type}
                </p>
                <h2>{animal.name}</h2>
                {animal.breed && <p className="adoption-form-breed">{animal.breed}</p>}
              </div>
            </div>

            {/* Wizard progress: one dot per visible page. Completed pages are
                clickable so applicants can go back and fix an answer. */}
            <ol ref={progressRef} className="wizard-progress adoption-application-progress" aria-label="Application progress">
              {steps.map((id, index) => (
                <li
                  key={id}
                  className={index === steps.indexOf(step) ? "active" : index < steps.indexOf(step) ? "done" : ""}
                  aria-current={index === steps.indexOf(step) ? "step" : undefined}
                >
                  <button
                    type="button"
                    disabled={index >= steps.indexOf(step)}
                    onClick={() => {
                      setErrorMessage("");
                      setStepIndex(index);
                    }}
                    aria-label={`${STEP_TITLES[id]}${index < steps.indexOf(step) ? " (completed)" : ""}`}
                  >
                    {index + 1}
                  </button>
                  <span>{STEP_TITLES[id]}</span>
                </li>
              ))}
            </ol>

            {errorMessage && !(step === "review" && errorMessage === "Choose who this adoption is for.") && (
              <p className="invite-feedback error" role="alert">
                {errorMessage}
              </p>
            )}

            <form className="animal-form rescue-form" onSubmit={(event) => void handleSubmit(event)}>
              <div className="animal-form-grid">
                {step === "applicant" && (
                  <>
                    <h3 className="animal-form-full form-section-title">About you</h3>
                    <label>
                      <span className="form-label-text">Full name</span>
                      <input
                        type="text"
                        placeholder="e.g. Mere Koro"
                        value={form.fullName}
                        onChange={(event) => setField("fullName", event.target.value)}
                      />
                    </label>
                    <PhoneInput
                      label="Contact number"
                      code={form.contactCode}
                      number={form.contactNumber}
                      onCodeChange={(code) => setField("contactCode", code)}
                      onNumberChange={(value) => setField("contactNumber", value)}
                    />
                    <label>
                      <span className="form-label-text">Email address</span>
                      <input
                        type="email"
                        placeholder="you@example.com"
                        value={form.applicantEmail}
                        onChange={(event) => setField("applicantEmail", event.target.value)}
                      />
                    </label>
                    <fieldset className="radio-group animal-form-full">
                      <legend className="form-label-text">Are you 18 or older?</legend>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="ageBracket"
                          value="adult"
                          checked={form.ageBracket === "adult"}
                          onChange={() => setField("ageBracket", "adult")}
                        />
                        Adult (18+)
                      </label>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="ageBracket"
                          value="minor"
                          checked={form.ageBracket === "minor"}
                          onChange={() => setField("ageBracket", "minor")}
                        />
                        Under 18
                      </label>
                    </fieldset>
                    {form.ageBracket === "minor" && (
                      <p className="animal-form-full security-note">
                        Because you are under 18, the next page asks for your
                        parent or guardian&apos;s details and consent.
                      </p>
                    )}
                  </>
                )}

                {step === "guardian" && (
                  <>
                    <h3 className="animal-form-full form-section-title">Parent or guardian</h3>
                    <p className="animal-form-full security-note">
                      Adoptions for under-18s need a parent or guardian who
                      agrees to take legal responsibility for the animal.
                    </p>
                    <label>
                      <span className="form-label-text">Guardian full name</span>
                      <input
                        type="text"
                        placeholder="e.g. Jone Koro"
                        value={form.guardianName}
                        onChange={(event) => setField("guardianName", event.target.value)}
                      />
                    </label>
                    <PhoneInput
                      label="Guardian contact number"
                      code={form.guardianCode}
                      number={form.guardianContact}
                      onCodeChange={(code) => setField("guardianCode", code)}
                      onNumberChange={(value) => setField("guardianContact", value)}
                    />
                    <label>
                      <span className="form-label-text">Relationship to you</span>
                      <select
                        value={form.guardianRelationship}
                        onChange={(event) =>
                          setField("guardianRelationship", event.target.value as FormState["guardianRelationship"])
                        }
                      >
                        <option value="">Choose...</option>
                        <option value="parent">Parent</option>
                        <option value="guardian">Guardian</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label className="animal-form-full checkbox-option">
                      <input
                        type="checkbox"
                        checked={form.guardianConsent}
                        onChange={(event) => setField("guardianConsent", event.target.checked)}
                      />
                      My parent or guardian agrees to this adoption and will take
                      legal responsibility for the animal.
                    </label>
                  </>
                )}

                {step === "identification" && (
                  <>
                    <h3 className="animal-form-full form-section-title">Identification</h3>
                    <p className="animal-form-full security-note">
                      Upload a photo of your voter ID card, passport,
                      driver&apos;s licence, or another photo ID so our team can
                      verify who is applying. Our staff review every document -
                      uploading never blocks your application.
                    </p>
                    <label>
                      <span className="form-label-text">Document type</span>
                      <select
                        value={form.idDocumentType}
                        onChange={(event) =>
                          setField("idDocumentType", event.target.value as FormState["idDocumentType"])
                        }
                      >
                        <option value="">Choose...</option>
                        <option value="voter_card">Voter ID card</option>
                        <option value="passport">Passport</option>
                        <option value="drivers_licence">Driver&apos;s licence</option>
                        <option value="other">Other photo ID</option>
                      </select>
                    </label>
                    <label>
                      <span className="form-label-text">Document photo</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={(event) => void handleIdPhoto(event.target.files?.[0])}
                        disabled={isUploadingId}
                      />
                    </label>
                    {isUploadingId && (
                      <p className="animal-form-full dashboard-data-state">Uploading photo...</p>
                    )}
                    {form.idDocumentUrl && (
                      <div className="animal-form-full">
                        <img
                          src={form.idDocumentUrl}
                          alt="Uploaded identification document"
                          className="adoption-form-photo"
                        />
                        <p className="security-note">Photo uploaded. You can choose another file to replace it.</p>
                      </div>
                    )}
                  </>
                )}

                {step === "household" && (
                  <>
                    <h3 className="animal-form-full form-section-title">Your home</h3>
                    <fieldset className="radio-group">
                      <legend className="form-label-text">Pet allergies in the household?</legend>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="petAllergies"
                          value="yes"
                          checked={form.petAllergies === "yes"}
                          onChange={() => setField("petAllergies", "yes")}
                        />
                        Yes
                      </label>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="petAllergies"
                          value="no"
                          checked={form.petAllergies === "no"}
                          onChange={() => setField("petAllergies", "no")}
                        />
                        No
                      </label>
                    </fieldset>
                    <fieldset className="radio-group animal-form-full">
                      <legend className="form-label-text">
                        Do you have asthma or a respiratory condition?
                      </legend>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="respiratoryIssues"
                          value="yes"
                          checked={form.respiratoryIssues === "yes"}
                          onChange={() => setField("respiratoryIssues", "yes")}
                        />
                        Yes
                      </label>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="respiratoryIssues"
                          value="no"
                          checked={form.respiratoryIssues === "no"}
                          onChange={() => setField("respiratoryIssues", "no")}
                        />
                        No
                      </label>
                    </fieldset>
                    {animal.type === "cat" && (
                      <p className="animal-form-full security-note">
                        {animal.name} is a cat: applicants with asthma or a
                        respiratory condition cannot adopt cats, for health and
                        safety. Our team can suggest a dog, rabbit or other pet.
                      </p>
                    )}
                  </>
                )}

                {step === "experience" && (
                  <>
                    <h3 className="animal-form-full form-section-title">Pet experience</h3>
                    <fieldset className="radio-group">
                      <legend className="form-label-text">Have you owned pets before?</legend>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="ownedPetsBefore"
                          value="yes"
                          checked={form.ownedPetsBefore === "yes"}
                          onChange={() => setField("ownedPetsBefore", "yes")}
                        />
                        Yes
                      </label>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="ownedPetsBefore"
                          value="no"
                          checked={form.ownedPetsBefore === "no"}
                          onChange={() => setField("ownedPetsBefore", "no")}
                        />
                        No
                      </label>
                    </fieldset>
                    {form.ownedPetsBefore === "yes" && (
                      <label className="animal-form-full">
                        <span className="form-label-text">What happened to your previous pet(s)?</span>
                        <textarea
                          rows={3}
                          placeholder="e.g. lived with us for 12 years until old age"
                          value={form.previousPetOutcome}
                          onChange={(event) => setField("previousPetOutcome", event.target.value)}
                        />
                      </label>
                    )}
                    <fieldset className="radio-group">
                      <legend className="form-label-text">Do you currently have other pets?</legend>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="hasCurrentPets"
                          value="yes"
                          checked={form.hasCurrentPets === "yes"}
                          onChange={() => setField("hasCurrentPets", "yes")}
                        />
                        Yes
                      </label>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="hasCurrentPets"
                          value="no"
                          checked={form.hasCurrentPets === "no"}
                          onChange={() => setField("hasCurrentPets", "no")}
                        />
                        No
                      </label>
                    </fieldset>
                    {form.hasCurrentPets === "yes" && (
                      <label className="animal-form-full">
                        <span className="form-label-text">Species, breed, age, vaccination / spay-neuter status</span>
                        <textarea
                          rows={3}
                          placeholder="e.g. desexed female tabby, 3 years, fully vaccinated"
                          value={form.currentPetsDetails}
                          onChange={(event) => setField("currentPetsDetails", event.target.value)}
                        />
                      </label>
                    )}
                  </>
                )}

                {step === "care" && (
                  <>
                    <h3 className="animal-form-full form-section-title">Care plan</h3>
                    <label className="animal-form-full">
                      <span className="form-label-text">How will you cover veterinary costs and emergencies?</span>
                      <textarea
                        rows={3}
                        placeholder="Savings, pet insurance, family support..."
                        value={form.vetCostPlan}
                        onChange={(event) => setField("vetCostPlan", event.target.value)}
                      />
                    </label>
                    <label>
                      <span className="form-label-text">Next of kin full name</span>
                      <input
                        type="text"
                        placeholder="Who looks after the animal when you are unavailable?"
                        value={form.nextOfKinName}
                        onChange={(event) => setField("nextOfKinName", event.target.value)}
                      />
                    </label>
                    <PhoneInput
                      label="Next of kin contact"
                      code={form.nextOfKinCode}
                      number={form.nextOfKinContact}
                      onCodeChange={(code) => setField("nextOfKinCode", code)}
                      onNumberChange={(value) => setField("nextOfKinContact", value)}
                    />
                  </>
                )}

                {step === "review" && (
                  <>
                    <div className="animal-form-full adoption-review-heading">
                      <p className="eyebrow">One last look</p>
                      <h3>Review your application</h3>
                      <p>Check your details before sending your application to adopt {animal.name}. You can return to any completed step to make changes.</p>
                    </div>
                    <fieldset className="radio-group animal-form-full adoption-recipient" aria-describedby={errorMessage === "Choose who this adoption is for." ? "adoption-recipient-error" : undefined}>
                      <legend className="form-label-text">Is this adoption for yourself or someone else?</legend>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="adoptionFor"
                          value="self"
                          checked={form.adoptionFor === "self"}
                          onChange={() => { setField("adoptionFor", "self"); setErrorMessage(""); }}
                        />
                        <span><strong>For myself</strong><small>I will be responsible for their care.</small></span>
                      </label>
                      <label className="radio-option">
                        <input
                          type="radio"
                          name="adoptionFor"
                          value="gift"
                          checked={form.adoptionFor === "gift"}
                          onChange={() => { setField("adoptionFor", "gift"); setErrorMessage(""); }}
                        />
                        <span><strong>For someone else</strong><small>Our team will confirm the recipient is ready.</small></span>
                      </label>
                      {errorMessage === "Choose who this adoption is for." && (
                        <p id="adoption-recipient-error" className="invite-feedback error" role="alert">{errorMessage}</p>
                      )}
                    </fieldset>
                    {form.adoptionFor === "gift" && (
                      <p className="animal-form-full security-note adoption-recipient-note">
                        Gift adoptions get an extra review step - our team will
                        confirm the recipient is ready for a pet.
                      </p>
                    )}
                    <div className="animal-form-full adoption-review-summary">
                      <div className="adoption-review-summary-heading"><h4>Application details</h4><span>Review before submitting</span></div>
                      <div className="adoption-review-sections">
                        {reviewSummary(form).map((section) => (
                          <section key={section.title} className="adoption-review-section">
                            <h5>{section.title.replace(/^\d+\.\s*/, "")}</h5>
                            <dl>
                              {section.rows.map((row) => (
                                <div key={row.label} className="adoption-review-answer">
                                  <dt>{row.label}</dt><dd>{row.value}</dd>
                                </div>
                              ))}
                            </dl>
                          </section>
                        ))}
                      </div>
                      <p className="security-note">
                        Use the numbered steps above to go back and change any answer.
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div className="rescue-form-actions adoption-application-actions">
                {steps.indexOf(step) > 0 && (
                  <button type="button" className="ghost-button" onClick={goBack} disabled={isSubmitting}>
                    Back
                  </button>
                )}
                {step !== "review" ? (
                  <button type="button" className="teal-button rescue-submit-button" onClick={goNext} disabled={isSubmitting}>
                    Next
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="teal-button rescue-submit-button"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Submitting application..." : "Submit adoption application"}
                  </button>
                )}
              </div>
            </form>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
