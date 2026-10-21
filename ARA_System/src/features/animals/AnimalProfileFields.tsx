import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { uploadAnimalPhoto } from "../../services/animalsApi";
import { sizeOptionLabel, type AnimalFormInput, type AnimalSize, type FormSpecies } from "../../types/animal";
import { COLOUR_OPTIONS, OTHER_ANIMAL_SUGGESTIONS } from "./animalOptions";
import {
  NARRATIVE_MAX_LENGTH,
  NARRATIVE_MIN_LENGTH,
  detectDogOrCatSpecies,
  formatNameText,
  validateSpeciesName,
  validateTypedBreedName,
} from "./animalFieldRules";
import { BREED_OTHER_OPTION, findListedBreed, orderBreedOptions } from "./breedChoice";
import type { BreedOptions } from "./useBreedOptions";
import { VeterinaryPriorityField } from "./VeterinaryPriorityField";
import { getAnimalFormErrors, type AnimalFormField } from "./validateAnimalForm";

const SIZE_OPTIONS: AnimalSize[] = ["small", "medium", "large", "extra_large"];

type AnimalProfileFieldsProps = {
  value: AnimalFormInput;
  onChange: (next: AnimalFormInput) => void;
  // Clerk session tokens are short-lived, so this fetches a fresh one right
  // before each upload rather than the caller passing a single static token.
  getToken: () => Promise<string | null>;
  // Dog/cat breed list from the breeds table (useBreedOptions), owned by the
  // page so its submit-time validation checks against the same list.
  breedOptions: BreedOptions;
  // Set by the page after a blocked submit, so every problem shows at once -
  // otherwise a field's error only appears once staff have left that field.
  showAllErrors: boolean;
};

// One field label: bold teal text, plus a red asterisk only while the field
// still needs a valid value (empty or invalid per getAnimalFormErrors - the
// same rules that block saving), so a filled-in Edit form shows none.
function FieldLabel({ children, needsValue }: { children: ReactNode; needsValue: boolean }) {
  return (
    <span className="animal-field-label">
      {children}
      {needsValue && (
        <span className="animal-field-required" aria-hidden="true">
          {" "}
          *
        </span>
      )}
    </span>
  );
}

// True when an input's change came from picking a datalist suggestion (a
// replacement, or a plain Event in Firefox) rather than typing characters -
// so a picked suggestion can commit straight away, keystrokes never do.
function isSuggestionPick(event: ChangeEvent<HTMLInputElement>): boolean {
  const inputType = (event.nativeEvent as Partial<InputEvent>).inputType;
  return inputType === undefined || inputType === "insertReplacementText";
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <span id={id} className="animal-field-error">
      {message}
    </span>
  );
}

