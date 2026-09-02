import { useState, type ChangeEvent } from "react";
import { uploadAnimalPhoto } from "../../services/animalsApi";
import type { AnimalFormInput } from "../../types/animal";

type AnimalProfileFieldsProps = {
  value: AnimalFormInput;
  onChange: (next: AnimalFormInput) => void;
  // Clerk session tokens are short-lived, so this fetches a fresh one right
  // before each upload rather than the caller passing a single static token.
  getToken: () => Promise<string | null>;
};

// The full set of animal-profile form fields, shared between the
// Registration form and the Edit form so both pages render identical inputs
// instead of two copies that could drift apart.
export function AnimalProfileFields({ value, onChange, getToken }: AnimalProfileFieldsProps) {
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // Updates a single text/select field on the form without touching the rest.
  function setField<K extends keyof AnimalFormInput>(key: K, fieldValue: AnimalFormInput[K]) {
    onChange({ ...value, [key]: fieldValue });
  }

  const MAX_PHOTOS = 3;
  const canAddMorePhotos = value.photoUrls.length < MAX_PHOTOS;

  // Uploads the chosen file to Cloudinary (via the backend) and, once it
  // succeeds, appends the returned photo URL to the form's photo list.
  // photoUrls[0] becomes the animal's main/profile picture - the one shown
  // on listing cards and as the profile page hero - so the first photo
  // uploaded (or left after removals) is always the one used everywhere.
  async function handlePhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !canAddMorePhotos) return;

    setUploadError("");
    setIsUploadingPhoto(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your Clerk session has expired. Please sign in again.");
      const url = await uploadAnimalPhoto(token, file);
      setField("photoUrls", [...value.photoUrls, url]);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The photo could not be uploaded.");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  function removePhoto(url: string) {
    setField(
      "photoUrls",
      value.photoUrls.filter((existing) => existing !== url),
    );
  }

  return (
    <div className="animal-form-grid">
      <label>
        Name
        <input
          type="text"
          value={value.name}
          onChange={(event) => setField("name", event.target.value)}
          required
        />
      </label>

      <label>
        Species
        <select value={value.type} onChange={(event) => setField("type", event.target.value as AnimalFormInput["type"])}>
          <option value="dog">Dog</option>
          <option value="cat">Cat</option>
          <option value="rabbit">Rabbit</option>
          <option value="other">Other</option>
        </select>
      </label>

      <label>
        Breed
        <input
          type="text"
          value={value.breed}
          onChange={(event) => setField("breed", event.target.value)}
          required
        />
      </label>

      <label>
        Estimated age
        <input
          type="text"
          placeholder="e.g. 2 years"
          value={value.estimatedAge}
          onChange={(event) => setField("estimatedAge", event.target.value)}
          required
        />
      </label>

      <label>
        Gender
        <select value={value.gender} onChange={(event) => setField("gender", event.target.value)}>
          <option value="">Select gender</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>
      </label>

      <label>
        Colour
        <input
          type="text"
          value={value.colour}
          onChange={(event) => setField("colour", event.target.value)}
          required
        />
      </label>

      <label>
        Vaccination status
        <select
          value={value.vaccinationStatus}
          onChange={(event) =>
            setField("vaccinationStatus", event.target.value as AnimalFormInput["vaccinationStatus"])
          }
        >
          <option value="not_vaccinated">Not yet vaccinated - open</option>
          <option value="vaccinated">Vaccinated</option>
        </select>
      </label>

      <label>
        Rescue date
        <input
          type="date"
          value={value.rescueDate}
          onChange={(event) => setField("rescueDate", event.target.value)}
        />
      </label>

      <label className="animal-form-full">
        Description
        <textarea
          rows={4}
          value={value.description}
          onChange={(event) => setField("description", event.target.value)}
          required
        />
      </label>

      <label className="animal-form-full">
        Behaviour
        <textarea
          rows={3}
          value={value.behaviour}
          onChange={(event) => setField("behaviour", event.target.value)}
        />
      </label>

      <label className="animal-form-full">
        Rescue history
        <textarea
          rows={3}
          value={value.rescueHistory}
          onChange={(event) => setField("rescueHistory", event.target.value)}
        />
      </label>

      <div className="animal-form-full animal-photo-field">
        <span className="animal-photo-label">
          Photos ({value.photoUrls.length} of {MAX_PHOTOS}) - the first photo is used as the
          main profile picture
        </span>
        <div className="animal-photo-list">
          {value.photoUrls.map((url, index) => (
            <div className="animal-photo-thumb" key={url}>
              {index === 0 && <span className="animal-photo-main-badge">Main</span>}
              <img src={url} alt="Animal" />
              <button type="button" onClick={() => removePhoto(url)} aria-label="Remove photo">
                &times;
              </button>
            </div>
          ))}
        </div>
        <input
          type="file"
          accept="image/*"
          onChange={handlePhotoSelected}
          disabled={isUploadingPhoto || !canAddMorePhotos}
        />
        {isUploadingPhoto && <p className="dashboard-data-state">Uploading photo...</p>}
        {!canAddMorePhotos && (
          <p className="dashboard-data-state">
            Maximum of {MAX_PHOTOS} photos reached - remove one to add another.
          </p>
        )}
        {uploadError && <p className="invite-feedback error">{uploadError}</p>}
      </div>
    </div>
  );
}
