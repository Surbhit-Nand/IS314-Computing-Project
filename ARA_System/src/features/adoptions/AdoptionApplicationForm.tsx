import { SignInButton, useAuth, useUser } from "@clerk/react";
import { useState, type FormEvent } from "react";
import { submitAdoptionApplication } from "../../services/adoptionsApi";
import type { Animal } from "../../types/animal";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader, type SiteHeaderView } from "../../components/SiteHeader";
import { SkeletonLoader } from "../../components/SkeletonLoader";

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
  contactNumber: string;
  applicantEmail: string;
  residentialAddress: string;
  dateOfBirth: string;
  housingType: "" | "house" | "apartment" | "other";
  tenure: "" | "own" | "rent";
  landlordPetsAllowed: "" | "yes" | "no" | "not_sure";
  fencedYard: "" | "yes" | "no" | "na";
  householdSize: string;
  childrenAges: string;
  petAllergies: "" | "yes" | "no";
  ownedPetsBefore: "" | "yes" | "no";
  previousPetOutcome: string;
  hasCurrentPets: "" | "yes" | "no";
  currentPetsDetails: string;
  aloneHours: string;
  primaryCaregiver: string;
  dailyRoutine: string;
  vetCostPlan: string;
  travelCarePlan: string;
  adoptionMotivation: string;
  adoptionFor: "" | "self" | "gift";
  householdAgreement: "" | "yes" | "no";
  consentHomeVisit: boolean;
  agreeReturnToSpca: boolean;
  confirmAccurate: boolean;
};

const emptyForm: FormState = {
  fullName: "",
  contactNumber: "",
  applicantEmail: "",
  residentialAddress: "",
  dateOfBirth: "",
  housingType: "",
  tenure: "",
  landlordPetsAllowed: "",
  fencedYard: "",
  householdSize: "",
  childrenAges: "",
  petAllergies: "",
  ownedPetsBefore: "",
  previousPetOutcome: "",
  hasCurrentPets: "",
  currentPetsDetails: "",
  aloneHours: "",
  primaryCaregiver: "",
  dailyRoutine: "",
  vetCostPlan: "",
  travelCarePlan: "",
  adoptionMotivation: "",
  adoptionFor: "",
  householdAgreement: "",
  consentHomeVisit: false,
  agreeReturnToSpca: false,
  confirmAccurate: false,
};

