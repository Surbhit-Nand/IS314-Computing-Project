import { useEffect, useMemo, useRef, useState } from "react";
import type { Animal, AnimalSize } from "../types/animal";
import { capitalize } from "../utils/format";
import { useFavoriteAnimals } from "../utils/favorites";
import { searchAnimalsWithAI } from "../services/animalsApi";
import { ANIMAL_TRAITS, buildAnimalTags, extractTraits, type TraitGroup } from "../utils/animalTags";
import { AnimalTagChips } from "./AnimalTagChips";
import { apiBaseUrl } from "../services/apiClient.js";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader, type SiteHeaderView } from "./SiteHeader";

type AnimalListingsProps = {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  currentPage: "home" | "animal-listings" | "about";
  onNavigate: (view: SiteHeaderView) => void;
  onViewAnimal: (animal: Animal) => void;
};

type Filters = {
  type: string;
  gender: string;
  breed: string;
  behaviour: string;
  size: string;
  colour: string;
  vaccination: string;
};

const EMPTY_FILTERS: Filters = {
  type: "all",
  gender: "all",
  breed: "all",
  behaviour: "all",
  size: "all",
  colour: "all",
  vaccination: "all",
};

// Behaviour filter matching, driven by the shared trait lexicon: an animal
// matches the selected option when its trait set includes it. Single source
// of truth with the card tags (see extractTraits) - a tag can never promise
// a filter it does not apply.
function animalTraits(animal: { behaviour: string | null; description: string | null }): string[] {
  return extractTraits(animal.behaviour, animal.description);
}

const TRAIT_GROUPS: TraitGroup[] = ["Temperament", "Sociability", "Energy & lifestyle", "Training & care"];

