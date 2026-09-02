import { useState } from "react";
import { adoptionStatusLabel, sizeDisplayLabel, vaccinationStatusLabel, type Animal } from "../types/animal";
import { useFavoriteAnimals } from "../utils/favorites";
import { capitalize } from "../utils/format";
import { SiteHeader, type SiteHeaderView } from "./SiteHeader";

type AnimalProfilePageProps = {
  animal: Animal;
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  currentPage: string;
  onNavigate: (view: SiteHeaderView) => void;
};

// Public, no-login-required full profile for one animal (AGENTS.md: viewing
// profiles must work with no account). Given the whole animal object rather
// than fetching by id - the public listing endpoint that got us here already
// returns every field, so there's no need for a second network round trip
// or a new backend route.
export function AnimalProfilePage({ animal, isLoaded, isSignedIn, currentPage, onNavigate }: AnimalProfilePageProps) {
  const { isFavorite, toggle } = useFavoriteAnimals();
  // Always starts at index 0 - the animal's main/profile picture (see
  // AnimalProfileFields.tsx, where photoUrls[0] is set as the first photo
  // staff upload) - then lets a visitor step through the rest.
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  const favorited = isFavorite(animal.id);
  const activePhoto = animal.photoUrls[activePhotoIndex] ?? animal.photoUrls[0];
  const hasMultiplePhotos = animal.photoUrls.length > 1;

  function showPreviousPhoto() {
    setActivePhotoIndex((index) => (index === 0 ? animal.photoUrls.length - 1 : index - 1));
  }

  function showNextPhoto() {
    setActivePhotoIndex((index) => (index === animal.photoUrls.length - 1 ? 0 : index + 1));
  }

  return (
    <div className="home-page">
      <SiteHeader
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage={currentPage}
        onNavigate={onNavigate}
      />

      <main className="page-shell profile-page">
        {/* Hero and the two-column body below both live inside
            .profile-content, so both share the same max-width/centering and
            their left/right edges line up (they didn't before - the hero
            used the full page-shell width while the content below was
            narrower). */}
        <div className="profile-content">
          {/* Name comes before the photo on every profile, regardless of
              how many photos an animal has. */}
          <h1 className="profile-name">{animal.name}</h1>

          <section className="profile-hero">
            <div
              className="profile-hero-image"
              aria-label={`${animal.name} photo`}
              style={activePhoto ? { backgroundImage: `url(${activePhoto})` } : undefined}
            >
              {!activePhoto && <span className="animal-image-label">{capitalize(animal.type)}</span>}
              <button
                type="button"
                className={favorited ? "favorite-button active" : "favorite-button"}
                aria-label={favorited ? `Remove ${animal.name} from saved` : `Save ${animal.name}`}
                onClick={() => toggle(animal.id)}
              >
                {favorited ? "♥" : "♡"}
              </button>

              {hasMultiplePhotos && (
                <>
                  <button
                    type="button"
                    className="profile-photo-nav prev"
                    aria-label="Show previous photo"
                    onClick={showPreviousPhoto}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="profile-photo-nav next"
                    aria-label="Show next photo"
                    onClick={showNextPhoto}
                  >
                    ›
                  </button>
                </>
              )}
            </div>

            {hasMultiplePhotos && (
              <div className="profile-photo-strip">
                {animal.photoUrls.map((url, index) => (
                  <button
                    key={url}
                    type="button"
                    className={index === activePhotoIndex ? "profile-thumb active" : "profile-thumb"}
                    onClick={() => setActivePhotoIndex(index)}
                    aria-label={`View photo ${index + 1} of ${animal.name}`}
                  >
                    <img src={url} alt="" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="profile-columns">
            {/* LEFT: structured details - breed, physical traits, health/
                adoption status, and the adopt action. */}
            <div className="profile-details">
              <dl className="profile-facts">
                <div>
                  <dt>Species</dt>
                  <dd>{capitalize(animal.type)}</dd>
                </div>
                <div>
                  <dt>Breed</dt>
                  <dd>{animal.breed ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Gender</dt>
                  <dd>{animal.gender ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Age</dt>
                  <dd>{animal.estimatedAge ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Colour</dt>
                  <dd>{animal.colour ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{sizeDisplayLabel(animal.size)}</dd>
                </div>
              </dl>

              {/* Same checkmark-line language as the listing cards, instead
                  of a separate status badge repeating what the facts above
                  already say. */}
              <p className="pet-card-check profile-check">
                ✓ {adoptionStatusLabel(animal.status)}
              </p>
              {/* Always shown, not just when vaccinated - "not yet vaccinated"
                  is information adopters need too, not something to hide.
                  Visually distinct (slate/neutral, open-circle marker) from
                  the teal checkmark states so the two are easy to tell apart
                  at a glance, without reading as an alarm/warning. */}
              {animal.vaccinationStatus === "vaccinated" ? (
                <p className="pet-card-check profile-check">
                  ✓ {vaccinationStatusLabel(animal.vaccinationStatus)}
                </p>
              ) : (
                <p className="profile-check-muted profile-check">
                  ○ {vaccinationStatusLabel(animal.vaccinationStatus)}
                </p>
              )}

              {/* No click behaviour yet - a teammate is wiring up the actual
                  adoption application flow. This just needs to exist and
                  look right. */}
              <button type="button" className="teal-button profile-adopt-button">
                Adopt {animal.name}
              </button>
            </div>

            {/* RIGHT: the animal's own story, in prose - About, then
                Temperament (animal.behaviour), then rescue history. Every
                section is driven by the animal's own data, so this works
                the same way for any animal, not just ones with all three
                fields filled in. */}
            <div className="profile-story">
              {animal.description && (
                <div className="profile-about">
                  <h2>About {animal.name}</h2>
                  <p>{animal.description}</p>
                </div>
              )}

              {animal.behaviour && (
                <div className="profile-about">
                  <h2>Temperament</h2>
                  <p>{animal.behaviour}</p>
                </div>
              )}

              {animal.rescueHistory && (
                <div className="profile-about">
                  <h2>Rescue history</h2>
                  <p>{animal.rescueHistory}</p>
                  {animal.rescueDate && (
                    <p className="profile-rescue-date">Rescued on {animal.rescueDate}</p>
                  )}
                </div>
              )}

              {!animal.description && !animal.behaviour && !animal.rescueHistory && (
                <p className="profile-story-empty">No story has been added for {animal.name} yet.</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
