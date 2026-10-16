import { SignInButton, useAuth, useUser } from "@clerk/react";
import { useState, type FormEvent } from "react";
import spcaLogo from "../../assets/spca-logo.png";
import { SiteHeader, type SiteHeaderView } from "../../components/SiteHeader";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { createAnimal } from "../../services/animalsApi";
import type { AnimalFormInput } from "../../types/animal";
import { isDevBypassEnabled } from "../../utils/devBypass";
import { setFlashToast } from "../../utils/flashToast";
import { AnimalProfileFields } from "./AnimalProfileFields";
import { useBreedOptions } from "./useBreedOptions";
import { toAnimalPayload, validateAnimalForm } from "./validateAnimalForm";

type AnimalRegistrationFormProps = {
  onNavigate: (view: SiteHeaderView | "staff-dashboard" | "manage-animals") => void;
};

// Nothing pre-selected: Species, Veterinary priority and Vaccination status
// start on their "Select ..." placeholders, so staff make each choice
// deliberately (validateAnimalForm blocks saving until they do).
const emptyForm: AnimalFormInput = {
  name: "",
  type: "",
  speciesName: "",
  breed: "",
  ageValue: "",
  ageUnit: "",
  gender: "",
  colour: "",
  description: "",
  behaviour: "",
  rescueHistory: "",
  photoUrls: [],
  vaccinationStatus: "",
  size: "",
  veterinaryPriority: "",
};

// How long the "registered" toast stays on the Manage page - long enough to
// read and note the new Animal ID.
const REGISTERED_TOAST_MS = 8000;

// Staff-only page: registers a brand-new animal profile. The unique Animal
// ID is not entered here - the server generates it, and it's shown back to
// staff in the success toast on Manage animal profiles.
export function AnimalRegistrationForm({ onNavigate }: AnimalRegistrationFormProps) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const role = user?.publicMetadata.role;
  const hasStaffAccess =
    isDevBypassEnabled || role === "staff" || role === "veterinarian" || role === "manager" || role === "admin";

  const [form, setForm] = useState<AnimalFormInput>(emptyForm);
  const breedOptions = useBreedOptions(form.type, form.speciesName);
  // Turned on by a blocked submit so every field's problem shows at once.
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Validates the form, shows an alert and blocks submission if anything
  // required is missing/invalid, then sends the profile to the server.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateAnimalForm(form, breedOptions.options);
    if (validationError) {
      setShowAllErrors(true);
      window.alert(validationError);
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your Clerk session has expired. Please sign in again.");

      const animal = await createAnimal(token, toAnimalPayload(form));
      // Straight to Manage animal profiles, which shows this toast once it
      // mounts (utils/flashToast.ts) - the new Animal ID is in the toast
      // since this page is gone after the redirect.
      setFlashToast(
        `✓ ${animal.name} registered successfully! Animal ID: ${animal.publicId}`,
        REGISTERED_TOAST_MS,
      );
      onNavigate("manage-animals");
    } catch (error) {
      // Failure: stay on the form with everything kept, and show the error.
      const message = error instanceof Error ? error.message : "The animal profile could not be created.";
      window.alert(message);
      setErrorMessage(message);
      setIsSubmitting(false);
    }
  }

  if (!isLoaded || !isSignedIn) {
    return (
      <main className="dashboard-locked">
        <div className="dashboard-locked-card">
          <div className="auth-brand">
            <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
            <strong>SPCA Fiji</strong>
          </div>
          <p className="eyebrow">SPCA operations</p>
          <h1>Sign in to continue</h1>
          <p>Animal registration is available to authorised team members.</p>
          <SignInButton mode="modal">
            <button type="button" className="teal-button">
              Log in
            </button>
          </SignInButton>
        </div>
      </main>
    );
  }

  if (!hasStaffAccess) {
    return (
      <main className="dashboard-locked">
        <div className="dashboard-locked-card">
          <div className="auth-brand">
            <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
            <strong>SPCA Fiji</strong>
          </div>
          <p className="eyebrow">SPCA operations</p>
          <h1>Access restricted</h1>
          <p>Your account does not have staff, veterinary, manager, or admin permissions.</p>
          <button type="button" className="teal-button" onClick={() => onNavigate("home")}>
            Return home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <SiteHeader
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage="register-animal"
        onNavigate={onNavigate}
      />

      <Breadcrumbs
        trail={[
          { label: "Staff Dashboard", onClick: () => onNavigate("staff-dashboard") },
          { label: "Register animal" },
        ]}
      />

      <section className="dashboard-panel">
        {errorMessage && <p className="invite-feedback error">{errorMessage}</p>}

        <form className="animal-form" onSubmit={handleSubmit}>
          <AnimalProfileFields
            value={form}
            onChange={setForm}
            getToken={getToken}
            breedOptions={breedOptions}
            showAllErrors={showAllErrors}
          />
          <button type="submit" className="teal-button submit-button" disabled={isSubmitting}>
            {isSubmitting ? "Registering..." : "Register animal"}
          </button>
        </form>
      </section>
    </main>
  );
}
