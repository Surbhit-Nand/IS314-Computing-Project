import { useEffect, useState } from "react";
import spcaHero from "../assets/spca-hero.webp";
import rescueJourney from "../assets/Puppy+in+Suva-5855.webp";
import { apiBaseUrl } from "../services/apiClient.js";
import type { Animal } from "../types/animal";
import { useFavoriteAnimals } from "../utils/favorites";
import {
  IconArrowLeft,
  IconArrowRight,
  IconClipboard,
  IconHeart,
  IconPawPrint,
} from "./MedicalIcons";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader, type SiteHeaderView } from "./SiteHeader";
import "./HomePage.css";

type HomePageProps = {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  currentPage: string;
  onNavigate: (view: SiteHeaderView) => void;
  onNavigateToStory: () => void;
  onViewAnimal: (animal: Animal) => void;
};

type QuickActionProps = {
  title: string;
  detail: string;
  icon: React.ReactNode;
  onClick: () => void;
  featured?: boolean;
};

function QuickAction({ title, detail, icon, onClick, featured = false }: QuickActionProps) {
  return (
    <button
      type="button"
      className={`ara2-action${featured ? " ara2-action-featured" : ""}`}
      onClick={onClick}
    >
      <span className="ara2-action-icon" aria-hidden="true">{icon}</span>
      <span className="ara2-action-body">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <IconArrowRight className="ara2-action-arrow" size={21} aria-hidden="true" />
    </button>
  );
}

