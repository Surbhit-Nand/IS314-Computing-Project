import { useAuth, useUser } from "@clerk/react";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { submitRescueReport, uploadRescuePhoto } from "../../services/rescueApi";
import { reverseGeocodePlace, searchPlaces, type PlaceLookup } from "../../services/geocoding";
import { RescueLocationMap } from "./RescueLocationMap";
import type { RescueReportFormInput, RescueUrgency } from "../../types/rescue";
import { DEFAULT_DIAL_CODE, dialCodeByCode, expectedLengthLabel, formatPhone, isValidPhoneNational } from "../../utils/phone";
import { PhoneInput } from "../../components/PhoneInput";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { SiteHeader, type SiteHeaderView } from "../../components/SiteHeader";

type RescueReportFormProps = {
  // "public" renders the anonymous visitor form inside the public site shell;
  // "staff" renders the same form inside the staff dashboard so a phone call
  // is logged through the identical schema/fields (one code path).
  variant: "public" | "staff";
  source: "online" | "phone";
  isLoaded: boolean;
  onNavigate: (view: SiteHeaderView) => void;
  onShowMyReports: () => void;
};

const emptyForm: RescueReportFormInput = {
  reporterName: "",
  reporterPhone: "",
  reporterEmail: "",
  location: "",
  latitude: null,
  longitude: null,
  animalType: "",
  animalBreed: "",
  conditionDescription: "",
  urgency: "moderate",
  photoUrls: [],
  source: "online",
};

