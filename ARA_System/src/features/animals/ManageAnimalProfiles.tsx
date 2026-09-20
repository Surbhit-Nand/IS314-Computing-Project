import { SignInButton, useAuth, useUser } from "@clerk/react";
import { useEffect, useMemo, useState } from "react";
import spcaLogo from "../../assets/spca-logo.png";
import { SiteHeader, type SiteHeaderView } from "../../components/SiteHeader";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { SuccessToast } from "../../components/SuccessToast";
import { deleteAnimal, fetchStaffAnimals } from "../../services/animalsApi";
import { adoptionStatusLabel, vaccinationStatusLabel, type Animal } from "../../types/animal";
import { isDevBypassEnabled } from "../../utils/devBypass";

type ManageAnimalProfilesProps = {
  onNavigate: (view: SiteHeaderView | "staff-dashboard" | "register-animal") => void;
  onSelectAnimal: (animalId: string) => void;
};

// Staff-only page: lists every animal profile with a search box, and links
// each row into the Edit Animal Profile page.
export function ManageAnimalProfiles({ onNavigate, onSelectAnimal }: ManageAnimalProfilesProps) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const role = user?.publicMetadata.role;
  const hasStaffAccess =
    isDevBypassEnabled || role === "staff" || role === "veterinarian" || role === "manager" || role === "admin";

  const [animals, setAnimals] = useState<Animal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  // Which animal is currently being deleted (disables just that row's
  // button and shows "Deleting..." rather than blocking the whole page).
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [successToastMessage, setSuccessToastMessage] = useState("");

  // Loads every animal profile once the staff member's access is confirmed.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !hasStaffAccess) return;

    void (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Your Clerk session has expired.");
        setAnimals(await fetchStaffAnimals(token));
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Animal profiles could not be loaded.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [getToken, hasStaffAccess, isLoaded, isSignedIn]);

  // Confirms with staff first (native browser confirm - no unsaved-form
  // state to lose here, so a simple confirm is enough), soft-deletes on the
  // server, then removes the animal from the local list so it disappears
  // from the page immediately without a full reload.
  async function handleDelete(animal: Animal) {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${animal.name}'s profile? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleteError("");
    setDeletingId(animal.id);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your Clerk session has expired. Please sign in again.");
      await deleteAnimal(token, animal.id);
      setAnimals((previous) => previous.filter((existing) => existing.id !== animal.id));
      setSuccessToastMessage(`✓ ${animal.name}'s profile deleted.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The animal profile could not be deleted.";
      window.alert(message);
      setDeleteError(message);
    } finally {
      setDeletingId(null);
    }
  }

  // Filters the already-loaded list client-side across the fields staff are
  // most likely to search by - no extra network round trip needed.
  const filteredAnimals = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return animals;
    return animals.filter((animal) =>
      [animal.publicId, animal.name, animal.breed ?? "", animal.type]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [animals, searchTerm]);

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
          <p>Managing animal profiles is available to authorised team members.</p>
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
        currentPage="manage-animals"
        onNavigate={onNavigate}
      />

      <Breadcrumbs
        trail={[
          { label: "Staff Dashboard", onClick: () => onNavigate("staff-dashboard") },
          { label: "Manage animals" },
        ]}
      />

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">All animals</p>
            <h2>{filteredAnimals.length} profile{filteredAnimals.length === 1 ? "" : "s"}</h2>
          </div>
          <input
            type="search"
            className="animal-search-input"
            placeholder="Search by ID, name, breed, or species"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        {deleteError && <p className="invite-feedback error">{deleteError}</p>}

        {isLoading && <SkeletonLoader variant="card" />}
        {!isLoading && loadError && <p className="dashboard-data-state error">{loadError}</p>}
        {!isLoading && !loadError && filteredAnimals.length === 0 && (
          <p className="dashboard-data-state">No animal profiles match your search.</p>
        )}

        {!isLoading && !loadError && filteredAnimals.length > 0 && (
          <div className="animal-table">
            {filteredAnimals.map((animal) => (
              // A plain, non-interactive row - clicking the photo/name/ID/
              // badges does nothing. Editing is only reachable through the
              // explicit "Edit" button below, not the row itself.
              <div key={animal.id} className="animal-table-row">
                <span className="animal-table-photo">
                  {animal.photoUrls[0] ? (
                    <img src={animal.photoUrls[0]} alt={animal.name} />
                  ) : (
                    <span className="animal-table-photo-placeholder">No photo</span>
                  )}
                </span>
                <span className="animal-table-details">
                  <strong>{animal.name}</strong>
                  <span>
                    {animal.publicId} - {animal.type} - {animal.breed ?? "Unknown breed"}
                  </span>
                </span>
                <span className="role-pill muted">{adoptionStatusLabel(animal.status)}</span>
                {/* Teal (accent) when vaccinated vs. muted/grey when not -
                    both states always render, just visually distinct, so
                    "not yet vaccinated" doesn't just disappear from the row. */}
                <span className={animal.vaccinationStatus === "vaccinated" ? "role-pill" : "role-pill muted"}>
                  {vaccinationStatusLabel(animal.vaccinationStatus)}
                </span>
                <div className="animal-table-actions">
                  <button
                    type="button"
                    className="teal-button small-button"
                    onClick={() => onSelectAnimal(animal.id)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="danger-button small-button"
                    onClick={() => handleDelete(animal)}
                    disabled={deletingId === animal.id}
                  >
                    {deletingId === animal.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
