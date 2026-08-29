import { SignInButton, UserButton, useAuth, useUser } from "@clerk/react";
import { useEffect, useMemo, useState } from "react";
import spcaLogo from "../../assets/spca-logo.png";
import { fetchStaffAnimals } from "../../services/animalsApi";
import { adoptionStatusLabel, vaccinationStatusLabel, type Animal } from "../../types/animal";
import { isDevBypassEnabled } from "../../utils/devBypass";

type ManageAnimalProfilesProps = {
  onNavigate: (view: "home" | "staff-dashboard" | "register-animal") => void;
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
          <p className="eyebrow">ARA operations</p>
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
            <h1>Manage animal profiles</h1>
          </div>
        </div>
        <div className="dashboard-header-actions">
          <button type="button" className="teal-button" onClick={() => onNavigate("register-animal")}>
            Register animal
          </button>
          <button type="button" className="ghost-button" onClick={() => onNavigate("staff-dashboard")}>
            Back to dashboard
          </button>
          <UserButton />
        </div>
      </header>

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

        {isLoading && <p className="dashboard-data-state">Loading animal profiles...</p>}
        {!isLoading && loadError && <p className="dashboard-data-state error">{loadError}</p>}
        {!isLoading && !loadError && filteredAnimals.length === 0 && (
          <p className="dashboard-data-state">No animal profiles match your search.</p>
        )}

        {!isLoading && !loadError && filteredAnimals.length > 0 && (
          <div className="animal-table">
            {filteredAnimals.map((animal) => (
              <button
                type="button"
                key={animal.id}
                className="animal-table-row"
                onClick={() => onSelectAnimal(animal.id)}
              >
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
                <span className="role-pill muted">{vaccinationStatusLabel(animal.vaccinationStatus)}</span>
                <span className="text-button">View / Edit</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