export function AnimalListings({ isLoaded, isSignedIn, currentPage, onNavigate, onViewAnimal }: AnimalListingsProps) {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [animalsLoading, setAnimalsLoading] = useState(true);
  const [animalsError, setAnimalsError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const { isFavorite, toggle } = useFavoriteAnimals();

  // AI (natural-language) search state. `aiRanking` is null while no AI search
  // is applied, in which case the listing shows every public animal exactly as
  // before; when it holds ids, they are the search's ranked best matches.
  const [aiRanking, setAiRanking] = useState<string[] | null>(null);
  const [aiQuery, setAiQuery] = useState("");
  const [aiSearching, setAiSearching] = useState(false);
  const [aiSearchError, setAiSearchError] = useState("");
  // Guards against a slow earlier request overwriting a newer search's results.
  const searchRun = useRef(0);

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

  // Unique colour list derived from the loaded animals, same idea as breeds.
  const colours = useMemo(() => {
    const set = new Set<string>();
    for (const animal of animals) {
      if (animal.colour && animal.colour.trim()) set.add(animal.colour.trim());
    }
    return ["all", ...[...set].sort()];
  }, [animals]);

  function setFilter<F extends keyof Filters>(key: F, value: Filters[F]) {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }

  // Drops back to the normal listing (every public animal, in the order the API
  // returned them). Used for a cleared query and whenever search can't run.
  function resetAiSearch() {
    searchRun.current += 1;
    setAiRanking(null);
    setAiQuery("");
    setAiSearchError("");
    setAiSearching(false);
  }

  // Runs a natural-language search. The result is only ever the *order* the
  // cards appear in: each match is the full profile already loaded from
  // GET /api/animals, so opening a card behaves exactly as it does in the
  // normal listing.
  async function runAiSearch() {
    const query = searchText.trim();
    // Fewer than two characters can't describe an animal, and the server
    // rejects them: treat it as "no search" rather than an error.
    if (query.length < 2) {
      resetAiSearch();
      return;
    }

    const run = searchRun.current + 1;
    searchRun.current = run;
    setAiSearching(true);
    setAiSearchError("");

    try {
      const hits = await searchAnimalsWithAI(query);
      if (searchRun.current !== run) return; // a newer search has taken over
      // If the server returns no matches, treat this as a completed search
      // with an empty result set (do NOT fall back to all animals).
      setAiRanking(hits.length === 0 ? [] : hits);
      setAiQuery(query);
    } catch (error: unknown) {
      if (searchRun.current !== run) return;
      // AI search is assistive only, so a provider outage falls back to the
      // full listing rather than blocking the page. The sidebar filters keep
      // working throughout.
      setAiRanking(null);
      setAiQuery("");
      setAiSearchError(
        error instanceof Error
          ? error.message
          : "AI search is unavailable right now. You can still browse animals or use the filters.",
      );
    } finally {
      if (searchRun.current === run) setAiSearching(false);
    }
  }

  // The animals the AI search picked, in the order it ranked them.
  // - aiRanking === null: no AI search active -> show full listing
  // - aiRanking.length === 0: AI search completed but returned no matches -> show empty set
  // - aiRanking.length > 0: show only those ranked matches, in order
  const ranked = useMemo(() => {
    if (aiRanking === null) return animals;
    if (aiRanking.length === 0) return [];
    const rank = new Map(aiRanking.map((id, index) => [id, index]));
    return animals
      .filter((animal) => rank.has(animal.id))
      .sort((first, second) => (rank.get(first.id) ?? 0) - (rank.get(second.id) ?? 0));
  }, [animals, aiRanking]);

  // Applies each characteristic filter to the (optionally AI-ranked) animals.
  // Size, colour and vaccination come straight off the profile's structured
  // fields rather than being inferred from free text.
  const visible = useMemo(
    () =>
      ranked.filter((animal) => {
        if (filters.type !== "all") {
          // "Other" groups anything that isn't a dog or cat (rabbits, birds,
          // etc.) so those profiles show under a single species option.
          const isOther = filters.type === "other" && animal.type !== "dog" && animal.type !== "cat";
          if (!isOther && animal.type !== filters.type) return false;
        }
        if (filters.gender !== "all" && (animal.gender ?? "").toLowerCase() !== filters.gender)
          return false;
        if (
          filters.breed !== "all" &&
          (animal.breed ?? "").trim().toLowerCase() !== filters.breed.toLowerCase()
        )
          return false;
        if (filters.behaviour !== "all" && !animalTraits(animal).includes(filters.behaviour))
          return false;
        if (filters.size !== "all" && animal.size !== filters.size) return false;
        if (
          filters.colour !== "all" &&
          (animal.colour ?? "").trim().toLowerCase() !== filters.colour.toLowerCase()
        )
          return false;
        if (filters.vaccination !== "all" && animal.vaccinationStatus !== filters.vaccination)
          return false;

        return true;
      }),
    [ranked, filters],
  );

  const activeFilterCount =
    (filters.type !== "all" ? 1 : 0) +
    (filters.gender !== "all" ? 1 : 0) +
    (filters.breed !== "all" ? 1 : 0) +
    (filters.behaviour !== "all" ? 1 : 0) +
    (filters.size !== "all" ? 1 : 0) +
    (filters.colour !== "all" ? 1 : 0) +
    (filters.vaccination !== "all" ? 1 : 0);

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setSearchText("");
    resetAiSearch();
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
            Every animal below is looking for a loving home. Describe the animal
            you are hoping for in your own words, then narrow the results by
            species, breed, gender, size and behaviour.
          </p>
          {/* A form so Enter works as well as the button, and so the browser's
              own search field semantics stay intact. */}
          <form
            className="search-card catalog-search"
            onSubmit={(event) => {
              event.preventDefault();
              void runAiSearch();
            }}
          >
            <label htmlFor="catalog-search">
              Describe the animal you are looking for
            </label>
            <div className="search-row">
              <input
                id="catalog-search"
                type="search"
                placeholder="Small, calm dog good with children"
                value={searchText}
                onChange={(event) => {
                  const next = event.target.value;
                  setSearchText(next);
                  // Clearing (or shortening) the box clears the search too, so
                  // the listing is never left showing results for a query the
                  // visitor can no longer see.
                  if (next.trim().length < 2) resetAiSearch();
                }}
              />
              <button type="submit" className="teal-button small-button" disabled={aiSearching}>
                {aiSearching ? "Searching…" : "Search"}
              </button>
            </div>
          </form>
        </section>

        <div className="catalog-layout">
          <aside className="catalog-sidebar" aria-label="Filter animals">
            <div className="catalog-sidebar-head">
              <h2>Filters</h2>
              {(activeFilterCount > 0 || aiQuery) && (
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
                ["other", "Other Pets"],
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
              {(
                [
                  ["all", "Any"],
                  ["small", "Small"],
                  ["medium", "Medium"],
                  ["large", "Large"],
                  ["extra_large", "Extra large"],
                ] as [AnimalSize | "all", string][]
              ).map(([value, label]) => (
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
              <h3>Colour</h3>
              <select
                className="animal-search-input filter-select"
                value={filters.colour}
                onChange={(event) => setFilter("colour", event.target.value)}
              >
                <option value="all">Any colour</option>
                {colours
                  .filter((colour) => colour !== "all")
                  .map((colour) => (
                    <option key={colour} value={colour}>
                      {capitalize(colour)}
                    </option>
                  ))}
              </select>
            </div>

            <div className="filter-group">
              <h3>Vaccination</h3>
              {[
                ["all", "Any"],
                ["vaccinated", "Vaccinated"],
                ["not_vaccinated", "Not vaccinated"],
              ].map(([value, label]) => (
                <label key={value} className="filter-option">
                  <input
                    type="radio"
                    name="vaccination"
                    checked={filters.vaccination === value}
                    onChange={() => setFilter("vaccination", value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="filter-group">
              <h3>Behaviour</h3>
              <label className="filter-option">
                <input
                  type="radio"
                  name="behaviour"
                  checked={filters.behaviour === "all"}
                  onChange={() => setFilter("behaviour", "all")}
                />
                <span>Any</span>
              </label>
              {TRAIT_GROUPS.map((group) => (
                <div key={group} className="filter-subgroup">
                  <h4 className="filter-subgroup-title">{group}</h4>
                  {ANIMAL_TRAITS.filter((trait) => trait.group === group).map((trait) => (
                    <label key={trait.key} className="filter-option">
                      <input
                        type="radio"
                        name="behaviour"
                        checked={filters.behaviour === trait.key}
                        onChange={() => setFilter("behaviour", trait.key)}
                      />
                      <span>{trait.label}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </aside>

          <section className="catalog-results" aria-label="Animal listings">
            <div className="catalog-results-head">
              <p className="animals-summary">
                {animalsLoading || aiSearching ? (
                  <span
                    className="skeleton-bar skeleton-width-3"
                    aria-hidden="true"
                  />
                ) : (
                  `${visible.length} of ${animals.length} animals available for adoption`
                )}
              </p>
              {aiQuery && (
                <p className="animals-summary">
                  Best matches for “{aiQuery}”
                </p>
              )}
            </div>

            <div className="animal-grid catalog-grid">
              {animalsError && (
                <p className="dashboard-data-state error">{animalsError}</p>
              )}
              {/* The listing and the filters stay usable after a failed search,
                  so this is a notice rather than a blocking error. */}
              {aiSearchError && (
                <p className="dashboard-data-state">{aiSearchError}</p>
              )}
              {!animalsLoading && !animalsError && !aiSearching && visible.length === 0 && (
                <p className="dashboard-data-state">
                  {aiQuery
                    ? `No animals available match “${aiQuery}”. Try a different description.`
                    : "No animals match your search. Try removing a filter or showing all animals."}
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
                    <AnimalTagChips
                      tags={buildAnimalTags(animal)}
                      onSelectTag={(tag) =>
                        setFilters((previous) => ({ ...previous, [tag.filterKey]: tag.filterValue }))
                      }
                    />
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
