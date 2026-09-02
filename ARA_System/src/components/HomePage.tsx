import { useEffect, useState } from "react";
import type { Animal } from "../types/animal";
import { capitalize } from "../utils/format";
import { useFavoriteAnimals } from "../utils/favorites";
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

// Homepage hero slideshow images (rotating full-bleed backgrounds).
const HERO_SLIDES = [
  "https://images.squarespace-cdn.com/content/v1/66aa641d27420a233354078c/ebc79d4b-d939-4cfc-957f-617327910148/TOM_3732.jpg",
  "https://images.squarespace-cdn.com/content/v1/66aa641d27420a233354078c/53b69e63-47f1-43c8-b985-c4ebc296edc2/SPCA+Fiji+Islands-03532.jpg",
  "https://images.squarespace-cdn.com/content/v1/66aa641d27420a233354078c/0b4e7858-1444-46cc-8a33-75ffe2bddece/SPCA+Fiji+Islands-5836.jpg",
  "https://images.squarespace-cdn.com/content/v1/66aa641d27420a233354078c/260cc2c2-578c-4da8-be5f-0f395225d786/SPCA+Fiji_Tom+Vierus-80929.jpg",
  "https://images.squarespace-cdn.com/content/v1/66aa641d27420a233354078c/ddacfc9d-701c-4827-b913-394995b72b7a/SPCA+Fiji+Islands-826131.jpg",
  "https://images.squarespace-cdn.com/content/v1/66aa641d27420a233354078c/545a02d7-50b1-45d4-82c7-124d132a4338/Puppy+in+Suva-03646.jpg",
  "https://images.squarespace-cdn.com/content/v1/66aa641d27420a233354078c/b55b2c5c-c8fa-4177-971f-373c0eced0d1/SPCA+Fiji+Islands-03654.jpg",
  "https://images.squarespace-cdn.com/content/v1/66aa641d27420a233354078c/fec17ca8-40bb-4601-b965-b8210c03cafe/SPCA+Fiji_Tom+Vierus-820517.jpg",
];

export function HomePage({ isLoaded, isSignedIn, currentPage, onNavigate, onViewAnimal }: HomePageProps) {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [animalsLoading, setAnimalsLoading] = useState(true);
  const [animalsError, setAnimalsError] = useState("");
  const [heroSlide, setHeroSlide] = useState(0);
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

  useEffect(() => {
    const timer = setInterval(
      () => setHeroSlide((current) => (current + 1) % HERO_SLIDES.length),
      5000,
    );
    return () => clearInterval(timer);
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
        <section
          className="hero-section slideshow-hero"
          aria-label="Featured rescue animals"
        >
          <div className="slideshow-window" aria-hidden="true">
            {HERO_SLIDES.map((src, index) => (
              <div
                key={src}
                className={`slideshow-slide${index === heroSlide ? " active" : ""}`}
                style={{ backgroundImage: `url(${src})` }}
              />
            ))}
          </div>
          <div className="slideshow-overlay" aria-hidden="true" />
          <div className="slideshow-copy">
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
              <button type="button" className="teal-button donate-button">
                Donate & support
              </button>
            </div>
          </div>
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
          <p className="eyebrow adopt-eyebrow">Adopt a friend</p>
          <div className="section-head">
            <div className="section-head-copy">
              <h2>Animals looking for homes</h2>
            </div>
            <button
              type="button"
              className="teal-button"
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