// Public, signed-in apply-to-adopt questionnaire for one animal: six sections
// (applicant, household, experience, care plan, motivation, acknowledgements)
// with conditional follow-ups. Reuses the shared animal-form CSS so the form
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
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your sign-in session has expired. Please sign in again.");
      if (!animal) throw new Error("This animal is not available for adoption right now.");
      const householdSize = Number.parseInt(form.householdSize, 10);
      if (!Number.isInteger(householdSize) || householdSize < 1) {
        throw new Error("Enter the number of people in your household.");
      }
      if (
        !form.housingType ||
        !form.tenure ||
        !form.fencedYard ||
        !form.petAllergies ||
        !form.ownedPetsBefore ||
        !form.hasCurrentPets ||
        !form.adoptionFor ||
        !form.householdAgreement
      ) {
        throw new Error("Answer every required question before submitting.");
      }
      await submitAdoptionApplication(
        {
          animalId: animal.id,
          fullName: form.fullName.trim(),
          contactNumber: form.contactNumber.trim(),
          applicantEmail: form.applicantEmail.trim(),
          residentialAddress: form.residentialAddress.trim(),
          dateOfBirth: form.dateOfBirth.trim(),
          housingType: form.housingType,
          tenure: form.tenure,
          landlordPetsAllowed: form.landlordPetsAllowed || undefined,
          fencedYard: form.fencedYard,
          householdSize,
          childrenAges: form.childrenAges.trim() || undefined,
          petAllergies: form.petAllergies,
          ownedPetsBefore: form.ownedPetsBefore,
          previousPetOutcome: form.previousPetOutcome.trim() || undefined,
          hasCurrentPets: form.hasCurrentPets,
          currentPetsDetails: form.currentPetsDetails.trim() || undefined,
          aloneHours: form.aloneHours.trim(),
          primaryCaregiver: form.primaryCaregiver.trim(),
          dailyRoutine: form.dailyRoutine.trim(),
          vetCostPlan: form.vetCostPlan.trim(),
          travelCarePlan: form.travelCarePlan.trim(),
          adoptionMotivation: form.adoptionMotivation.trim(),
          adoptionFor: form.adoptionFor,
          householdAgreement: form.householdAgreement,
          consentHomeVisit: true,
          agreeReturnToSpca: true,
          confirmAccurate: true,
        },
        token,
      );
      setSubmittedAnimal(animal.name);
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
    <div className="home-page">
      <SiteHeader
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage="adoption-apply"
        onNavigate={onNavigate}
      />

      <main className="page-shell">
        <Breadcrumbs
          trail={[
            { label: "Home", onClick: () => onNavigate("home") },
            { label: "Animals", onClick: () => onNavigate("animal-listings") },
            {
              label: animal?.name ?? "this animal",
              onClick: animal ? () => onNavigate("animal-profile") : undefined,
            },
            { label: "Apply to adopt" },
          ]}
        />
        <section className="catalog-hero">
          <p className="eyebrow">Adoption application</p>
          <h1>Apply to adopt {animal?.name ?? "this animal"}</h1>
          <p className="lead-copy">
            Tell us about yourself, your home, and your care plan so our team
            can match you with {animal?.name ?? "this animal"}. A staff member
            will review every application before an animal is approved.
          </p>
        </section>

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
          <section className="rescue-form-panel">
            <div className="rescue-success">
              <p className="eyebrow">Application received</p>
              <h2>Thank you for applying to adopt {submittedAnimal}.</h2>
              <p>
                Our team will review your application against {submittedAnimal}&apos;s
                needs and get back to you. Follow the link below to watch your
                application move through each stage.
              </p>
              <button
                type="button"
                className="teal-button"
                onClick={onShowMyApplications}
              >
                Track my applications
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

            {errorMessage && <p className="invite-feedback error">{errorMessage}</p>}
            <p className="security-note">
              Signed in as {user?.primaryEmailAddress?.emailAddress ?? "your account"}. Your
              application is saved against your account so you can track it.
            </p>

            <form className="animal-form rescue-form" onSubmit={(event) => void handleSubmit(event)}>
              <div className="animal-form-grid">
                <h3 className="animal-form-full form-section-title">1. Applicant information</h3>
                <label>
                  <span className="form-label-text">Full name</span>
                  <input
                    type="text"
                    placeholder="e.g. Mere Koro"
                    value={form.fullName}
                    onChange={(event) => setField("fullName", event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span className="form-label-text">Contact number</span>
                  <input
                    type="tel"
                    placeholder="e.g. 9900000"
                    value={form.contactNumber}
                    onChange={(event) => setField("contactNumber", event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span className="form-label-text">Email address</span>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={form.applicantEmail}
                    onChange={(event) => setField("applicantEmail", event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span className="form-label-text">Date of birth / age</span>
                  <input
                    type="text"
                    placeholder="e.g. 12 Mar 1995 (adopters must be adults)"
                    value={form.dateOfBirth}
                    onChange={(event) => setField("dateOfBirth", event.target.value)}
                    required
                  />
                </label>
                <label className="animal-form-full">
                  <span className="form-label-text">Residential address</span>
                  <input
                    type="text"
                    placeholder="Street, town / village"
                    value={form.residentialAddress}
                    onChange={(event) => setField("residentialAddress", event.target.value)}
                    required
                  />
                </label>

                <h3 className="animal-form-full form-section-title">2. Household &amp; living situation</h3>
                <label>
                  <span className="form-label-text">Housing type</span>
                  <select
                    value={form.housingType}
                    onChange={(event) => setField("housingType", event.target.value as FormState["housingType"])}
                    required
                  >
                    <option value="">Choose...</option>
                    <option value="house">House</option>
                    <option value="apartment">Apartment</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <fieldset className="radio-group">
                  <legend className="form-label-text">Do you own or rent?</legend>
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="tenure"
                      value="own"
                      checked={form.tenure === "own"}
                      onChange={() => setField("tenure", "own")}
                      required
                    />
                    Own
                  </label>
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="tenure"
                      value="rent"
                      checked={form.tenure === "rent"}
                      onChange={() => setField("tenure", "rent")}
                    />
                    Rent
                  </label>
                </fieldset>
                {form.tenure === "rent" && (
                  <fieldset className="radio-group">
                    <legend className="form-label-text">Does your landlord / lease allow pets?</legend>
                    <label className="radio-option">
                      <input
                        type="radio"
                        name="landlordPetsAllowed"
                        value="yes"
                        checked={form.landlordPetsAllowed === "yes"}
                        onChange={() => setField("landlordPetsAllowed", "yes")}
                        required={form.tenure === "rent"}
                      />
                      Yes
                    </label>
                    <label className="radio-option">
                      <input
                        type="radio"
                        name="landlordPetsAllowed"
                        value="no"
                        checked={form.landlordPetsAllowed === "no"}
                        onChange={() => setField("landlordPetsAllowed", "no")}
                      />
                      No
                    </label>
                    <label className="radio-option">
                      <input
                        type="radio"
                        name="landlordPetsAllowed"
                        value="not_sure"
                        checked={form.landlordPetsAllowed === "not_sure"}
                        onChange={() => setField("landlordPetsAllowed", "not_sure")}
                      />
                      Not sure
                    </label>
                  </fieldset>
                )}
                <fieldset className="radio-group">
                  <legend className="form-label-text">Fenced yard or secure outdoor space?</legend>
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="fencedYard"
                      value="yes"
                      checked={form.fencedYard === "yes"}
                      onChange={() => setField("fencedYard", "yes")}
                      required
                    />
                    Yes
                  </label>
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="fencedYard"
                      value="no"
                      checked={form.fencedYard === "no"}
                      onChange={() => setField("fencedYard", "no")}
                    />
                    No
                  </label>
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="fencedYard"
                      value="na"
                      checked={form.fencedYard === "na"}
                      onChange={() => setField("fencedYard", "na")}
                    />
                    N/A
                  </label>
                </fieldset>
                <label>
                  <span className="form-label-text">People in household</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    placeholder="e.g. 4"
                    value={form.householdSize}
                    onChange={(event) => setField("householdSize", event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span className="form-label-text">
                    Ages of children <em className="optional-hint">(if any)</em>
                  </span>
                  <input
                    type="text"
                    placeholder="e.g. 6 and 10"
                    value={form.childrenAges}
                    onChange={(event) => setField("childrenAges", event.target.value)}
                  />
                </label>
                <fieldset className="radio-group">
                  <legend className="form-label-text">Pet allergies in the household?</legend>
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="petAllergies"
                      value="yes"
                      checked={form.petAllergies === "yes"}
                      onChange={() => setField("petAllergies", "yes")}
                      required
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

                <h3 className="animal-form-full form-section-title">3. Pet experience</h3>
                <fieldset className="radio-group">
                  <legend className="form-label-text">Have you owned pets before?</legend>
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="ownedPetsBefore"
                      value="yes"
                      checked={form.ownedPetsBefore === "yes"}
                      onChange={() => setField("ownedPetsBefore", "yes")}
                      required
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
                      required={form.ownedPetsBefore === "yes"}
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
                      required
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
                      required={form.hasCurrentPets === "yes"}
                    />
                  </label>
                )}

                <h3 className="animal-form-full form-section-title">4. Lifestyle &amp; care plan</h3>
                <label>
                  <span className="form-label-text">Hours alone per day</span>
                  <input
                    type="text"
                    placeholder="e.g. 4 hours on weekdays"
                    value={form.aloneHours}
                    onChange={(event) => setField("aloneHours", event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span className="form-label-text">Primary caregiver</span>
                  <input
                    type="text"
                    placeholder="Who feeds, walks, and handles vet visits?"
                    value={form.primaryCaregiver}
                    onChange={(event) => setField("primaryCaregiver", event.target.value)}
                    required
                  />
                </label>
                <label className="animal-form-full">
                  <span className="form-label-text">Daily routine for exercise and care</span>
                  <textarea
                    rows={3}
                    placeholder="Morning walk, feeding times, play, night routine..."
                    value={form.dailyRoutine}
                    onChange={(event) => setField("dailyRoutine", event.target.value)}
                    required
                  />
                </label>
                <label className="animal-form-full">
                  <span className="form-label-text">How will you cover veterinary costs and emergencies?</span>
                  <textarea
                    rows={3}
                    placeholder="Savings, pet insurance, family support..."
                    value={form.vetCostPlan}
                    onChange={(event) => setField("vetCostPlan", event.target.value)}
                    required
                  />
                </label>
                <label className="animal-form-full">
                  <span className="form-label-text">Care plan when you travel</span>
                  <textarea
                    rows={3}
                    placeholder="Who looks after the animal when you are away?"
                    value={form.travelCarePlan}
                    onChange={(event) => setField("travelCarePlan", event.target.value)}
                    required
                  />
                </label>

                <h3 className="animal-form-full form-section-title">5. Motivation</h3>
                <label className="animal-form-full">
                  <span className="form-label-text">Why do you want to adopt {animal.name}?</span>
                  <textarea
                    rows={4}
                    placeholder="Tell us what draws you to this animal"
                    value={form.adoptionMotivation}
                    onChange={(event) => setField("adoptionMotivation", event.target.value)}
                    required
                  />
                </label>
                <fieldset className="radio-group">
                  <legend className="form-label-text">Is this adoption for yourself or someone else?</legend>
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="adoptionFor"
                      value="self"
                      checked={form.adoptionFor === "self"}
                      onChange={() => setField("adoptionFor", "self")}
                      required
                    />
                    Myself
                  </label>
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="adoptionFor"
                      value="gift"
                      checked={form.adoptionFor === "gift"}
                      onChange={() => setField("adoptionFor", "gift")}
                    />
                    Gift for someone else
                  </label>
                </fieldset>
                {form.adoptionFor === "gift" && (
                  <p className="animal-form-full security-note">
                    Gift adoptions get an extra review step - our team will
                    confirm the recipient is ready for a pet.
                  </p>
                )}
                <fieldset className="radio-group">
                  <legend className="form-label-text">Do all household members agree?</legend>
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="householdAgreement"
                      value="yes"
                      checked={form.householdAgreement === "yes"}
                      onChange={() => setField("householdAgreement", "yes")}
                      required
                    />
                    Yes
                  </label>
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="householdAgreement"
                      value="no"
                      checked={form.householdAgreement === "no"}
                      onChange={() => setField("householdAgreement", "no")}
                    />
                    No
                  </label>
                </fieldset>

                <h3 className="animal-form-full form-section-title">6. Acknowledgements</h3>
                <label className="animal-form-full checkbox-option">
                  <input
                    type="checkbox"
                    checked={form.consentHomeVisit}
                    onChange={(event) => setField("consentHomeVisit", event.target.checked)}
                    required
                  />
                  I consent to a potential home visit or follow-up check-in.
                </label>
                <label className="animal-form-full checkbox-option">
                  <input
                    type="checkbox"
                    checked={form.agreeReturnToSpca}
                    onChange={(event) => setField("agreeReturnToSpca", event.target.checked)}
                    required
                  />
                  I agree to return the animal to SPCA Fiji rather than
                  rehoming it independently if the adoption doesn&apos;t work out.
                </label>
                <label className="animal-form-full checkbox-option">
                  <input
                    type="checkbox"
                    checked={form.confirmAccurate}
                    onChange={(event) => setField("confirmAccurate", event.target.checked)}
                    required
                  />
                  I confirm the information provided is accurate.
                </label>
              </div>

              <div className="rescue-form-actions">
                <button
                  type="submit"
                  className="teal-button rescue-submit-button"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting application..." : "Submit adoption application"}
                </button>
              </div>
            </form>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
