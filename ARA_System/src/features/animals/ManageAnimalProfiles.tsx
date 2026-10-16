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
import { clearFlashToast, peekFlashToast, type FlashToast } from "../../utils/flashToast";
import { speciesLabel } from "../../utils/format";
import {
  ALL_FILTERS,
  SORT_OPTIONS,
  manageView,
  statusOptions,
  type ManageFilters,
  type ManageSort,
} from "./manageAnimalsView";

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
  // Starts with any toast handed over by Register / Edit just before they
  // navigated here (utils/flashToast.ts) - e.g. "✓ Fanny registered
  // successfully! Animal ID: SPCA-2026-1234".
  const [successToast, setSuccessToast] = useState<FlashToast | null>(() => peekFlashToast());
  const [sort, setSort] = useState<ManageSort>("newest");
  const [filters, setFilters] = useState<ManageFilters>(ALL_FILTERS);

  // The handed-over toast is now on screen - clear it so it shows only once.
  useEffect(() => {
    clearFlashToast();
  }, []);

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
      setSuccessToast({ message: `✓ ${animal.name}'s profile deleted.`, durationMs: 5000 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The animal profile could not be deleted.";
      window.alert(message);
      setDeleteError(message);
    } finally {
      setDeletingId(null);
    }
  }

  // Search, then filter, then sort - all client-side on the already-loaded
  // list (it isn't paginated), so no extra network round trips.
  const filteredAnimals = useMemo(
    () => manageView(animals, searchTerm, filters, sort),
    [animals, searchTerm, filters, sort],
  );
  // Status filter options: only statuses that actually exist right now.
  const statuses = useMemo(() => statusOptions(animals), [animals]);
  const filtersActive =
    filters.species !== "all" || filters.status !== "all" || filters.vaccination !== "all";

  function setFilter<K extends keyof ManageFilters>(key: K, next: ManageFilters[K]) {
    setFilters((previous) => ({ ...previous, [key]: next }));
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
      {successToast && (
        <SuccessToast
          message={successToast.message}
          durationMs={successToast.durationMs}
          onDismiss={() => setSuccessToast(null)}
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

        {/* Sort + filters for this page only (not the public listings). They
            apply after the search above; wraps onto more lines on narrow
            screens. */}
        <div className="manage-animals-toolbar">
          <label className="manage-animals-control">
            <span>Sort by</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as ManageSort)}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="manage-animals-control">
            <span>Species</span>
            <select
              value={filters.species}
              onChange={(event) => setFilter("species", event.target.value as ManageFilters["species"])}
            >
              <option value="all">All</option>
              <option value="dog">Dog</option>
              <option value="cat">Cat</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="manage-animals-control">
            <span>Status</span>
            <select value={filters.status} onChange={(event) => setFilter("status", event.target.value)}>
              <option value="all">All</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="manage-animals-control">
            <span>Vaccination</span>
            <select
              value={filters.vaccination}
              onChange={(event) => setFilter("vaccination", event.target.value as ManageFilters["vaccination"])}
            >
              <option value="all">All</option>
              <option value="vaccinated">Vaccinated</option>
              <option value="not_vaccinated">Not yet vaccinated</option>
            </select>
          </label>
          <button
            type="button"
            className="ghost-button small-button"
            onClick={() => setFilters(ALL_FILTERS)}
            disabled={!filtersActive}
          >
            Clear filters
          </button>
          {!isLoading && !loadError && (
            <p className="manage-animals-count" aria-live="polite">
              Showing {filteredAnimals.length} of {animals.length} profile{animals.length === 1 ? "" : "s"}
            </p>
          )}
        </div>

        {deleteError && <p className="invite-feedback error">{deleteError}</p>}

        {isLoading && <SkeletonLoader variant="card" />}
        {!isLoading && loadError && <p className="dashboard-data-state error">{loadError}</p>}
        {!isLoading && !loadError && filteredAnimals.length === 0 && (
          <p className="dashboard-data-state">
            {filtersActive ? "No animals match these filters." : "No animal profiles match your search."}
          </p>
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
                    {animal.publicId} - {speciesLabel(animal)} - {animal.breed ?? "Unknown breed"}
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
