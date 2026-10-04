import { useState, type ChangeEvent } from "react";
import { uploadAnimalPhoto } from "../../services/animalsApi";
import { PRIORITY_OPTIONS, sizeOptionLabel, type AnimalFormInput, type AnimalSize } from "../../types/animal";

const SIZE_OPTIONS: AnimalSize[] = ["small", "medium", "large", "extra_large"];

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

  // Uploads the chosen file to Cloudinary (via the backend) and, once it
  // succeeds, appends the returned photo URL to the form's photo list.
  async function handlePhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

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
        Veterinary priority
        <select
          value={value.veterinaryPriority}
          onChange={(event) => setField("veterinaryPriority", event.target.value as AnimalFormInput["veterinaryPriority"])}
          required
        >
          <option value="">Select priority</option>
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} - {option.description}
            </option>
          ))}
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
        Size
        <select
          value={value.size}
          onChange={(event) => setField("size", event.target.value as AnimalFormInput["size"])}
        >
          <option value="">Select size</option>
          {SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {sizeOptionLabel(size)}
            </option>
          ))}
        </select>
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
        <span className="animal-photo-label">Photos</span>
        <div className="animal-photo-list">
          {value.photoUrls.map((url) => (
            <div className="animal-photo-thumb" key={url}>
              <img src={url} alt="Animal" />
              <button type="button" onClick={() => removePhoto(url)} aria-label="Remove photo">
                &times;
              </button>
            </div>
          ))}
        </div>
        <input type="file" accept="image/*" onChange={handlePhotoSelected} disabled={isUploadingPhoto} />
        {isUploadingPhoto && <p className="dashboard-data-state">Uploading photo...</p>}
        {uploadError && <p className="invite-feedback error">{uploadError}</p>}
      </div>
    </div>
  );
}
