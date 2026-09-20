import { SignInButton, UserButton, useAuth, useUser } from "@clerk/react";
import { useEffect, useId, useState } from "react";
import spcaLogo from "../../assets/spca-logo.png";
import { DonateModal } from "../donations/DonateModal";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { SiteFooter } from "../../components/SiteFooter";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import {
  fetchAdoptionApplicationDetail,
  fetchMyAdoptionApplications,
} from "../../services/adoptionsApi";
import {
  adoptionStatusClass,
  adoptionStatusLabel,
  adoptionStepIndex,
  ADOPTION_STATUS_STEPS,
  type AdoptionApplication,
  type AdoptionStatus,
  type AdoptionStatusHistoryEntry,
} from "../../types/adoption";

type MyApplicationsProps = {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  onNavigate: (
    view: "home" | "animal-listings" | "user-dashboard" | "staff-dashboard" | "dashboard",
  ) => void;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Which forward step the applicant last reached before a rejection, so the
// stepper shows how far they got rather than pretending the final step was
// reached. For non-rejected applications the current status maps directly.
function currentStep(status: AdoptionStatus, history: AdoptionStatusHistoryEntry[]): number {
  if (status !== "rejected") {
    return adoptionStepIndex(status);
  }
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].status !== "rejected") {
      return adoptionStepIndex(history[index].status);
    }
  }
  return 0;
}

