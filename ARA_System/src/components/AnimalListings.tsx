import { useEffect, useMemo, useState } from "react";
import featureHero from "../assets/spca-hero.webp";
import type { Animal } from "../types/animal";
import { useFavoriteAnimals } from "../utils/favorites";
import { capitalize } from "../utils/format";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

type View =
  | "home"
  | "animal-listings"
  | "about"
  | "login"
  | "register"
  | "dashboard"
  | "staff-dashboard"
  | "user-dashboard";

type AnimalListingsProps = {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  currentPage: string;
  onNavigate: (view: View) => void;
  onViewAnimal: (animal: Animal) => void;
};

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

type Filters = {
  type: string;
  gender: string;
  breed: string;
  behaviour: string;
  size: string;
};

const EMPTY_FILTERS: Filters = {
  type: "all",
  gender: "all",
  breed: "all",
  behaviour: "all",
  size: "all",
};

// Rough size buckets inferred from the free-text estimated age. The system
// stores age as text (e.g. "2 years", "3 months"), so we map that onto three
// coarse size categories rather than pretending to have exact weights.
function sizeBucket(age: string | null): string {
  if (!age) return "";
  const lower = age.toLowerCase();
  if (/\d+\s*(weeks|week|days|day)/.test(lower)) return "baby";
  if (/\d+\s*(months|month)/.test(lower)) return "young";
  if (/\d+\s*(years?)/.test(lower) && !/(week|month)/.test(lower)) return "adult";
  return "";
}

function behaviourKey(behaviour: string | null): string {
  if (!behaviour) return "";
  const lower = behaviour.toLowerCase();
  if (/(good with children|family|kids)/.test(lower)) return "good-with-children";
  if (/(calm|gentle|docile|quiet)/.test(lower)) return "calm";
  if (/(energetic|active|playful|high.?energy)/.test(lower)) return "energetic";
  if (/(house.?trained|housebroken)/.test(lower)) return "house-trained";
  if (/(good with (other )?(dogs|pets|animals)|cat.?friendly|dog.?friendly)/.test(lower)) return "good-with-pets";
  return "";
}