// The full set of animal-profile form fields, shared between the
// Registration form and the Edit form so both pages render identical inputs
// instead of two copies that could drift apart.
export function AnimalProfileFields({ value, onChange, getToken, breedOptions, showAllErrors }: AnimalProfileFieldsProps) {
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [touched, setTouched] = useState<Partial<Record<AnimalFormField, boolean>>>({});
  const speciesInputRef = useRef<HTMLInputElement>(null);
  // Set by handleSpeciesChange when staff pick Other; consumed once the typed
  // Species box has rendered.
  const focusSpeciesInput = useRef(false);

  useEffect(() => {
    if (focusSpeciesInput.current && value.type === "other") {
      speciesInputRef.current?.focus();
      focusSpeciesInput.current = false;
    }
  }, [value.type]);

  // Breed field mode, for a species with a breed list:
  // - "auto": the dropdown, unless the breed isn't listed (e.g. a saved
  //   "Russian Blue Mix") - then the typed box, pre-filled.
  // - "typed": the typed box, after staff choose "Other" or type in the box.
  //   Sticky, so the box never flips back to the dropdown mid-keystroke; it
  //   only does when commitTypedBreed() finds a listed breed.
  const [breedMode, setBreedMode] = useState<"auto" | "typed">("auto");
  const breedInputRef = useRef<HTMLInputElement>(null);
  const focusBreedInput = useRef(false);
  // The breed the form opened with (Edit), so an invalid saved breed (e.g.
  // Aqua's "cat") shows its error straight away instead of after a blur.
  const [initialBreed] = useState(value.breed);
  // The typed species last committed (blur / Enter / suggestion), so a
  // genuinely different species clears the breed, but leaving the box
  // unchanged doesn't.
  const lastCommittedSpecies = useRef(value.speciesName);

  // The current species' breed list: dogs, cats, or a typed species like
  // Rabbit. Empty for a species with no list (e.g. Snake), undefined while
  // loading.
  const listedBreeds = breedOptions.options;
  const hasBreedList = listedBreeds !== undefined && listedBreeds.length > 0;
  const orderedBreeds = hasBreedList ? orderBreedOptions(listedBreeds) : [];
  const showBreedTextBox =
    (value.type === "other" && !hasBreedList) ||
    (hasBreedList &&
      (breedMode === "typed" || (value.breed.trim() !== "" && !findListedBreed(value.breed, listedBreeds))));

  useEffect(() => {
    if (focusBreedInput.current && showBreedTextBox) {
      breedInputRef.current?.focus();
      focusBreedInput.current = false;
    }
  }, [showBreedTextBox]);

  const errors = getAnimalFormErrors(value, listedBreeds);

  function errorFor(field: AnimalFormField): string | undefined {
    const invalidSavedBreed = field === "breed" && initialBreed.trim() !== "" && value.breed === initialBreed;
    return showAllErrors || touched[field] || invalidSavedBreed ? errors[field] : undefined;
  }

  function markTouched(field: AnimalFormField) {
    setTouched((previous) => (previous[field] ? previous : { ...previous, [field]: true }));
  }

  // Props for a validated input: invalid styling, screen-reader link to its
  // error message, and "touched" tracking on blur.
  function fieldProps(field: AnimalFormField) {
    const error = errorFor(field);
    return {
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? `animal-${field}-error` : undefined,
      onBlur: () => markTouched(field),
    };
  }

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

  // Breed means something different per species (a listed breed for dogs and
  // cats, free text for Other), so switching species clears it along with
  // any typed species name.
  function handleSpeciesChange(nextType: FormSpecies) {
    // Picking Other swaps the dropdown for a text box - move focus into it so
    // staff can type straight away (not on page load, only on the switch).
    focusSpeciesInput.current = nextType === "other";
    lastCommittedSpecies.current = "";
    setBreedMode("auto");
    onChange({ ...value, type: nextType, speciesName: "", breed: "" });
  }

  // Runs when staff leave the typed Species box, press Enter, or pick a
  // suggestion - never on each keystroke. "Dog"/"cat" (any case, plurals)
  // switches back to the Species dropdown with that species selected and its
  // breed list shown; any other valid name is tidied to Title Case, and a
  // different species than before clears the breed.
  function commitSpecies(text: string) {
    markTouched("speciesName");
    const dogOrCat = detectDogOrCatSpecies(text);
    if (dogOrCat) {
      handleSpeciesChange(dogOrCat);
      return;
    }
    if (!text.trim() || validateSpeciesName(text)) {
      setField("speciesName", text);
      return;
    }
    const species = formatNameText(text);
    const changed = species.toLowerCase() !== formatNameText(lastCommittedSpecies.current).toLowerCase();
    lastCommittedSpecies.current = species;
    if (changed) setBreedMode("auto");
    onChange({ ...value, speciesName: species, breed: changed ? "" : value.breed });
  }

  // Breed dropdown (any species with a list): "Other" swaps it for the typed
  // box (focused); anything else is a listed breed.
  function handleBreedSelect(selected: string) {
    if (selected === BREED_OTHER_OPTION) {
      setBreedMode("typed");
      focusBreedInput.current = true;
      setField("breed", "");
      return;
    }
    setBreedMode("auto");
    setField("breed", selected);
  }

  // Runs when staff leave the typed breed box, press Enter, or pick a
  // suggestion - never on each keystroke. Text matching a listed breed
  // (trimmed, case-insensitive) switches back to the dropdown with that breed
  // selected; otherwise a valid typed breed is tidied to Title Case.
  function commitTypedBreed(text: string) {
    markTouched("breed");
    const listed = findListedBreed(text, listedBreeds);
    if (listed) {
      setBreedMode("auto");
      setField("breed", listed);
    } else if (text.trim() && !validateTypedBreedName(text)) {
      setField("breed", formatNameText(text));
    }
  }


  // Description / Behaviour / Rescue history: textarea, live character count
  // and the field's error underneath.
  function narrativeField(field: "description" | "behaviour" | "rescueHistory", label: string, rows: number) {
    const length = value[field].trim().length;
    const outOfRange = length > 0 && (length < NARRATIVE_MIN_LENGTH || length > NARRATIVE_MAX_LENGTH);
    return (
      <label className="animal-form-full">
        <FieldLabel needsValue={Boolean(errors[field])}>{label}</FieldLabel>
        <textarea
          rows={rows}
          value={value[field]}
          maxLength={NARRATIVE_MAX_LENGTH + 200}
          onChange={(event) => setField(field, event.target.value)}
          required
          {...fieldProps(field)}
        />
        <span className={outOfRange ? "animal-field-counter out-of-range" : "animal-field-counter"}>
          {length} / {NARRATIVE_MAX_LENGTH} characters (minimum {NARRATIVE_MIN_LENGTH}, at least 5 words)
        </span>
        <FieldError id={`animal-${field}-error`} message={errorFor(field)} />
      </label>
    );
  }

  return (
    <div className="animal-form-grid animal-profile-fields">
      {Object.keys(errors).length > 0 && (
        <p className="animal-form-required-note animal-form-full">
          All fields are required. A red <span className="animal-field-required">*</span> marks a field that
          still needs a valid value.
        </p>
      )}

      <label>
        <FieldLabel needsValue={Boolean(errors.name)}>Name</FieldLabel>
        <input
          type="text"
          value={value.name}
          onChange={(event) => setField("name", event.target.value)}
          required
          {...fieldProps("name")}
        />
        <FieldError id="animal-name-error" message={errorFor("name")} />
      </label>

      {/* Species: Dog / Cat / Other dropdown. Choosing Other turns this same
          field into a text box for the species itself (Rabbit, Snake...).
          No "back" link: typing Dog or Cat switches back to the dropdown. */}
      {value.type === "other" ? (
        <label>
          <FieldLabel needsValue={Boolean(errors.speciesName)}>Species</FieldLabel>
          <input
            ref={speciesInputRef}
            type="text"
            list="animal-species-suggestions"
            placeholder="Type the animal, e.g. Rabbit (or type Dog / Cat)"
            value={value.speciesName}
            maxLength={60}
            required
            {...fieldProps("speciesName")}
            onChange={(event) => {
              if (isSuggestionPick(event)) {
                commitSpecies(event.target.value);
                return;
              }
              setField("speciesName", event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                // Enter commits the species instead of submitting the form.
                event.preventDefault();
                commitSpecies(value.speciesName);
              }
            }}
            onBlur={() => commitSpecies(value.speciesName)}
          />
          <datalist id="animal-species-suggestions">
            {OTHER_ANIMAL_SUGGESTIONS.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
          <FieldError id="animal-speciesName-error" message={errorFor("speciesName")} />
        </label>
      ) : (
        <label>
          <FieldLabel needsValue={Boolean(errors.type)}>Species</FieldLabel>
          <select
            value={value.type}
            onChange={(event) => handleSpeciesChange(event.target.value as FormSpecies)}
            {...fieldProps("type")}
          >
            {/* Placeholder only (Register): shown while nothing is chosen,
                never one of the choices. */}
            <option value="" disabled hidden>
              Select species
            </option>
            <option value="dog">Dog</option>
            <option value="cat">Cat</option>
            <option value="other">Other (type the animal)</option>
          </select>
          <FieldError id="animal-type-error" message={errorFor("type")} />
        </label>
      )}

      {/* Breed is always shown. When the species has a list in the breeds
          table (dogs, cats, Rabbit, Hamster...) it's a dropdown ending with
          "Other", which turns it into a typed box; a species with no list
          (e.g. Snake) always types its breed. The typed box is one element
          for both cases, so a list arriving mid-typing never steals focus. */}
      {value.type === "" ? (
        // No species chosen yet (Register): Breed waits for it.
        <label>
          <FieldLabel needsValue={false}>Breed</FieldLabel>
          <select value="" disabled>
            <option value="">Select species first</option>
          </select>
        </label>
      ) : showBreedTextBox ? (
        <label>
          <FieldLabel needsValue={Boolean(errors.breed)}>Breed</FieldLabel>
          <input
            ref={breedInputRef}
            type="text"
            list="animal-breed-suggestions"
            placeholder={
              hasBreedList ? "Type the breed (or type a listed breed)" : "Type the breed, or Unknown / Mixed breed"
            }
            value={value.breed}
            maxLength={60}
            required
            {...fieldProps("breed")}
            onChange={(event) => {
              const text = event.target.value;
              setBreedMode("typed");
              if (isSuggestionPick(event) && findListedBreed(text, listedBreeds)) {
                commitTypedBreed(text);
                return;
              }
              setField("breed", text);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                // Enter commits the breed instead of submitting the form.
                event.preventDefault();
                commitTypedBreed(value.breed);
              }
            }}
            onBlur={() => commitTypedBreed(value.breed)}
          />
          <datalist id="animal-breed-suggestions">
            {(hasBreedList ? orderedBreeds : ["Unknown", "Mixed breed"]).map((breed) => (
              <option key={breed} value={breed} />
            ))}
          </datalist>
          <FieldError id="animal-breed-error" message={errorFor("breed")} />
        </label>
      ) : (
        <label>
          <FieldLabel needsValue={Boolean(errors.breed)}>Breed</FieldLabel>
          <select
            value={value.breed}
            onChange={(event) => handleBreedSelect(event.target.value)}
            disabled={breedOptions.isLoading}
            {...fieldProps("breed")}
          >
            <option value="">{breedOptions.isLoading ? "Loading breeds..." : "Select breed"}</option>
            {orderedBreeds.map((breed) => (
              <option key={breed} value={breed}>
                {breed}
              </option>
            ))}
            {/* Form-only: switches to the typed box; never stored. */}
            {hasBreedList && <option value={BREED_OTHER_OPTION}>Other</option>}
          </select>
          {breedOptions.error && <span className="animal-field-error">{breedOptions.error}</span>}
          <FieldError id="animal-breed-error" message={errorFor("breed")} />
        </label>
      )}

      <VeterinaryPriorityField
        value={value.veterinaryPriority}
        onChange={(next) => setField("veterinaryPriority", next)}
        label={<FieldLabel needsValue={Boolean(errors.veterinaryPriority)}>Veterinary priority</FieldLabel>}
        error={<FieldError id="animal-veterinaryPriority-error" message={errorFor("veterinaryPriority")} />}
        inputProps={fieldProps("veterinaryPriority")}
      />

      {/* Estimated age: number + unit, saved as "2.5 Years" / "6 Months". */}
      <div className="animal-age-field">
        <span className="animal-age-label" id="animal-age-label">
          <FieldLabel needsValue={Boolean(errors.ageValue)}>Estimated age</FieldLabel>
        </span>
        <div className="animal-age-inputs">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            placeholder="e.g. 2"
            aria-labelledby="animal-age-label"
            value={value.ageValue}
            onChange={(event) => setField("ageValue", event.target.value)}
            required
            {...fieldProps("ageValue")}
          />
          <select
            aria-label="Age unit"
            value={value.ageUnit}
            onChange={(event) => setField("ageUnit", event.target.value as AnimalFormInput["ageUnit"])}
            required
            aria-invalid={errorFor("ageValue") && !value.ageUnit ? true : undefined}
            onBlur={() => markTouched("ageValue")}
          >
            <option value="" disabled hidden>
              Unit
            </option>
            <option value="weeks">Weeks</option>
            <option value="months">Months</option>
            <option value="years">Years</option>
          </select>
        </div>
        <FieldError id="animal-ageValue-error" message={errorFor("ageValue")} />
      </div>

      <label>
        <FieldLabel needsValue={Boolean(errors.gender)}>Gender</FieldLabel>
        <select value={value.gender} onChange={(event) => setField("gender", event.target.value)} {...fieldProps("gender")}>
          <option value="">Select gender</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>
        <FieldError id="animal-gender-error" message={errorFor("gender")} />
      </label>

      <label>
        <FieldLabel needsValue={Boolean(errors.colour)}>Colour</FieldLabel>
        <select value={value.colour} onChange={(event) => setField("colour", event.target.value)} {...fieldProps("colour")}>
          <option value="">Select colour</option>
          {COLOUR_OPTIONS.map((colour) => (
            <option key={colour} value={colour}>
              {colour}
            </option>
          ))}
        </select>
        <FieldError id="animal-colour-error" message={errorFor("colour")} />
      </label>

      <label>
        <FieldLabel needsValue={Boolean(errors.size)}>Size</FieldLabel>
        <select
          value={value.size}
          onChange={(event) => setField("size", event.target.value as AnimalFormInput["size"])}
          {...fieldProps("size")}
        >
          <option value="">Select size</option>
          {SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {sizeOptionLabel(size)}
            </option>
          ))}
        </select>
        <FieldError id="animal-size-error" message={errorFor("size")} />
      </label>

      <label>
        <FieldLabel needsValue={Boolean(errors.vaccinationStatus)}>Vaccination status</FieldLabel>
        <select
          value={value.vaccinationStatus}
          onChange={(event) =>
            setField("vaccinationStatus", event.target.value as AnimalFormInput["vaccinationStatus"])
          }
          {...fieldProps("vaccinationStatus")}
        >
          <option value="" disabled hidden>
            Select vaccination status
          </option>
          <option value="not_vaccinated">Not yet vaccinated - open</option>
          <option value="vaccinated">Vaccinated</option>
        </select>
        <FieldError id="animal-vaccinationStatus-error" message={errorFor("vaccinationStatus")} />
      </label>

      {narrativeField("description", "Description", 4)}
      {narrativeField("behaviour", "Behaviour", 3)}


      <div className="animal-form-full animal-photo-field">
        <span className="animal-photo-label">
          <FieldLabel needsValue={Boolean(errors.photoUrls)}>
            Photos ({value.photoUrls.length} of {MAX_PHOTOS})
          </FieldLabel>{" "}
          - the first photo is used as the main profile picture
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
        <FieldError id="animal-photoUrls-error" message={showAllErrors ? errors.photoUrls : undefined} />
      </div>
    </div>
  );
}