// Detail modal opened from the "My applications" list: forward-path stepper,
// the application's answers, the staff review note (shown whenever present,
// and highlighted on rejection) and the full timestamped status history.
function AdoptionApplicationDetailModal({
  application,
  history,
  onClose,
}: {
  application: AdoptionApplication;
  history: AdoptionStatusHistoryEntry[];
  onClose: () => void;
}) {
  const headingId = useId();

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const step = currentStep(application.status, history);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal rescue-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <header className="modal-header">
          <div>
            <p className="eyebrow">Adoption application</p>
            <h2 id={headingId}>
              {application.animal?.name ?? "This animal"}
              {application.animal ? ` - ${application.animal.publicId}` : ""}
            </h2>
          </div>
          <button
            type="button"
            className="ghost-button modal-close"
            onClick={onClose}
            aria-label="Close adoption application details"
          >
            ✕
          </button>
        </header>

        <div className="adoption-stepper" aria-label="Adoption progress">
          {ADOPTION_STATUS_STEPS.map((status, index) => (
            <div
              key={status}
              className={`adoption-stepper-stage${index < step ? " passed" : ""}${index === step ? " current" : ""}${application.status === "rejected" && index === step ? " rejected" : ""}`}
            >
              <span className="adoption-stepper-dot" aria-hidden="true" />
              <span className="adoption-stepper-label">{adoptionStatusLabel(status).split(" - ")[0]}</span>
            </div>
          ))}
        </div>

        <p className="adoption-status-line">
          <span className={`adoption-status-badge ${adoptionStatusClass(application.status)}`}>
            {adoptionStatusLabel(application.status)}
          </span>
        </p>

        {application.status === "rejected" && (
          <div className="adoption-rejection-note">
            <p className="eyebrow">Not this time</p>
            <p>
              {application.reviewNotes ||
                "Our team has decided not to proceed with this application."}
            </p>
          </div>
        )}

        <dl className="rescue-detail-grid">
          <div className="rescue-detail-item">
            <dt>Date submitted</dt>
            <dd>{formatDate(application.createdAt)}</dd>
          </div>
          <div className="rescue-detail-item">
            <dt>Animal</dt>
            <dd>
              {application.animal ? application.animal.name : "Animal no longer on record"}
            </dd>
          </div>
          <div className="rescue-detail-item full">
            <dt>About your home</dt>
            <dd>{application.homeDetails}</dd>
          </div>
          <div className="rescue-detail-item full">
            <dt>About your family</dt>
            <dd>{application.familyDetails}</dd>
          </div>
          <div className="rescue-detail-item full">
            <dt>Existing pets</dt>
            <dd>{application.existingPets || "None mentioned"}</dd>
          </div>
          <div className="rescue-detail-item full">
            <dt>Experience with animals</dt>
            <dd>{application.animalExperience || "None mentioned"}</dd>
          </div>
          {application.reviewNotes && application.status !== "rejected" && (
            <div className="rescue-detail-item full">
              <dt>Review note from our team</dt>
              <dd>{application.reviewNotes}</dd>
            </div>
          )}
        </dl>

        {history.length > 0 && (
          <div className="adoption-history">
            <h4 className="rescue-card-subtitle">Progress history</h4>
            <ul>
              {history.map((entry) => (
                <li key={entry.id}>
                  <span className={`adoption-status-badge adoption-history-badge ${adoptionStatusClass(entry.status)}`}>
                    {adoptionStatusLabel(entry.status)}
                  </span>
                  <span className="adoption-history-when">{formatDate(entry.createdAt)}</span>
                  {entry.note && <span className="adoption-history-note">{entry.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// Signed-in applicant: every adoption application submitted by the logged-in
// user, as a compact list. Clicking a row opens the stepper modal above.
export function MyApplications({ isLoaded, isSignedIn, onNavigate }: MyApplicationsProps) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [donateOpen, setDonateOpen] = useState(false);
  const [applications, setApplications] = useState<AdoptionApplication[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [applicationsError, setApplicationsError] = useState("");
  // Application whose detail modal is open (null = closed) plus its history,
  // fetched from the detail endpoint so "when" every step happened is shown.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<AdoptionApplication | null>(null);

  const isStaff =
    user?.publicMetadata.role === "staff" ||
    user?.publicMetadata.role === "veterinarian" ||
    user?.publicMetadata.role === "manager" ||
    user?.publicMetadata.role === "admin";

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    void (async () => {
      setApplicationsLoading(true);
      try {
        const token = await getToken();
        if (!token) throw new Error("Your Clerk session has expired.");
        setApplications(await fetchMyAdoptionApplications(token));
} catch (error) {
        setApplicationsError(
          error instanceof Error ? error.message : "Your adoption applications could not be loaded.",
        );
      } finally {
        setApplicationsLoading(false);
      }
    })();
  }, [getToken, isLoaded, isSignedIn]);

  async function openDetail(id: string) {
    setSelectedId(id);
    setSelectedDetail(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your Clerk session has expired.");
      const detail = await fetchAdoptionApplicationDetail(token, id);
      setSelectedDetail(detail);
    } catch {
      // Keep the modal usable from the list row's data if the detail fetch
      // fails; the stepper/history just won't have timestamps.
      setSelectedDetail(applications.find((item) => item.id === id) ?? null);
    }
  }

  function closeDetail() {
    setSelectedId(null);
    setSelectedDetail(null);
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
          <button type="button" className="nav-link" onClick={() => onNavigate("animal-listings")}>
            Animals
          </button>
          <button type="button" className="nav-link" onClick={() => setDonateOpen(true)}>
            Donate
          </button>
        </nav>
        <div className="header-actions">
          {!isLoaded ? null : isSignedIn ? (
            <>
              <button
                type="button"
                className="teal-button"
                onClick={() => onNavigate(isStaff ? "staff-dashboard" : "user-dashboard")}
              >
                My dashboard
              </button>
              <div className="user-avatar-circle">
                <UserButton />
              </div>
            </>
          ) : (
            <SignInButton mode="modal">
              <button type="button" className="teal-button">
                Sign in to see your applications
              </button>
            </SignInButton>
          )}
        </div>
      </header>

      <main className="page-shell">
        <Breadcrumbs
          trail={[
            { label: "Home", onClick: () => onNavigate("home") },
            { label: "My applications" },
          ]}
        />
        <section className="catalog-hero">
          <p className="eyebrow">My applications</p>
          <h1>Your adoption applications</h1>
          <p className="lead-copy">
            Every application you have submitted, with live progress from the
            SPCA Fiji team.
          </p>
        </section>

        {!isLoaded ? (
          <SkeletonLoader variant="card" />
        ) : !isSignedIn ? (
          <div className="search-card catalog-search">
            <p className="security-note">
              Sign in to see the adoption applications you have submitted.
            </p>
            <SignInButton mode="modal">
              <button type="button" className="teal-button">
                Sign in to see your applications
              </button>
            </SignInButton>
          </div>
        ) : (
          <section className="tracking-results">
            <div className="catalog-results-head">
              <div>
                <p className="eyebrow">My applications</p>
                <h2>Adoption applications you have submitted</h2>
              </div>
              <button
                type="button"
                className="teal-button small-button"
                onClick={() => onNavigate("animal-listings")}
              >
                Browse animals to adopt
              </button>
            </div>
            {applicationsLoading && (
              <SkeletonLoader variant="card" />
            )}
            {!applicationsLoading && applicationsError && (
              <p className="dashboard-data-state error">{applicationsError}</p>
            )}
            {!applicationsLoading && !applicationsError && applications.length === 0 && (
              <p className="dashboard-data-state">
                You have not submitted any adoption applications yet.
              </p>
            )}
            {!applicationsLoading && !applicationsError && (
              <div className="adoption-track-list">
                {applications.map((application) => (
                  <button
                    key={application.id}
                    type="button"
                    className="adoption-track-row"
                    onClick={() => void openDetail(application.id)}
                    aria-label={`View details for your application to ${application.animal?.name ?? "an animal"}`}
                  >
                    {application.animal?.photoUrls[0] ? (
                      <img
                        src={application.animal.photoUrls[0]}
                        alt={application.animal.name}
                        className="adoption-track-photo"
                      />
                    ) : (
                      <span className="adoption-track-photo adoption-track-photo-empty" aria-hidden="true">
                        {application.animal?.name?.charAt(0) ?? "A"}
                      </span>
                    )}
                    <span className="adoption-track-name">
                      <strong>{application.animal?.name ?? "Animal"}</strong>
                      {application.animal && <small>{application.animal.publicId}</small>}
                    </span>
                    <span className="adoption-track-when">{formatDate(application.createdAt)}</span>
                    <span className={`adoption-status-badge ${adoptionStatusClass(application.status)}`}>
                      {adoptionStatusLabel(application.status)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
      <SiteFooter />

      {selectedId && selectedDetail && (
        <AdoptionApplicationDetailModal
          application={selectedDetail}
          history={selectedDetail.history ?? []}
          onClose={closeDetail}
        />
      )}
      <DonateModal open={donateOpen} onClose={() => setDonateOpen(false)} />
    </div>
  );
}