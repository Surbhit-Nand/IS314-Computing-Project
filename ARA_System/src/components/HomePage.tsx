import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/react";
import { useEffect, useState } from "react";
import featureHero from "../assets/spca-hero.webp";
import spcaLogo from "../assets/spca-logo.png";

type HomePageProps = {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  onNavigate: (
    view: "home" | "login" | "register" | "dashboard" | "user-dashboard",
  ) => void;
};

type PublicAnimal = {
  id: string;
  publicId: string;
  name: string;
  type: "dog" | "cat" | "rabbit" | "other";
  breed: string | null;
  estimatedAge: string | null;
  gender: string | null;
  behaviour: string | null;
  photoUrls: string[];
  status: string;
};

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

export function HomePage({ isLoaded, isSignedIn, onNavigate }: HomePageProps) {
  const { user } = useUser();
  const [animals, setAnimals] = useState<PublicAnimal[]>([]);
  const [animalsLoading, setAnimalsLoading] = useState(true);
  const [animalsError, setAnimalsError] = useState("");
  const userRole = user?.publicMetadata.role;
  const isAdmin = userRole === "manager" || userRole === "admin";

  useEffect(() => {
    void fetch(`${apiBaseUrl}/api/animals`)
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Animal listings could not be loaded.");
        return (await response.json()) as PublicAnimal[];
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
      <header className="site-header">
        <button
          type="button"
          className="brand-group brand-button"
          onClick={() => onNavigate("home")}
        >
          <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          <button type="button" onClick={() => onNavigate("home")}>
            Animals
          </button>
          <button type="button">AI Search</button>
          <button type="button">Rescue Report</button>
          <button type="button">Donate</button>
        </nav>
        <div className="header-actions">
          {!isLoaded ? null : isSignedIn ? (
            <>
              <button
                type="button"
                className="ghost-button dashboard-link"
                onClick={() =>
                  onNavigate(isAdmin ? "dashboard" : "user-dashboard")
                }
              >
                {isAdmin ? "Admin dashboard" : "My dashboard"}
              </button>
              <UserButton />
            </>
          ) : (
            <>
              <SignInButton mode="modal">
                <button type="button" className="ghost-button">
                  Login
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button type="button" className="teal-button">
                  Register
                </button>
              </SignUpButton>
            </>
          )}
        </div>
      </header>

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
              <button type="button" className="teal-button">
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
            <button type="button" className="ghost-button">
              Browse all animals
            </button>
          </div>
          <div className="animals-summary">
            {animalsLoading
              ? "Loading available animals..."
              : `${animals.length} medically cleared animals currently available`}
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
                No medically cleared animals are currently listed.
              </p>
            )}
            {animals.map((animal) => (
              <article key={animal.id} className="animal-card">
                <div className="animal-card-top">
                  <span className="badge badge-primary">Medically cleared</span>
                  <button
                    type="button"
                    className="save-button"
                    aria-label={`Save ${animal.name}`}
                  >
                    ♡
                  </button>
                </div>
                <div
                  className="animal-image"
                  aria-label={`${animal.name} profile image`}
                  style={
                    animal.photoUrls[0]
                      ? { backgroundImage: `url(${animal.photoUrls[0]})` }
                      : undefined
                  }
                >
                  <span className="animal-image-label">{animal.type}</span>
                </div>
                <div className="animal-body">
                  <div className="animal-topline">
                    <div>
                      <p className="animal-species">
                        {animal.type} • {animal.breed ?? "Breed not recorded"}
                      </p>
                      <h3>{animal.name}</h3>
                    </div>
                  </div>
                  <p className="animal-meta">
                    {animal.estimatedAge ?? "Age not recorded"} •{" "}
                    {animal.gender ?? "Gender not recorded"}
                  </p>
                  <div className="animal-tags">
                    {animal.behaviour && <span>{animal.behaviour}</span>}
                  </div>
                  <div className="animal-footer">
                    <span className="status-badge">Medically cleared</span>
                    <button type="button" className="text-button">
                      View full profile
                    </button>
                  </div>
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
      <footer className="site-footer" id="donate">
        <div className="footer-brand">
          <img
            src={spcaLogo}
            alt="SPCA Fiji logo"
            className="brand-logo footer-logo"
          />
        </div>
        <div className="footer-links">
          <button type="button" onClick={() => onNavigate("home")}>
            Animals
          </button>
          <button type="button" onClick={() => onNavigate("register")}>
            Rescue
          </button>
          <button type="button" onClick={() => onNavigate("home")}>
            Stories
          </button>
          <button type="button" onClick={() => onNavigate("home")}>
            Donate
          </button>
        </div>
      </footer>
    </div>
  );
}
