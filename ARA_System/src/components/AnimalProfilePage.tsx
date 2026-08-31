import { useState } from "react";
import spcaLogo from "../assets/spca-logo.png";
import { adoptionStatusLabel, vaccinationStatusLabel, type Animal } from "../types/animal";
import { useFavoriteAnimals } from "../utils/favorites";

type AnimalProfilePageProps = {
  animal: Animal;
  onBack: () => void;
};

// Public, no-login-required full profile for one animal (AGENTS.md: viewing
// profiles must work with no account). Given the whole animal object rather
// than fetching by id - the public listing endpoint that got us here already
// returns every field, so there's no need for a second network round trip
// or a new backend route.
export function AnimalProfilePage({ animal, onBack }: AnimalProfilePageProps) {
  const { isFavorite, toggle } = useFavoriteAnimals();
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  const favorited = isFavorite(animal.id);
  const activePhoto = animal.photoUrls[activePhotoIndex] ?? animal.photoUrls[0];

  return (
    <div className="home-page">
      <header className="site-header">
        <button type="button" className="brand-group brand-button" onClick={onBack}>
          <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
        </button>
        <button type="button" className="ghost-button" onClick={onBack}>
          ← Back to listings
        </button>
      </header>

      <main className="page-shell profile-page">
        <section className="profile-hero">
          <div
            className="profile-hero-image"
            aria-label={`${animal.name} photo`}
            style={activePhoto ? { backgroundImage: `url(${activePhoto})` } : undefined}
          >
            {!activePhoto && <span className="animal-image-label">{animal.type}</span>}
            <button
              type="button"
              className={favorited ? "favorite-button active" : "favorite-button"}
              aria-label={favorited ? `Remove ${animal.name} from saved` : `Save ${animal.name}`}
              onClick={() => toggle(animal.id)}
            >
              {favorited ? "♥" : "♡"}
            </button>
          </div>

          {animal.photoUrls.length > 1 && (
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

        <section className="profile-summary">
          {/* Name + breed only, mirroring the listing card's two-line header
              (pet-card-name / pet-card-breed) - species moved into the facts
              grid below so it's not stated twice. */}
          <h1 className="profile-name">{animal.name}</h1>
          <p className="profile-breed">{animal.breed ?? "Breed not recorded"}</p>

          <dl className="profile-facts">
            <div>
              <dt>Species</dt>
              <dd>{animal.type}</dd>
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
          </dl>

          {/* Same checkmark-line language as the listing cards, instead of a
              separate status badge repeating what the facts/name already say. */}
          <p className="pet-card-check profile-check">
            ✓ {adoptionStatusLabel(animal.status)}
          </p>
          {animal.vaccinationStatus === "vaccinated" && (
            <p className="pet-card-check profile-check">✓ {vaccinationStatusLabel(animal.vaccinationStatus)}</p>
          )}

          {animal.behaviour && (
            <div className="animal-tags profile-tags">
              <span>{animal.behaviour}</span>
            </div>
          )}

          {animal.description && (
            <div className="profile-about">
              <h2>About {animal.name}</h2>
              <p>{animal.description}</p>
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
        </section>
      </main>
    </div>
  );
}