function PetCard({
  animal,
  isFavorite,
  toggleFavorite,
  onViewAnimal,
}: {
  animal: Animal;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
  onViewAnimal: (animal: Animal) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const photos = animal.photoUrls ?? [];
  const image = photos[activePhotoIndex];
  const saved = isFavorite(animal.id);
  const meta = [animal.breed, animal.estimatedAge].filter(Boolean).join(" · ");

  function changePhoto(direction: -1 | 1) {
    setImageFailed(false);
    setActivePhotoIndex((index) => (index + direction + photos.length) % photos.length);
  }

  return (
    <article className="ara2-pet">
      <div className="ara2-pet-media">
        <button
          type="button"
          className="ara2-pet-photo-button"
          onClick={() => onViewAnimal(animal)}
          aria-label={`View ${animal.name}'s adoption profile`}
        >
          {image && !imageFailed ? (
            <img
              src={image}
              alt={`${animal.name}, a ${animal.type} available for adoption`}
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="ara2-photo-empty" aria-hidden="true"><IconPawPrint size={45} /></span>
          )}
          <span className="ara2-photo-reveal" aria-hidden="true">Meet {animal.name} <IconArrowRight size={17} /></span>
        </button>
        {photos.length > 1 && (
          <>
            <button
              type="button"
              className="ara2-pet-photo-nav prev"
              aria-label={`Show previous photo of ${animal.name}`}
              onClick={() => changePhoto(-1)}
            >
              <IconArrowLeft size={18} />
            </button>
            <button
              type="button"
              className="ara2-pet-photo-nav next"
              aria-label={`Show next photo of ${animal.name}`}
              onClick={() => changePhoto(1)}
            >
              <IconArrowRight size={18} />
            </button>
          </>
        )}
        <button
          type="button"
          className={`ara2-save${saved ? " is-saved" : ""}`}
          aria-label={saved ? `Remove ${animal.name} from saved animals` : `Save ${animal.name}`}
          aria-pressed={saved}
          onClick={() => toggleFavorite(animal.id)}
        >
          <IconHeart size={19} aria-hidden="true" />
        </button>
      </div>
      <div className="ara2-pet-meta">
        <div>
          <button className="ara2-pet-title" type="button" onClick={() => onViewAnimal(animal)}>{animal.name}</button>
          <p>{meta || "Ready to meet someone special"}</p>
        </div>
        <span className="ara2-pet-species">{animal.type}</span>
      </div>
    </article>
  );
}

export function HomePage({
  isLoaded,
  isSignedIn,
  currentPage,
  onNavigate,
  onNavigateToStory,
  onViewAnimal,
}: HomePageProps) {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const { isFavorite, toggle } = useFavoriteAnimals();

  useEffect(() => {
    const controller = new AbortController();
    // The existing public endpoint returns animals eligible for adoption.
    void fetch(`${apiBaseUrl}/api/animals`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("We couldn't load the animals right now.");
        return (await response.json()) as Animal[];
      })
      .then((result) => {
        if (!controller.signal.aborted) {
          setAnimals(result);
          setError("");
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "We couldn't load the animals right now.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [retry]);

  const featuredAnimals = animals.slice(0, 8);
  const calloutPhoto = animals.find((animal) => animal.photoUrls?.[0])?.photoUrls?.[0] ?? spcaHero;

  function retryAnimals() {
    setLoading(true);
    setError("");
    setRetry((count) => count + 1);
  }

  return (
    <div className="ara2-home">
      <SiteHeader
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage={currentPage}
        onNavigate={onNavigate}
      />

      <main id="main-content" className="ara2-main">
        <section className="ara2-hero" aria-labelledby="ara2-hero-heading">
          <div className="ara2-hero-scene">
            <img
              className="ara2-hero-background"
              src={spcaHero}
              alt="A dog at SPCA Fiji, waiting for a loving home"
              fetchPriority="high"
            />
            <div className="ara2-hero-shade" aria-hidden="true" />
            <div className="ara2-hero-content ara2-wrap">
              <div className="ara2-hero-copy">
                <h1 id="ara2-hero-heading">Say hello to <span>your new buddy.</span></h1>
                <p>
                  Every animal deserves a place to belong. Meet the wonderful
                  companions waiting for their forever homes, or help an animal
                  in need of rescue.
                </p>
                <div className="ara2-hero-buttons">
                  <button
                    type="button"
                    className="ara2-button ara2-button-blue"
                    onClick={() => onNavigate("animal-listings")}
                  >
                    Adopt a pet <IconArrowRight size={19} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="ara2-button ara2-button-outlined"
                    onClick={() => onNavigate("rescue-report")}
                  >
                    Report a rescue
                  </button>
                </div>
              </div>
            </div>
            <div className="ara2-hero-fade" aria-hidden="true" />
          </div>
        </section>

        <section className="ara2-shortcuts ara2-wrap" aria-label="Ways to get involved">
          <QuickAction
            featured
            icon={<IconPawPrint size={28} />}
            title="Find your companion"
            detail="Discover animals looking for a home"
            onClick={() => onNavigate("animal-listings")}
          />
          <QuickAction
            icon={<IconHeart size={28} />}
            title="Help an animal in need"
            detail="Send a rescue alert to SPCA Fiji"
            onClick={() => onNavigate("rescue-report")}
          />
          <QuickAction
            icon={<IconClipboard size={28} />}
            title="Follow your rescue"
            detail={isSignedIn ? "Check your submitted rescue alerts" : "Sign in to see your rescue alerts"}
            onClick={() => onNavigate(isSignedIn ? "my-reports" : "login")}
          />
        </section>

        <section className="ara2-gallery" aria-labelledby="ara2-adopt-heading">
          <div className="ara2-wrap">
            <div className="ara2-gallery-head">
              <div className="ara2-gallery-heading">
                <span className="ara2-overline">LOOKING FOR A LITTLE LOVE?</span>
                <h2 id="ara2-adopt-heading">There's someone <span>waiting for you.</span></h2>
                <p>Real faces, new beginnings. Get to know the animals waiting to find their people.</p>
              </div>
              <button type="button" className="ara2-view-all" onClick={() => onNavigate("animal-listings")}>Meet all animals <IconArrowRight size={19} aria-hidden="true" /></button>
            </div>

            {loading ? (
              <div className="ara2-pet-grid" aria-label="Loading adoptable animals" aria-busy="true">
                {Array.from({ length: 8 }, (_, index) => <div className="ara2-pet-skeleton" key={index}><div /><span /><small /></div>)}
              </div>
            ) : error ? (
              <div className="ara2-empty" role="alert"><IconPawPrint size={34} /><h3>We'll be right back</h3><p>{error}</p><button type="button" className="ara2-button ara2-button-blue" onClick={retryAnimals}>Try again <IconArrowRight size={18} /></button></div>
            ) : featuredAnimals.length === 0 ? (
              <div className="ara2-empty" role="status"><IconPawPrint size={34} /><h3>No animals to show just yet</h3><p>New companions may be available soon. Please check again later.</p><button type="button" className="ara2-button ara2-button-blue" onClick={() => onNavigate("animal-listings")}>Browse animals <IconArrowRight size={18} /></button></div>
            ) : (
              <div className={`ara2-pet-grid ara2-count-${featuredAnimals.length}`}>
                {featuredAnimals.map((animal) => (
                  <PetCard
                    key={animal.id}
                    animal={animal}
                    onViewAnimal={onViewAnimal}
                    isFavorite={isFavorite}
                    toggleFavorite={toggle}
                  />
                ))}
              </div>
            )}
            <div className="ara2-gallery-bottom">
              <button className="ara2-view-all" type="button" onClick={() => onNavigate("animal-listings")}>Explore the animals <IconArrowRight size={19} aria-hidden="true" /></button>
            </div>
          </div>
        </section>

        <section className="ara2-story" aria-labelledby="ara2-story-heading">
          <div className="ara2-story-media">
            <img src={rescueJourney} alt="A rescued dog receiving compassionate veterinary care" loading="lazy" />
          </div>
          <div className="ara2-story-wash" aria-hidden="true" />
          <div className="ara2-wrap ara2-story-content">
            <div className="ara2-story-copy">
              <span className="ara2-overline">A SECOND CHANCE STARTS SOMEWHERE</span>
              <h2 id="ara2-story-heading">A little kindness.<br /><em>A whole new life.</em></h2>
              <p>From the first rescue alert to the care that follows, small actions make a real difference. Together, we can help animals find safety, comfort and a place to belong.</p>
              <button className="ara2-story-link" type="button" onClick={onNavigateToStory}>Our story <IconArrowRight size={19} aria-hidden="true" /></button>
            </div>
          </div>
        </section>

        <section className="ara2-journey" aria-labelledby="ara2-journey-heading">
          <div className="ara2-wrap">
            <div className="ara2-journey-heading">
              <span className="ara2-overline">A JOURNEY WORTH TAKING</span>
              <h2 id="ara2-journey-heading">From first hello to <span>forever home.</span></h2>
              <p>Finding the right companion is a little journey of its own. Here's how it begins.</p>
            </div>
            <div className="ara2-journey-grid">
              <div className="ara2-journey-step"><span className="ara2-journey-number">01</span><span className="ara2-journey-line" aria-hidden="true" /><h3>Meet the animals</h3><p>Explore real profiles and find a companion you connect with.</p></div>
              <div className="ara2-journey-step"><span className="ara2-journey-number">02</span><span className="ara2-journey-line" aria-hidden="true" /><h3>Share your interest</h3><p>Submit an application and tell the team a little about yourself.</p></div>
              <div className="ara2-journey-step"><span className="ara2-journey-number">03</span><span className="ara2-journey-line" aria-hidden="true" /><h3>Stay connected</h3><p>Follow your application while SPCA reviews the next steps.</p></div>
            </div>
          </div>
        </section>

        <section className="ara2-final" aria-labelledby="ara2-final-heading">
          <img className="ara2-final-image" src={calloutPhoto} alt="" loading="lazy" />
          <div className="ara2-final-tint" aria-hidden="true" />
          <div className="ara2-wrap ara2-final-inner">
            <div className="ara2-final-copy">
              <span className="ara2-overline">EVERY LIFE MATTERS</span>
              <h2 id="ara2-final-heading">Be the reason<br /><em>they get another chance.</em></h2>
              <p>See an animal in need? Your rescue alert can help start the journey to safety and care.</p>
              <button className="ara2-button ara2-button-white" type="button" onClick={() => onNavigate("rescue-report")}>Report an animal <IconArrowRight size={19} aria-hidden="true" /></button>
            </div>
          </div>
          <div className="ara2-final-fade" aria-hidden="true" />
        </section>
      </main>

      <SiteFooter onNavigate={onNavigate} isSignedIn={isSignedIn} />
    </div>
  );
}
