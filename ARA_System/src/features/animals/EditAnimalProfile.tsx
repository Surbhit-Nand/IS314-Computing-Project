import { SignInButton, UserButton, useAuth, useUser } from "@clerk/react";
import { useEffect, useState, type FormEvent } from "react";
import spcaLogo from "../../assets/spca-logo.png";
import { fetchAnimalById, updateAnimal } from "../../services/animalsApi";
import type { Animal, AnimalFormInput } from "../../types/animal";
import { isDevBypassEnabled } from "../../utils/devBypass";
import { AnimalProfileFields } from "./AnimalProfileFields";
import { validateAnimalForm } from "./validateAnimalForm";

type EditAnimalProfileProps = {
  animalId: string;
  onNavigate: (view: "home" | "manage-animals") => void;
};

// Converts the API's Animal record (with nullable fields) into the plain
// string-based shape the form inputs need.
function toFormInput(animal: Animal): AnimalFormInput {
  return {
    name: animal.name,
    type: animal.type,
    breed: animal.breed ?? "",
    estimatedAge: animal.estimatedAge ?? "",
    gender: animal.gender ?? "",
    colour: animal.colour ?? "",
    description: animal.description ?? "",
    rescueDate: animal.rescueDate ?? "",
    behaviour: animal.behaviour ?? "",
    rescueHistory: animal.rescueHistory ?? "",
    photoUrls: animal.photoUrls,
    vaccinationStatus: animal.vaccinationStatus,
  };
}

// Staff-only page: loads one animal's profile and lets staff update it
// through the same field set used for registration.
export function EditAnimalProfile({ animalId, onNavigate }: EditAnimalProfileProps) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const role = user?.publicMetadata.role;
  const hasStaffAccess =
    isDevBypassEnabled || role === "staff" || role === "veterinarian" || role === "manager" || role === "admin";

  const [publicId, setPublicId] = useState("");
  const [form, setForm] = useState<AnimalFormInput | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  // Fetches the animal to edit once staff access is confirmed.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !hasStaffAccess) return;

    void (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Your Clerk session has expired.");
        const animal = await fetchAnimalById(token, animalId);
        setPublicId(animal.publicId);
        setForm(toFormInput(animal));
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Animal profile could not be loaded.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [animalId, getToken, hasStaffAccess, isLoaded, isSignedIn]);

  // Validates the form, shows an alert and blocks submission if anything
  // required is missing/invalid, then saves the changes.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;

    const validationError = validateAnimalForm(form);
    if (validationError) {
      window.alert(validationError);
      setSaveError(validationError);
      return;
    }

    setSaveError("");
    setSaveMessage("");
    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your Clerk session has expired. Please sign in again.");
      await updateAnimal(token, animalId, form);
      setSaveMessage("Animal profile updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The animal profile could not be updated.";
      window.alert(message);
      setSaveError(message);
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
          <p>Editing animal profiles is available to authorised team members.</p>
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
            <h1>Edit animal profile{publicId ? ` - ${publicId}` : ""}</h1>
          </div>
        </div>
        <div className="dashboard-header-actions">
          <button type="button" className="ghost-button" onClick={() => onNavigate("manage-animals")}>
            Back to manage profiles
          </button>
          <div className="user-avatar-circle">
            <UserButton />
          </div>
        </div>
      </header>

      <section className="dashboard-panel">
        {isLoading && <p className="dashboard-data-state">Loading animal profile...</p>}
        {!isLoading && loadError && <p className="dashboard-data-state error">{loadError}</p>}

        {!isLoading && !loadError && form && (
          <>
            {saveMessage && <p className="invite-feedback success">{saveMessage}</p>}
            {saveError && <p className="invite-feedback error">{saveError}</p>}

            <form className="animal-form" onSubmit={handleSubmit}>
              <AnimalProfileFields value={form} onChange={setForm} getToken={getToken} />
              <button type="submit" className="teal-button submit-button" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save changes"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
