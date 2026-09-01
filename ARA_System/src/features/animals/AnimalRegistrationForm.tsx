import { SignInButton, UserButton, useAuth, useUser } from "@clerk/react";
import { useState, type FormEvent } from "react";
import spcaLogo from "../../assets/spca-logo.png";
import { createAnimal } from "../../services/animalsApi";
import type { AnimalFormInput } from "../../types/animal";
import { isDevBypassEnabled } from "../../utils/devBypass";
import { AnimalProfileFields } from "./AnimalProfileFields";
import { validateAnimalForm } from "./validateAnimalForm";

type AnimalRegistrationFormProps = {
  onNavigate: (view: "home" | "staff-dashboard") => void;
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
          <p className="eyebrow">ARA operations</p>
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
          <p className="eyebrow">ARA operations</p>
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
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <button type="button" className="brand-button" onClick={() => onNavigate("home")}>
            <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
          </button>
          <div>
            <p className="eyebrow">ARA operations</p>
            <h1>Register a new animal</h1>
          </div>
        </div>
        <div className="dashboard-header-actions">
          <button type="button" className="ghost-button" onClick={() => onNavigate("staff-dashboard")}>
            Back to dashboard
          </button>
          <div className="user-avatar-circle">
            <UserButton />
          </div>
        </div>
      </header>

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
