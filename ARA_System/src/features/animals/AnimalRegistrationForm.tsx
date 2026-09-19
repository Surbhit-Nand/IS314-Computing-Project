import { SignInButton, useAuth, useUser } from "@clerk/react";
import { useState, type FormEvent } from "react";
import spcaLogo from "../../assets/spca-logo.png";
import { SiteHeader, type SiteHeaderView } from "../../components/SiteHeader";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { SuccessToast } from "../../components/SuccessToast";
import { createAnimal } from "../../services/animalsApi";
import type { AnimalFormInput } from "../../types/animal";
import { isDevBypassEnabled } from "../../utils/devBypass";
import { AnimalProfileFields } from "./AnimalProfileFields";
import { validateAnimalForm } from "./validateAnimalForm";

type AnimalRegistrationFormProps = {
  onNavigate: (view: SiteHeaderView | "staff-dashboard") => void;
};

const emptyForm: AnimalFormInput = {
  name: "",
  type: "dog",
  breed: "",
  estimatedAge: "",
  gender: "",
  colour: "",
  description: "",
  rescueDate: "",
  behaviour: "",
  rescueHistory: "",
  photoUrls: [],
  vaccinationStatus: "not_vaccinated",
  size: "",
};

// Staff-only page: registers a brand-new animal profile. The unique Animal
// ID is not entered here - the server generates it, and it's shown back to
// staff once the profile is created successfully.
export function AnimalRegistrationForm({ onNavigate }: AnimalRegistrationFormProps) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const role = user?.publicMetadata.role;
  const hasStaffAccess =
    isDevBypassEnabled || role === "staff" || role === "veterinarian" || role === "manager" || role === "admin";

  const [form, setForm] = useState<AnimalFormInput>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [createdPublicId, setCreatedPublicId] = useState("");
  // Separate from errorMessage/createdPublicId on purpose: this only ever
  // gets set in the success branch below, so it can't collide with or hide
  // the existing error-handling path (alert + inline .invite-feedback.error
  // message), which is untouched.
  const [successToastMessage, setSuccessToastMessage] = useState("");

  // Validates the form, shows an alert and blocks submission if anything
  // required is missing/invalid, then sends the profile to the server.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateAnimalForm(form);
    if (validationError) {
      window.alert(validationError);
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your Clerk session has expired. Please sign in again.");

      const animal = await createAnimal(token, form);
      setCreatedPublicId(animal.publicId);
      setSuccessToastMessage(`✓ ${animal.name} registered successfully!`);
      setForm(emptyForm);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The animal profile could not be created.";
      window.alert(message);
      setErrorMessage(message);
    } finally {
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
      {successToastMessage && (
        <SuccessToast
          message={successToastMessage}
          onDismiss={() => setSuccessToastMessage("")}
        />
      )}

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
        {createdPublicId && (
          <p className="invite-feedback success">
            Animal profile created. Animal ID: <strong>{createdPublicId}</strong>
          </p>
        )}
        {errorMessage && !createdPublicId && <p className="invite-feedback error">{errorMessage}</p>}

        <form className="animal-form" onSubmit={handleSubmit}>
          <AnimalProfileFields value={form} onChange={setForm} getToken={getToken} />
          <button type="submit" className="teal-button submit-button" disabled={isSubmitting}>
            {isSubmitting ? "Registering..." : "Register animal"}
          </button>
        </form>
      </section>
    </main>
  );
}