export function AnimalListings({ isLoaded, isSignedIn, currentPage, onNavigate, onViewAnimal }: AnimalListingsProps) {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [animalsLoading, setAnimalsLoading] = useState(true);
  const [animalsError, setAnimalsError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const { isFavorite, toggle } = useFavoriteAnimals();

  useEffect(() => {
    void fetch(`${apiBaseUrl}/api/animals`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Animal listings could not be loaded.");
        return (await response.json()) as Animal[];
      })
      .then(setAnimals)
      .catch((error: unknown) =>
        setAnimalsError(
          error instanceof Error ? error.message : "Animal listings could not be loaded.",
        ),
      )
      .finally(() => setAnimalsLoading(false));
  }, []);

  // Unique breed list derived from the loaded animals, so the dropdown only
  // ever offers breeds that actually have a profile right now.
  const breeds = useMemo(() => {
    const set = new Set<string>();
    for (const animal of animals) {
      if (animal.breed && animal.breed.trim()) set.add(animal.breed.trim());
    }
    return ["all", ...[...set].sort()];
  }, [animals]);

  function setFilter<F extends keyof Filters>(key: F, value: Filters[F]) {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }

  // Applies the free-text description search followed by each characteristic
  // filter. Any search matches on name, breed, colour, behaviour, description,
  // and the coarsened size bucket so a natural-language phrase like "small
  // calm dog" finds the right profiles.
  const visible = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const size = filters.size !== "all" ? sizeBucket(filters.size) : "";

    return animals.filter((animal) => {
      if (query) {
        const haystack = [
          animal.name,
          animal.type,
          animal.breed,
          animal.colour,
          animal.behaviour,
          animal.description,
          animal.gender,
          sizeBucket(animal.estimatedAge),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      if (filters.type !== "all" && animal.type !== filters.type) return false;
      if (filters.gender !== "all" && (animal.gender ?? "").toLowerCase() !== filters.gender) return false;
      if (filters.breed !== "all" && (animal.breed ?? "").trim().toLowerCase() !== filters.breed.toLowerCase())
        return false;
      if (filters.behaviour !== "all" && behaviourKey(animal.behaviour) !== filters.behaviour) return false;
      if (size && sizeBucket(animal.estimatedAge) !== size) return false;

      return true;
    });
  }, [animals, searchText, filters]);

  const activeFilterCount =
    (filters.type !== "all" ? 1 : 0) +
    (filters.gender !== "all" ? 1 : 0) +
    (filters.breed !== "all" ? 1 : 0) +
    (filters.behaviour !== "all" ? 1 : 0) +
    (filters.size !== "all" ? 1 : 0);

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setSearchText("");
  }

  return (
    <div className="home-page">
      <SiteHeader
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage={currentPage}
        onNavigate={onNavigate}
      />

      <main className="page-shell">
        <section className="catalog-hero">
          <p className="eyebrow">Adopt a friend</p>
          <h1>Find your new companion</h1>
          <p className="lead-copy">
            Every animal below is looking for a loving home. Search by
            personality or type, then narrow by species, breed, gender, size
            and behaviour.
          </p>
          <div className="search-card catalog-search">
            <label htmlFor="catalog-search">
              Search by personality or type
            </label>
            <div className="search-row">
              <input
                id="catalog-search"
                type="text"
                placeholder="Small, calm dog good with children"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
              <button type="button" className="teal-button small-button">
                Search
              </button>
            </div>
          </div>
        </section>

        <div className="catalog-layout">
          <aside className="catalog-sidebar" aria-label="Filter animals">
            <div className="catalog-sidebar-head">
              <h2>Filters</h2>
              {(activeFilterCount > 0 || searchText) && (
                <button type="button" className="text-button" onClick={clearFilters}>
                  Clear all
                </button>
              )}
            </div>

            <div className="filter-group">
              <h3>Species</h3>
              {[
                ["all", "All"],
                ["dog", "Dogs"],
                ["cat", "Cats"],
                ["rabbit", "Rabbits"],
                ["other", "Other"],
              ].map(([value, label]) => (
                <label key={value} className="filter-option">
                  <input
                    type="radio"
                    name="type"
                    checked={filters.type === value}
                    onChange={() => setFilter("type", value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="filter-group">
              <h3>Gender</h3>
              {[
                ["all", "Any"],
                ["male", "Male"],
                ["female", "Female"],
              ].map(([value, label]) => (
                <label key={value} className="filter-option">
                  <input
                    type="radio"
                    name="gender"
                    checked={filters.gender === value}
                    onChange={() => setFilter("gender", value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="filter-group">
              <h3>Breed</h3>
              <select
                className="animal-search-input filter-select"
                value={filters.breed}
                onChange={(event) => setFilter("breed", event.target.value)}
              >
                <option value="all">Any breed</option>
                {breeds
                  .filter((breed) => breed !== "all")
                  .map((breed) => (
                    <option key={breed} value={breed}>
                      {breed}
                    </option>
                  ))}
              </select>
            </div>

            <div className="filter-group">
              <h3>Size</h3>
              {[
                ["all", "Any"],
                ["baby", "Baby"],
                ["young", "Young"],
                ["adult", "Adult"],
              ].map(([value, label]) => (
                <label key={value} className="filter-option">
                  <input
                    type="radio"
                    name="size"
                    checked={filters.size === value}
                    onChange={() => setFilter("size", value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="filter-group">
              <h3>Behaviour</h3>
              {[
                ["all", "Any"],
                ["good-with-children", "Good with children"],
                ["calm", "Calm / gentle"],
                ["energetic", "Energetic / playful"],
                ["house-trained", "House-trained"],
                ["good-with-pets", "Good with other pets"],
              ].map(([value, label]) => (
                <label key={value} className="filter-option">
                  <input
                    type="radio"
                    name="behaviour"
                    checked={filters.behaviour === value}
                    onChange={() => setFilter("behaviour", value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </aside>

          <section className="catalog-results" aria-label="Animal listings">
            <div className="catalog-results-head">
              <p className="animals-summary">
                {animalsLoading
                  ? "Loading available animals..."
                  : `${visible.length} of ${animals.length} animals available for adoption`}
              </p>
            </div>

            <div className="catalog-featured">
              <div className="pet-visual" aria-hidden="true">
                <img src={featureHero} alt="Featured animal" className="hero-visual-image" />
                <span className="pet-badge">Ready to adopt</span>
              </div>
              <div className="panel-copy">
                <p className="eyebrow light">Featured companion</p>
                <h2>Milo</h2>
                <p>
                  Gentle cattle dog • 2 years • House-trained • Great with
                  families
                </p>
                <div className="meta-pills">
                  <span>Available</span>
                  <span>Medium</span>
                </div>
              </div>
            </div>

            <div className="animal-grid catalog-grid">
              {animalsError && (
                <p className="dashboard-data-state error">{animalsError}</p>
              )}
              {!animalsLoading && !animalsError && visible.length === 0 && (
                <p className="dashboard-data-state">
                  No animals match your search. Try removing a filter or
                  showing all animals.
                </p>
              )}
              {visible.map((animal) => (
                <article
                  key={animal.id}
                  className="pet-card"
                  role="link"
                  tabIndex={0}
                  onClick={() => onViewAnimal(animal)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onViewAnimal(animal);
                    }
                  }}
                >
                  <div
                    className="pet-card-photo"
                    aria-label={`${animal.name} profile image`}
                    style={
                      animal.photoUrls[0]
                        ? { backgroundImage: `url(${animal.photoUrls[0]})` }
                        : undefined
                    }
                  >
                    {!animal.photoUrls[0] && (
                      <span className="animal-image-label">{capitalize(animal.type)}</span>
                    )}
                    <button
                      type="button"
                      className={isFavorite(animal.id) ? "favorite-button active" : "favorite-button"}
                      aria-label={
                        isFavorite(animal.id)
                          ? `Remove ${animal.name} from saved`
                          : `Save ${animal.name}`
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        toggle(animal.id);
                      }}
                    >
                      {isFavorite(animal.id) ? "♥" : "♡"}
                    </button>
                  </div>
                  <div className="pet-card-body">
                    <h3 className="pet-card-name">{animal.name}</h3>
                    <p className="pet-card-breed">{animal.breed ?? "Breed not recorded"}</p>
                    {animal.behaviour && <p className="pet-card-blurb">{animal.behaviour}</p>}
                    <p className="pet-card-line">
                      <span aria-hidden="true">🐾</span>
                      {animal.gender ?? "Gender unknown"} • {animal.estimatedAge ?? "Age unknown"}
                    </p>
                    <p className="pet-card-check">✓ Available for adoption</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
