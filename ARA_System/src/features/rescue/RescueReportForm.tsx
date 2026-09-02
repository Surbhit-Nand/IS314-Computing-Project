import { UserButton, useAuth, useUser } from "@clerk/react";
import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import spcaLogo from "../../assets/spca-logo.png";
import { DonateButton } from "../donations/DonateButton";
import { submitRescueReport, uploadRescuePhoto } from "../../services/rescueApi";
import { RescueLocationMap } from "./RescueLocationMap";
import type { RescueReportFormInput, RescueUrgency } from "../../types/rescue";

type RescueReportFormProps = {
  // "public" renders the anonymous visitor form inside the public site shell;
  // "staff" renders the same form inside the staff dashboard so a phone call
  // is logged through the identical schema/fields (one code path).
  variant: "public" | "staff";
  source: "online" | "phone";
  onNavigate: (
    view: "home" | "my-reports" | "manage-rescue-reports" | "staff-dashboard",
  ) => void;
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
export function RescueReportForm({ variant, source, onNavigate, onShowMyReports }: RescueReportFormProps) {
  const { isSignedIn } = useUser();
  const { getToken } = useAuth();
  const [form, setForm] = useState<RescueReportFormInput>({ ...emptyForm, source });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [createdReference, setCreatedReference] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function setField<K extends keyof RescueReportFormInput>(key: K, fieldValue: RescueReportFormInput[K]) {
    setForm((previous) => ({ ...previous, [key]: fieldValue }));
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
      const report = await submitRescueReport(form, token ?? undefined);
      setCreatedReference(report.reference);
      setForm({ ...emptyForm, source });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The rescue report could not be submitted.";
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

      <label>
        <span className="form-label-text">
          Phone number <em className="optional-hint">(optional)</em>
        </span>
        <input
          type="tel"
          placeholder="e.g. 9900000"
          value={form.reporterPhone}
          onChange={(event) => setField("reporterPhone", event.target.value)}
        />
      </label>

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
        <label>
          <span className="form-label-text">Location of the animal</span>
          <input
            type="text"
            placeholder="Town / village / street landmark"
            value={form.location}
            onChange={(event) => setField("location", event.target.value)}
            required
          />
        </label>
        <span className="animal-photo-label">Pin the exact location on the map (optional)</span>
        <RescueLocationMap
          latitude={form.latitude}
          longitude={form.longitude}
          onLocationChange={(selectedLatitude, selectedLongitude) => {
            setField("latitude", selectedLatitude);
            setField("longitude", selectedLongitude);
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
              <img src={url} alt="Rescue report" />
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
          <p className="photo-upload-title">Upload a photo of the animal</p>
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
        <header className="dashboard-header">
          <div className="dashboard-brand">
            <button
              type="button"
              className="brand-button"
              onClick={() => onNavigate("home")}
            >
              <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
            </button>
            <div>
              <p className="eyebrow">ARA operations</p>
              <h1>Log a phone rescue report</h1>
            </div>
          </div>
          <div className="dashboard-header-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => onNavigate("manage-rescue-reports")}
            >
              Back to rescue queue
            </button>
            <div className="user-avatar-circle">
              <UserButton />
            </div>
          </div>
        </header>

        <section className="dashboard-panel rescue-phone-panel">
          <p className="security-note">
            This is the same form the public uses online - only the source
            marker changes to &quot;phone&quot;, so a call follows one code path.
          </p>
          {createdReference && (
            <p className="invite-feedback success">
              Report logged. Reference: <strong>{createdReference}</strong>{" "}
              <button
                type="button"
                className="text-button"
                onClick={onShowMyReports}
              >
                View in my reports
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
                {isSubmitting ? "Logging report..." : "Submit rescue report"}
              </button>
            </div>
          </form>
        </section>
      </main>
    );
  }

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
          <button type="button" className="nav-link" onClick={() => onNavigate("home")}>
            Home
          </button>
          <button
            type="button"
            className="nav-link active"
            aria-current="page"
          >
            Rescue Report
          </button>
          <DonateButton className="nav-link">Donate</DonateButton>
        </nav>
        <div className="header-actions">
          {isSignedIn && (
            <button
              type="button"
              className="teal-button"
              onClick={() => onNavigate("my-reports")}
            >
              My reports
            </button>
          )}
        </div>
      </header>

      <main className="page-shell">
        <section className="catalog-hero">
          <p className="eyebrow">Rescue reporting</p>
          <h1>Report an animal in need</h1>
          <p className="lead-copy">
            Tell SPCA Fiji about an animal that needs help. Include a location,
            its condition, and how urgent the situation is - our team will
            review the report and assign a rescuer.
          </p>
        </section>

        <section className="rescue-form-panel">
          {createdReference && (
            <div className="rescue-success">
              <p className="eyebrow">Report received</p>
              <h2>Thank you for reporting this animal.</h2>
              <p>
                Your report reference is <strong>{createdReference}</strong>. Save
                it to track progress, or follow the link below.
              </p>
              <button
                type="button"
                className="teal-button"
                onClick={onShowMyReports}
              >
                View in my reports
              </button>
            </div>
          )}
          {!createdReference && (
            <>
              {errorMessage && <p className="invite-feedback error">{errorMessage}</p>}
              <p className="security-note">
                No account needed. If you are signed in, your report will link
                to your profile so you can track it from your dashboard.
              </p>
              <form className="animal-form rescue-form" onSubmit={handleSubmit}>
                {formFields}
                <div className="rescue-form-actions">
                  <button type="submit" className="teal-button rescue-submit-button" disabled={isSubmitting}>
                    {isSubmitting ? "Submitting report..." : "Submit rescue report"}
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