import { SignInButton, UserButton, useAuth, useUser } from "@clerk/react";
import { useEffect, useId, useState } from "react";
import spcaLogo from "../../assets/spca-logo.png";
import { DonateModal } from "../donations/DonateModal";
import { fetchMyRescueReports } from "../../services/rescueApi";
import type { RescueReport, RescueReportStatus } from "../../types/rescue";
import {
  rescueStatusClass,
  rescueUrgencyLabel,
} from "../../types/rescue";
import { SiteFooter } from "../../components/SiteFooter";
import { Breadcrumbs } from "../../components/Breadcrumbs";

type MyReportsProps = {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  onNavigate: (view: "home" | "rescue-report" | "user-dashboard" | "staff-dashboard" | "dashboard") => void;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Reporter-facing progress steps. The API's four stored statuses sit on this
// timeline: "submitted" already means the report has been received, so its
// current stage is "Under Review" rather than a permanently-empty first step.
const REPORT_TIMELINE = [
  { label: "Submitted" },
  { label: "Under Review" },
  { label: "Assigned" },
  { label: "In Progress" },
  { label: "Resolved" },
] as const;

const CURRENT_STAGE: Record<RescueReportStatus, number> = {
  submitted: 1,
  assigned: 2,
  rescued: 3,
  closed: 4,
};

function reportStatusShortLabel(status: RescueReportStatus): string {
  return REPORT_TIMELINE[CURRENT_STAGE[status]].label;
}

// Modal pop-up with the full details of a single report, opened from the
// compact "My reports" list. Mirrors the app's modal conventions (backdrop,
// dialog role, Escape/backdrop close, ✕ button).
function RescueReportDetailModal({
  report,
  onClose,
}: {
  report: RescueReport;
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

  const currentStage = CURRENT_STAGE[report.status];
  const hasPin = report.latitude != null && report.longitude != null;

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
            <p className="eyebrow">Report details</p>
            <h2 id={headingId}>{report.reference}</h2>
          </div>
          <button
            type="button"
            className="ghost-button modal-close"
            onClick={onClose}
            aria-label="Close rescue report details"
          >
            ✕
          </button>
        </header>

        <div className="rescue-timeline" aria-label="Report progress">
          {REPORT_TIMELINE.map((stage, index) => (
            <div
              key={stage.label}
              className={`rescue-timeline-stage${index < currentStage ? " passed" : ""}${index === currentStage ? " current" : ""}`}
            >
              <span className="rescue-timeline-dot" aria-hidden="true" />
              <span className="rescue-timeline-label">{stage.label}</span>
            </div>
          ))}
        </div>

        <dl className="rescue-detail-grid">
          <div className="rescue-detail-item">
            <dt>Current status</dt>
            <dd className="rescue-detail-status-value">
              <span className={`report-status ${rescueStatusClass(report.status)}`}>
                {reportStatusShortLabel(report.status)}
              </span>
            </dd>
          </div>
          <div className="rescue-detail-item">
            <dt>Urgency</dt>
            <dd>
              <span className={`report-urgency-chip ${report.urgency}`}>
                {rescueUrgencyLabel(report.urgency)}
              </span>
            </dd>
          </div>
          <div className="rescue-detail-item">
            <dt>Animal type</dt>
            <dd>{report.animalType ?? "Not recorded"}</dd>
          </div>
          <div className="rescue-detail-item">
            <dt>Breed / description</dt>
            <dd>{report.animalBreed || "Not recorded"}</dd>
          </div>
          <div className="rescue-detail-item full">
            <dt>Location</dt>
            <dd>
              {report.location}
              {hasPin && (
                <a
                  className="rescue-detail-map-link"
                  href={`https://www.google.com/maps?q=${report.latitude},${report.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on map
                </a>
              )}
            </dd>
          </div>
          <div className="rescue-detail-item">
            <dt>Date submitted</dt>
            <dd>{formatDate(report.createdAt)}</dd>
          </div>
          <div className="rescue-detail-item">
            <dt>Dispatcher / assignment</dt>
            <dd>{report.assignedTo ?? "Awaiting assignment"}</dd>
          </div>
          <div className="rescue-detail-item full">
            <dt>Condition / observation</dt>
            <dd>{report.conditionDescription}</dd>
          </div>
        </dl>

        {report.photoUrls.length > 0 && (
          <div className="rescue-detail-photos">
            {report.photoUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt={`Photo for ${report.reference}`} />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// My Reports page (signed-in only). Automatically loads every rescue report
// the logged-in user has submitted - keyed off their Clerk user ID server-side
// - and shows a compact, clickable list. Clicking a row opens the report
// details modal above.
export function MyReports({
  isLoaded,
  isSignedIn,
  onNavigate,
}: MyReportsProps) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [donateOpen, setDonateOpen] = useState(false);
  const [myReports, setMyReports] = useState<RescueReport[]>([]);
  const [myReportsLoading, setMyReportsLoading] = useState(false);
  const [myReportsError, setMyReportsError] = useState("");
  // Report whose full details are shown in the pop-up dialog (null = closed).
  const [selectedReport, setSelectedReport] = useState<RescueReport | null>(null);

  const isStaff =
    user?.publicMetadata.role === "staff" ||
    user?.publicMetadata.role === "veterinarian" ||
    user?.publicMetadata.role === "manager" ||
    user?.publicMetadata.role === "admin";

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    void (async () => {
      setMyReportsLoading(true);
      try {
        const token = await getToken();
        if (!token) throw new Error("Your Clerk session has expired.");
        setMyReports(await fetchMyRescueReports(token));
      } catch (error) {
        setMyReportsError(
          error instanceof Error ? error.message : "Your rescue reports could not be loaded.",
        );
      } finally {
        setMyReportsLoading(false);
      }
    })();
  }, [getToken, isLoaded, isSignedIn]);

  function closeDetail() {
    setSelectedReport(null);
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
          <button type="button" className="nav-link" onClick={() => onNavigate("rescue-report")}>
            Rescue Report
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
                Sign in to see your reports
              </button>
            </SignInButton>
          )}
        </div>
      </header>

      <main className="page-shell">
        <Breadcrumbs
          trail={[
            { label: "Home", onClick: () => onNavigate("home") },
            { label: "My reports" },
          ]}
        />
        <section className="catalog-hero">
          <p className="eyebrow">My reports</p>
          <h1>Your rescue reports</h1>
          <p className="lead-copy">
            Every rescue report you have submitted, with live status updates
            from the SPCA Fiji team.
          </p>
        </section>

        {!isLoaded ? (
          <p className="dashboard-data-state">Loading your rescue reports...</p>
        ) : !isSignedIn ? (
          <div className="search-card catalog-search">
            <p className="security-note">
              Sign in to see the rescue reports you have submitted.
            </p>
            <SignInButton mode="modal">
              <button type="button" className="teal-button">
                Sign in to see your reports
              </button>
            </SignInButton>
          </div>
        ) : (
          <section className="tracking-results">
            <div className="catalog-results-head">
              <div>
                <p className="eyebrow">My reports</p>
                <h2>Rescue reports you have submitted</h2>
              </div>
              <button
                type="button"
                className="teal-button small-button"
                onClick={() => onNavigate("rescue-report")}
              >
                Submit another report
              </button>
            </div>
            {myReportsLoading && (
              <p className="dashboard-data-state">Loading your rescue reports...</p>
            )}
            {!myReportsLoading && myReportsError && (
              <p className="dashboard-data-state error">{myReportsError}</p>
            )}
            {!myReportsLoading && !myReportsError && myReports.length === 0 && (
              <p className="dashboard-data-state">
                You have not submitted any rescue reports yet.
              </p>
            )}
            {!myReportsLoading && !myReportsError && (
              <div className="my-report-list">
                {myReports.map((report) => (
                  <button
                    key={report.id}
                    type="button"
                    className="my-report-row"
                    onClick={() => setSelectedReport(report)}
                    aria-label={`View details for report ${report.reference}`}
                  >
                    <span className="my-report-reference">{report.reference}</span>
                    <span className={`report-status ${rescueStatusClass(report.status)}`}>
                      {reportStatusShortLabel(report.status)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
      <SiteFooter />

      {selectedReport && (
        <RescueReportDetailModal report={selectedReport} onClose={closeDetail} />
      )}
      <DonateModal open={donateOpen} onClose={() => setDonateOpen(false)} />
    </div>
  );
}
