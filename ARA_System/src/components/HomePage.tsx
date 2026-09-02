import { useEffect, useState } from "react";
import featureHero from "../assets/spca-hero.webp";
import type { Animal } from "../types/animal";
import { useFavoriteAnimals } from "../utils/favorites";
import { capitalize } from "../utils/format";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

type HomePageProps = {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  currentPage: string;
  onNavigate: (
    view:
      | "home"
      | "animal-listings"
      | "about"
      | "login"
      | "register"
      | "dashboard"
      | "staff-dashboard"
      | "user-dashboard",
  ) => void;
  onViewAnimal: (animal: Animal) => void;
};

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

export function HomePage({ isLoaded, isSignedIn, currentPage, onNavigate, onViewAnimal }: HomePageProps) {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [animalsLoading, setAnimalsLoading] = useState(true);
  const [animalsError, setAnimalsError] = useState("");
  const { isFavorite, toggle } = useFavoriteAnimals();

  useEffect(() => {
    void fetch(`${apiBaseUrl}/api/animals`)
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Animal listings could not be loaded.");
        return (await response.json()) as Animal[];
      })
      .then(setAnimals)
      .catch((error: unknown) =>
        setAnimalsError(
          error instanceof Error
            ? error.message
            : "Animal listings could not be loaded.",
        ),
      )
      .finally(() => setAnimalsLoading(false));
  }, []);

  const availableDogs = animals.filter(
    (animal) => animal.type === "dog",
  ).length;
  const availableCats = animals.filter(
    (animal) => animal.type === "cat",
  ).length;
  const availableOther = animals.length - availableDogs - availableCats;

  return (
    <div className="home-page">
      <SiteHeader
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage={currentPage}
        onNavigate={onNavigate}
      />

      <main className="page-shell">
        <section className="hero-section">
          <div className="hero-copy">
            <p className="eyebrow">Fiji Islands • Est. 1964</p>
            <h1>
              Every animal deserves a <span>home</span>.
            </h1>
            <p className="lead-copy">
              We rescue, care for, and rehome animals across Fiji with a simple,
              compassionate system that brings together medical care, adoption,
              and community support.
            </p>
            <div className="hero-actions">
              <button
                type="button"
                className="teal-button"
                onClick={() => onNavigate("animal-listings")}
              >
                Meet the animals
              </button>
              <button type="button" className="ghost-button">
                Donate & support
              </button>
            </div>
            <div className="search-card">
              <label htmlFor="homepage-search">
                Search by personality or type
              </label>
              <div className="search-row">
                <input
                  id="homepage-search"
                  type="text"
                  placeholder="Small, calm dog good with children"
                />
                <button type="button" className="teal-button small-button">
                  Search
                </button>
              </div>
            </div>
          </div>
          <aside className="hero-panel" aria-label="Featured animal">
            <div className="pet-visual" aria-hidden="true">
              <img
                src={featureHero}
                alt="Featured animal"
                className="hero-visual-image"
              />
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
          </aside>
        </section>

        <section className="stats-strip" aria-label="Available animal counts">
          {[
            [String(animals.length), "Available animals"],
            [String(availableDogs), "Dogs available"],
            [String(availableCats), "Cats available"],
            [String(availableOther), "Other pets available"],
          ].map(([value, label]) => (
            <div key={label} className="stat-item">
              <strong>{animalsLoading ? "..." : value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </section>
        <section className="animals-section" id="adopt">
          <div className="section-head">
            <div>
              <p className="eyebrow">Adopt a friend</p>
              <h2>Animals looking for homes</h2>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => onNavigate("animal-listings")}
            >
              Browse all animals
            </button>
          </div>
          <div className="animals-summary">
            {animalsLoading
              ? "Loading available animals..."
              : `${animals.length} animals currently available for adoption`}
          </div>
          <div className="filter-row" aria-label="Animal categories">
            <button type="button" className="chip active">
              All
            </button>
            <button type="button" className="chip">
              Dogs
            </button>
            <button type="button" className="chip">
              Cats
            </button>
            <button type="button" className="chip">
              Small pets
            </button>
          </div>
          <div className="animal-grid">
            {animalsError && (
              <p className="dashboard-data-state error">{animalsError}</p>
            )}
            {!animalsLoading && !animalsError && animals.length === 0 && (
              <p className="dashboard-data-state">
                No animals are currently listed for adoption.
              </p>
            )}
            {animals.map((animal) => (
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

        <section className="process-section" id="stories">
          <div className="section-head center">
            <div>
              <p className="eyebrow">How it works</p>
              <h2>Simple care, clear adoption steps</h2>
            </div>
          </div>
          <div className="process-grid">
            {[
              [
                "01",
                "Browse animals",
                "Explore profiles for calm, friendly companions ready for adoption.",
              ],
              [
                "02",
                "Apply to adopt",
                "Share your home details and family preferences through a simple form.",
              ],
              [
                "03",
                "Bring them home",
                "Meet your new companion and complete the final approval process.",
              ],
            ].map(([number, title, text]) => (
              <div key={number} className="process-card">
                <span className="step-number">{number}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="cta-strip" id="rescue">
          <div>
            <p className="eyebrow">Need help?</p>
            <h2>Report a rescue and give an animal a second chance.</h2>
          </div>
          <div className="cta-actions">
            <button type="button" className="teal-button">
              Submit rescue report
            </button>
            <button type="button" className="ghost-button light">
              Donate
            </button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
