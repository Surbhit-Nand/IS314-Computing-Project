import { SignInButton, useAuth, useUser } from "@clerk/react";
import { useEffect, useState, type FormEvent } from "react";
import spcaLogo from "../../assets/spca-logo.png";
import { SiteHeader, type SiteHeaderView } from "../../components/SiteHeader";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { SuccessToast } from "../../components/SuccessToast";
import { fetchAnimalById, updateAnimal } from "../../services/animalsApi";
import type { Animal, AnimalFormInput } from "../../types/animal";
import { isDevBypassEnabled } from "../../utils/devBypass";
import { AnimalProfileFields } from "./AnimalProfileFields";
import { useBreedOptions } from "./useBreedOptions";
import { validateAnimalForm } from "./validateAnimalForm";

type EditAnimalProfileProps = {
  animalId: string;
  onNavigate: (view: SiteHeaderView | "manage-animals") => void;
};

// Converts the API's Animal record (with nullable fields) into the plain
// string-based shape the form inputs need.
function toFormInput(animal: Animal): AnimalFormInput {
  // Rabbit is no longer a species option - migrations 0015/0016 made existing
  // rabbits other + species "Rabbit". If one is ever still typed "rabbit"
  // (e.g. on a database without those migrations) it opens the same way.
  const isLegacyRabbit = animal.type === "rabbit";
  return {
    name: animal.name,
    type: animal.type === "rabbit" ? "other" : animal.type,
    speciesName: isLegacyRabbit ? "Rabbit" : (animal.speciesName ?? ""),
    breed: animal.breed?.trim() ?? "",
    estimatedAge: animal.estimatedAge ?? "",
    gender: animal.gender ?? "",
    colour: animal.colour ?? "",
    description: animal.description ?? "",
    // rescueDate deliberately excluded - it's not part of this form at all
    // (see AnimalFormInput's comment), so editing can never change it.
    behaviour: animal.behaviour ?? "",
    rescueHistory: animal.rescueHistory ?? "",
    photoUrls: animal.photoUrls,
    vaccinationStatus: animal.vaccinationStatus,
    // Legacy animals registered before this field existed have size: null -
    // fall back to the unselected placeholder so staff can pick one now.
    size: animal.size ?? "",
    // Legacy animals with no priority start unselected, so staff must pick
    // one before saving (VeterinaryPriorityField.tsx).
    veterinaryPriority: animal.veterinaryPriority ?? "",
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

  const [form, setForm] = useState<AnimalFormInput | null>(null);
  const breedOptions = useBreedOptions(form?.type);
  // Turned on by a blocked save so every field's problem shows at once.
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  // Separate from saveMessage/saveError on purpose: this only ever gets set
  // in the success branch below, so it can't collide with or hide the
  // existing error-handling path (alert + inline .invite-feedback.error
  // message), which is untouched.
  const [successToastMessage, setSuccessToastMessage] = useState("");

  // Fetches the animal to edit once staff access is confirmed.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !hasStaffAccess) return;

    void (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Your Clerk session has expired.");
        const animal = await fetchAnimalById(token, animalId);
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

    const validationError = validateAnimalForm(form, breedOptions.options);
    if (validationError) {
      setShowAllErrors(true);
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
      setSuccessToastMessage(`✓ ${form.name} updated successfully!`);
      // Give staff a moment to actually see the toast before the page
      // changes out from under it - navigating immediately would unmount
      // this component (and the toast with it) before it ever painted.
      // isSubmitting deliberately stays true here (not reset in a finally)
      // so "Save changes" stays disabled for this brief window rather than
      // becoming re-clickable right before navigating away.
      window.setTimeout(() => onNavigate("manage-animals"), 1200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The animal profile could not be updated.";
      window.alert(message);
      setSaveError(message);
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
        currentPage="edit-animal"
        onNavigate={onNavigate}
      />

      <Breadcrumbs
        trail={[
          { label: "Staff Dashboard", onClick: () => onNavigate("staff-dashboard") },
          { label: "Manage animals", onClick: () => onNavigate("manage-animals") },
          { label: "Edit profile" },
        ]}
      />

      <section className="dashboard-panel">
        {isLoading && <SkeletonLoader variant="card" />}
        {!isLoading && loadError && <p className="dashboard-data-state error">{loadError}</p>}

        {!isLoading && !loadError && form && (
          <>
            {saveMessage && <p className="invite-feedback success">{saveMessage}</p>}
            {saveError && <p className="invite-feedback error">{saveError}</p>}

            <form className="animal-form" onSubmit={handleSubmit}>
              <AnimalProfileFields
                value={form}
                onChange={setForm}
                getToken={getToken}
                breedOptions={breedOptions}
                showAllErrors={showAllErrors}
              />
              <div className="animal-form-actions">
                {/* No confirmation - the form has no persisted draft to lose
                    (nothing is saved until "Save changes" succeeds), so
                    discarding on navigate-away is exactly what staff expect
                    from "Cancel". */}
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => onNavigate("manage-animals")}
                >
                  Cancel
                </button>
                <button type="submit" className="teal-button submit-button" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
