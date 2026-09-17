import { SignInButton, UserButton, useAuth, useUser } from "@clerk/react";
import { useState, type FormEvent } from "react";
import spcaLogo from "../../assets/spca-logo.png";
import { DonateModal } from "../donations/DonateModal";
import { submitAdoptionApplication } from "../../services/adoptionsApi";
import type { Animal } from "../../types/animal";
import { Breadcrumbs } from "../../components/Breadcrumbs";

type AdoptionApplicationFormProps = {
  // The animal being applied for (the one whose profile "Adopt" was clicked
  // on) - passed down whole, matching how App.tsx carries viewedAnimal around
  // instead of re-fetching.
  animal: Animal | null;
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  onShowMyApplications: () => void;
  onNavigate: (
    view: "home" | "animal-listings" | "animal-profile" | "my-applications",
  ) => void;
};

// Public, signed-in apply-to-adopt form for one animal. Mirrors the rescue
// report form's structure and reuses the shared animal-form CSS so the
// adoption form needs no new layout styles.
export function AdoptionApplicationForm({
  animal,
  isLoaded,
  isSignedIn,
  onShowMyApplications,
  onNavigate,
}: AdoptionApplicationFormProps) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [donateOpen, setDonateOpen] = useState(false);
  const [homeDetails, setHomeDetails] = useState("");
  const [familyDetails, setFamilyDetails] = useState("");
  const [existingPets, setExistingPets] = useState("");
  const [animalExperience, setAnimalExperience] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [submittedAnimal, setSubmittedAnimal] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your sign-in session has expired. Please sign in again.");
      if (!animal) throw new Error("This animal is not available for adoption right now.");
      await submitAdoptionApplication(
        {
          animalId: animal.id,
          homeDetails: homeDetails.trim(),
          familyDetails: familyDetails.trim(),
          existingPets: existingPets.trim() || undefined,
          animalExperience: animalExperience.trim() || undefined,
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
      <header className="site-header">
        <button
          type="button"
          className="brand-group brand-button"
          onClick={() => onNavigate("home")}
        >
          <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          <button type="button" className="nav-link" onClick={() => onNavigate("animal-listings")}>
            Animals
          </button>
          <button type="button" className="nav-link active" aria-current="page">
            Adopt
          </button>
        </nav>
        <div className="header-actions">
          {!isLoaded ? null : isSignedIn ? (
            <>
              <button type="button" className="teal-button" onClick={onShowMyApplications}>
                My applications
              </button>
              <div className="user-avatar-circle">
                <UserButton />
              </div>
            </>
          ) : (
            <SignInButton mode="modal">
              <button type="button" className="teal-button">
                Sign in to adopt
              </button>
            </SignInButton>
          )}
        </div>
      </header>

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
            Tell us about your home and your family so our team can match you
            with {animal?.name ?? "this animal"}. A staff member will review
            every application before an animal is approved.
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
            <p className="dashboard-data-state">Loading...</p>
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

            <form className="animal-form rescue-form" onSubmit={handleSubmit}>
              <div className="animal-form-grid">
                <label className="animal-form-full">
                  <span className="form-label-text">About your home</span>
                  <textarea
                    rows={4}
                    placeholder="e.g. a fenced yard, a flat with a balcony, house rules on pets..."
                    value={homeDetails}
                    onChange={(event) => setHomeDetails(event.target.value)}
                    required
                  />
                </label>

                <label className="animal-form-full">
                  <span className="form-label-text">About your family</span>
                  <textarea
                    rows={4}
                    placeholder="Who lives in your home - children, other adults, working hours..."
                    value={familyDetails}
                    onChange={(event) => setFamilyDetails(event.target.value)}
                    required
                  />
                </label>

                <label className="animal-form-full">
                  <span className="form-label-text">
                    Existing pets <em className="optional-hint">(optional)</em>
                  </span>
                  <textarea
                    rows={3}
                    placeholder="Do you have other animals at home?"
                    value={existingPets}
                    onChange={(event) => setExistingPets(event.target.value)}
                  />
                </label>

                <label className="animal-form-full">
                  <span className="form-label-text">
                    Experience with animals <em className="optional-hint">(optional)</em>
                  </span>
                  <textarea
                    rows={3}
                    placeholder="Have you cared for a dog/cat before?"
                    value={animalExperience}
                    onChange={(event) => setAnimalExperience(event.target.value)}
                  />
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
      <DonateModal open={donateOpen} onClose={() => setDonateOpen(false)} />
    </div>
  );
}