const URGENCY_OPTIONS: { value: RescueUrgency; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

// Short plain-language description shown under each urgency level on the
// selectable cards. This mirrors rescueUrgencyLabel() but kept short enough
// for the card layout.
const URGENCY_DESCRIPTIONS: Record<RescueUrgency, string> = {
  low: "Can wait",
  moderate: "Not urgent",
  high: "Needs attention soon",
  critical: "Life threatening",
};

// Both the public online rescue report form and the staff phone-in logging
// form share this single component. The only difference is `source` and the
// surrounding layout; the fields and the API call are one code path.
export function RescueReportForm({ variant, source, isLoaded, onNavigate, onShowMyReports }: RescueReportFormProps) {
  const { isSignedIn } = useUser();
  const { getToken } = useAuth();
  const [form, setForm] = useState<RescueReportFormInput>({ ...emptyForm, source });
  // Dial-code half of the optional reporter phone number (Fiji default).
  // Combined into `+code number` on submit; empty stays empty.
  const [reporterPhoneCode, setReporterPhoneCode] = useState(DEFAULT_DIAL_CODE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [createdReference, setCreatedReference] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Place-name search state: a debounced forward search feeds the suggestions
  // dropdown, and the "Find on map" button pins the first matched result.
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceLookup[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [placeSearchError, setPlaceSearchError] = useState("");
  // Set when a suggestion/geocode result is applied so the programmatic
  // location update doesn't trigger another forward search of the new text.
  const skipNextPlaceSearchRef = useRef(false);
  // Reverse geocoding fills the Location box - but never overwrites an address
  // the reporter typed themselves. The source (typed vs auto-filled) is tracked
  // via a ref so a late async response can't clobber freshly typed text.
  const locationManuallyEditedRef = useRef(false);
  // Nominatim allows roughly one reverse request per second; queue a trailing
  // call so dragging the marker won't hammer the API.
  const lastReverseRequestAtRef = useRef(0);
  const trailingReverseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (trailingReverseTimerRef.current != null) {
        window.clearTimeout(trailingReverseTimerRef.current);
      }
    };
  }, []);

  function setField<K extends keyof RescueReportFormInput>(key: K, fieldValue: RescueReportFormInput[K]) {
    setForm((previous) => ({ ...previous, [key]: fieldValue }));
  }

  // Debounced forward geocode of the typed location, feeding the dropdown.
  // All state writes happen inside the timer callback so a single stale value
  // mid-flight can never cascade a render storm after every keystroke.
  useEffect(() => {
    const query = placeQuery.trim();
    if (skipNextPlaceSearchRef.current) {
      skipNextPlaceSearchRef.current = false;
      return;
    }
    if (query.length < 3) return;
    const timer = window.setTimeout(async () => {
      setIsSearchingPlaces(true);
      try {
        const results = await searchPlaces(query);
        setPlaceSuggestions(results);
        setPlaceSearchError(
          results.length === 0
            ? `No places found for "${query}". Try a town, village, or street landmark.`
            : "",
        );
      } catch {
        setPlaceSuggestions([]);
        setPlaceSearchError(
          "Place search is unavailable right now - type the location above and use the 'Find on map' button instead.",
        );
      } finally {
        setIsSearchingPlaces(false);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [placeQuery]);

  // Reverse-geocodes a pin / "Use My Location" result and fills the Location
  // box - but only when the reporter hasn't typed something there themselves.
  function queueReverseGeocode(pinLatitude: number, pinLongitude: number) {
    if (locationManuallyEditedRef.current) return;
    const runReverse = async () => {
      try {
        // Re-check before writing so a pin moved while we were fetching an
        // earlier pin can't clobber a freshly typed description.
        if (locationManuallyEditedRef.current) return;
        const place = await reverseGeocodePlace(pinLatitude, pinLongitude);
        if (place && !locationManuallyEditedRef.current) {
          setField("location", place.displayName);
        }
      } catch {
        // Geocoder unavailable - the field simply stays manual.
      }
    };
    const now = Date.now();
    const elapsed = now - lastReverseRequestAtRef.current;
    if (elapsed >= 1_000) {
      lastReverseRequestAtRef.current = now;
      void runReverse();
    } else {
      if (trailingReverseTimerRef.current != null) {
        window.clearTimeout(trailingReverseTimerRef.current);
      }
      trailingReverseTimerRef.current = window.setTimeout(() => {
        lastReverseRequestAtRef.current = Date.now();
        void runReverse();
      }, 1_000 - elapsed);
    }
  }

  // Pins the first match for the typed location and normalises the field text
  // to the place name the geocoder resolved.
  async function handleFindOnMap() {
    const query = form.location.trim();
    if (query.length < 3) {
      setPlaceSearchError("Type a location name first (at least 3 characters).");
      return;
    }
    setPlaceSearchError("");
    setIsSearchingPlaces(true);
    try {
      const results = await searchPlaces(query);
      const hit = results[0];
      if (!hit) {
        setPlaceSearchError(
          `Couldn't find "${query}" on the map. Try a town, village, or street landmark.`,
        );
        return;
      }
      locationManuallyEditedRef.current = false;
      setField("location", hit.displayName);
      setField("latitude", hit.latitude);
      setField("longitude", hit.longitude);
      setPlaceQuery(hit.displayName);
      setPlaceSuggestions([]);
      skipNextPlaceSearchRef.current = true;
    } catch {
      setPlaceSearchError(
        "Place search is unavailable right now - please try again in a moment.",
      );
    } finally {
      setIsSearchingPlaces(false);
    }
  }

  function handleSuggestionPick(place: PlaceLookup) {
    locationManuallyEditedRef.current = false;
    setField("location", place.displayName);
    setField("latitude", place.latitude);
    setField("longitude", place.longitude);
    setPlaceQuery(place.displayName);
    setPlaceSuggestions([]);
    setPlaceSearchError("");
    skipNextPlaceSearchRef.current = true;
  }

  // Uploads the chosen file to Cloudinary (via the backend) and appends its
  // URL to the report's photo list on success. Shared by the file picker and
  // the drag-and-drop zone.
  async function uploadPhotoFile(file: File) {
    setErrorMessage("");
    setIsUploadingPhoto(true);
    try {
      const url = await uploadRescuePhoto(file);
      setField("photoUrls", [...form.photoUrls, url]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The photo could not be uploaded.",
      );
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  async function handlePhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await uploadPhotoFile(file);
  }

  function handlePhotoDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void uploadPhotoFile(file);
    }
  }

  function handlePhotoDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(true);
  }

  function handlePhotoDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  function removePhoto(url: string) {
    setField(
      "photoUrls",
      form.photoUrls.filter((existing) => existing !== url),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.reporterName.trim() || !form.location.trim() || !form.conditionDescription.trim()) {
      window.alert("Please fill in the reporter name, location, and condition description.");
      return;
    }
    if (form.reporterPhone.trim() && !isValidPhoneNational(form.reporterPhone, reporterPhoneCode)) {
      const band = dialCodeByCode(reporterPhoneCode);
      window.alert(
        `Enter a valid ${band.name} phone number (${expectedLengthLabel(reporterPhoneCode)}) or leave it blank.`,
      );
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);
    try {
      // Attach the signed-in user's session token so the server can stamp
      // reporterClerkUserId on the report - without it the report is saved as
      // anonymous and never shows up in that user's My Reports list.
      const token = isSignedIn ? await getToken() : undefined;
      if (isSignedIn && !token) {
        throw new Error("Your sign-in session has expired. Please sign in again.");
      }
      const report = await submitRescueReport(
        {
          ...form,
          reporterPhone: form.reporterPhone.trim()
            ? formatPhone(reporterPhoneCode, form.reporterPhone)
            : "",
        },
        token ?? undefined,
      );
      setCreatedReference(report.reference);
      locationManuallyEditedRef.current = false;
      setForm({ ...emptyForm, source });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The rescue alert could not be submitted.";
      window.alert(message);
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const formFields = (
    <div className="animal-form-grid">
      <label>
        <span className="form-label-text">
          Your name{source === "phone" ? " (caller)" : ""}
        </span>
        <input
          type="text"
          placeholder="e.g. Mere Koro"
          value={form.reporterName}
          onChange={(event) => setField("reporterName", event.target.value)}
          required
        />
      </label>

      <PhoneInput
        label="Phone number"
        code={reporterPhoneCode}
        number={form.reporterPhone}
        onCodeChange={setReporterPhoneCode}
        onNumberChange={(value) => setField("reporterPhone", value)}
        hint={<em className="optional-hint">(optional)</em>}
      />

      <label className="animal-form-full">
        <span className="form-label-text">
          Email address <em className="optional-hint">(optional)</em>
        </span>
        <input
          type="email"
          placeholder="you@example.com"
          value={form.reporterEmail}
          onChange={(event) => setField("reporterEmail", event.target.value)}
        />
      </label>

      <div className="animal-form-full rescue-location-section">
        <div className="rescue-location-field">
          <label>
            <span className="form-label-text">Location of the animal</span>
            <div className="rescue-location-input-row">
              <input
                type="text"
                placeholder="Town / village / street landmark"
                value={form.location}
                onChange={(event) => {
                  const value = event.target.value;
                  setField("location", value);
                  locationManuallyEditedRef.current = true;
                  setPlaceQuery(value);
                  if (value.trim().length < 3) {
                    setPlaceSuggestions([]);
                    setPlaceSearchError("");
                  }
                }}
                required
              />
              <button
                type="button"
                className="teal-button small-button"
                onClick={handleFindOnMap}
                disabled={isSearchingPlaces}
              >
                {isSearchingPlaces ? "Searching..." : "Find on map"}
              </button>
            </div>
          </label>
          {isSearchingPlaces && (
            <p className="rescue-location-status">Searching for places...</p>
          )}
          {placeSearchError && <p className="invite-feedback error">{placeSearchError}</p>}
          {placeSuggestions.length > 0 && (
            <ul className="rescue-location-suggestions" role="listbox">
              {placeSuggestions.map((place) => (
                <li key={`${place.latitude},${place.longitude}`}>
                  <button type="button" onClick={() => handleSuggestionPick(place)}>
                    {place.displayName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className="animal-photo-label">Mark the exact location on the map (optional)</span>
        <RescueLocationMap
          latitude={form.latitude}
          longitude={form.longitude}
          onLocationChange={(selectedLatitude, selectedLongitude) => {
            locationManuallyEditedRef.current = false;
            setField("latitude", selectedLatitude);
            setField("longitude", selectedLongitude);
            queueReverseGeocode(selectedLatitude, selectedLongitude);
          }}
        />
      </div>

      <label>
        <span className="form-label-text">Animal type (if known)</span>
        <select
          value={form.animalType}
          onChange={(event) => setField("animalType", event.target.value as RescueReportFormInput["animalType"])}
        >
          <option value="">Not sure</option>
          <option value="dog">Dog</option>
          <option value="cat">Cat</option>
          <option value="rabbit">Rabbit</option>
          <option value="other">Other</option>
        </select>
      </label>

      <label>
        <span className="form-label-text">
          Breed / description <em className="optional-hint">(optional)</em>
        </span>
        <input
          type="text"
          placeholder="e.g. brown and white terrier mix"
          value={form.animalBreed}
          onChange={(event) => setField("animalBreed", event.target.value)}
        />
      </label>

      <div className="animal-form-full">
        <span className="animal-photo-label">Urgency</span>
        <div className="urgency-card-grid" role="radiogroup" aria-label="Urgency">
          {URGENCY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`urgency-card${form.urgency === option.value ? " selected" : ""}`}
            >
              <input
                type="radio"
                name="urgency"
                value={option.value}
                checked={form.urgency === option.value}
                onChange={() => setField("urgency", option.value)}
              />
              <span className={`urgency-card-dot ${option.value}`} />
              <strong>{option.label}</strong>
              <span className="urgency-card-desc">{URGENCY_DESCRIPTIONS[option.value]}</span>
            </label>
          ))}
        </div>
      </div>

      <label className="animal-form-full">
        <span className="form-label-text">Condition of the animal</span>
        <textarea
          rows={6}
          placeholder="Describe injuries, fear, behaviour, surroundings..."
          value={form.conditionDescription}
          onChange={(event) => setField("conditionDescription", event.target.value)}
          required
        />
      </label>

      <div className="animal-form-full animal-photo-field">
        <span className="animal-photo-label">Photos (optional)</span>
        <div className="animal-photo-list">
          {form.photoUrls.map((url) => (
            <div className="animal-photo-thumb" key={url}>
              <img src={url} alt="Rescue alert" />
              <button type="button" onClick={() => removePhoto(url)} aria-label="Remove photo">
                &times;
              </button>
            </div>
          ))}
        </div>
        <div
          className={`photo-upload-zone${isDragOver ? " dragover" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={handlePhotoDragOver}
          onDragLeave={handlePhotoDragLeave}
          onDrop={handlePhotoDrop}
        >
          <span className="photo-upload-icon" aria-hidden="true">+</span>
          <p className="photo-upload-title">Upload a photo of the animal and location</p>
          <p className="photo-upload-hint">Drag &amp; drop here, or click to choose a file</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="photo-upload-input"
          onChange={handlePhotoSelected}
          disabled={isUploadingPhoto}
        />
        {isUploadingPhoto && <p className="dashboard-data-state">Uploading photo...</p>}
      </div>
    </div>
  );

  if (variant === "staff") {
    return (
      <main className="dashboard-page">
        <SiteHeader isLoaded={isLoaded} isSignedIn={isSignedIn} currentPage="rescue-report-phone" onNavigate={onNavigate} />
        <header className="workspace-section-head"><p className="eyebrow">Rescue operations</p><h1>Log a phone rescue alert</h1><p>Record the caller’s report and prepare the rescue team.</p></header>

        <Breadcrumbs
          trail={[
            { label: "Staff Dashboard", onClick: () => onNavigate("staff-dashboard") },
            { label: "Rescue queue", onClick: () => onNavigate("manage-rescue-reports") },
            { label: "Log phone alert" },
          ]}
        />

        <section className="dashboard-panel rescue-phone-panel">
          <p className="security-note">
            This is the same form the public uses online - only the source
            marker changes to &quot;phone&quot;, so a call follows one code path.
          </p>
          {createdReference && (
            <p className="invite-feedback success">
              Alert logged. Reference: <strong>{createdReference}</strong>{" "}
              <button
                type="button"
                className="text-button"
                onClick={onShowMyReports}
              >
                View in my alerts
              </button>
            </p>
          )}
          {errorMessage && !createdReference && (
            <p className="invite-feedback error">{errorMessage}</p>
          )}
          <form className="animal-form rescue-form" onSubmit={handleSubmit}>
            {formFields}
            <div className="rescue-form-actions">
              <button type="submit" className="teal-button rescue-submit-button" disabled={isSubmitting}>
                {isSubmitting ? "Logging alert..." : "Submit rescue alert"}
              </button>
            </div>
          </form>
        </section>
      </main>
    );
  }

  return (
    <div className="home-page rescue-public-page">
      <SiteHeader
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage="rescue-report"
        onNavigate={onNavigate}
      />

      <main className="page-shell">
        <section className="catalog-hero">
          <p className="eyebrow">Rescue alerts</p>
          <h1>Report an animal in need</h1>
          <p className="lead-copy">
            Tell SPCA Fiji about an animal that needs help. Include a location,
            its condition, and how urgent the situation is - our team will
            review the alert and assign a dispatcher.
          </p>
        </section>

        <section
          className={`rescue-form-panel${createdReference ? " rescue-form-panel-confirm" : ""}`}
        >
          {createdReference && (
            <div className="rescue-success">
              <p className="eyebrow">Alert received</p>
              <h2>Thank you for submitting a rescue alert.</h2>
              <p>
                Your rescue alert reference is <strong>{createdReference}</strong>. Save
                it to track progress, or follow the link below.
              </p>
              <button
                type="button"
                className="teal-button"
                onClick={onShowMyReports}
              >
                View in my alerts
              </button>
            </div>
          )}
          {!createdReference && (
            <>
              {errorMessage && <p className="invite-feedback error">{errorMessage}</p>}
              <p className="security-note">
                No account needed. If you are signed in, your alert will link
                to your profile so you can track it from your dashboard.
              </p>
              <form className="animal-form rescue-form" onSubmit={handleSubmit}>
                {formFields}
                <div className="rescue-form-actions">
                  <button type="submit" className="teal-button rescue-submit-button" disabled={isSubmitting}>
                    {isSubmitting ? "Submitting alert..." : "Submit rescue alert"}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>

        <section className="cta-strip rescue-cta" id="rescue">
          <div>
            <p className="eyebrow">Need help?</p>
            <h2>Phone us during working hours, or text the after-hours line.</h2>
          </div>
          <div className="cta-actions">
            <span className="ghost-button light">8926200 (working hours)</span>
            <span className="ghost-button light">Text 9922634 (5pm - 10pm)</span>
          </div>
        </section>
      </main>
    </div>
  );
}
