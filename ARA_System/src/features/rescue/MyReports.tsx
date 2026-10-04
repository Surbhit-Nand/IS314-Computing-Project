import { SignInButton, useAuth } from "@clerk/react";
import { useEffect, useId, useState } from "react";
import { fetchMyRescueReports } from "../../services/rescueApi";
import type { RescueReport, RescueReportStatus } from "../../types/rescue";
import {
  rescueStatusClass,
  rescueUrgencyLabel,
} from "../../types/rescue";
import { SiteFooter } from "../../components/SiteFooter";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { RescueProgressTimeline } from "./RescueProgressTimeline";
import { SiteHeader, type SiteHeaderView } from "../../components/SiteHeader";

type MyReportsProps = {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  onNavigate: (view: SiteHeaderView) => void;
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
  in_progress: 3,
  awaiting_reassignment: 2,
  resolved: 4,
};

function reportStatusShortLabel(status: RescueReportStatus): string {
  if (status === "awaiting_reassignment") return "Needs Dispatcher";
  return REPORT_TIMELINE[CURRENT_STAGE[status] ?? 1]?.label ?? "Under Review";
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

  const currentStage = CURRENT_STAGE[report.status] ?? 1;
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
            <p className="eyebrow">Alert details</p>
            <h2 id={headingId}>{report.reference}</h2>
          </div>
          <button
            type="button"
            className="ghost-button modal-close"
            onClick={onClose}
            aria-label="Close rescue alert details"
          >
            ✕
          </button>
        </header>

        <div className="rescue-timeline" aria-label="Alert progress">
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

        <RescueProgressTimeline report={report} userFacing />
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
  const [myReports, setMyReports] = useState<RescueReport[]>([]);
  const [myReportsLoading, setMyReportsLoading] = useState(false);
  const [myReportsError, setMyReportsError] = useState("");
  // Report whose full details are shown in the pop-up dialog (null = closed).
  const [selectedReport, setSelectedReport] = useState<RescueReport | null>(null);

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
          error instanceof Error ? error.message : "Your rescue alerts could not be loaded.",
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
      <SiteHeader
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage="my-reports"
        onNavigate={onNavigate}
      />

      <main className="page-shell">
        <Breadcrumbs
          trail={[
            { label: "Home", onClick: () => onNavigate("home") },
            { label: "My Alerts" },
          ]}
        />
        <section className="catalog-hero">
          <p className="eyebrow">My Alerts</p>
          <h1>Your rescue alerts</h1>
          <p className="lead-copy">
            Every rescue alert you have submitted, with live status updates
            from the SPCA Fiji team.
          </p>
        </section>

        {!isLoaded ? (
          <p className="dashboard-data-state">Loading your rescue alerts...</p>
        ) : !isSignedIn ? (
          <div className="search-card catalog-search">
            <p className="security-note">
              Sign in to see the rescue alerts you have submitted.
            </p>
            <SignInButton mode="modal">
              <button type="button" className="teal-button">
                Sign in to see your alerts
              </button>
            </SignInButton>
          </div>
        ) : (
          <section className="tracking-results">
            <div className="catalog-results-head">
              <div>
                <p className="eyebrow">My Alerts</p>
                <h2>Rescue alerts you have submitted</h2>
              </div>
              <button
                type="button"
                className="teal-button small-button"
                onClick={() => onNavigate("rescue-report")}
              >
                Submit another alert
              </button>
            </div>
            {myReportsLoading && (
              <p className="dashboard-data-state">Loading your rescue alerts...</p>
            )}
            {!myReportsLoading && myReportsError && (
              <p className="dashboard-data-state error">{myReportsError}</p>
            )}
            {!myReportsLoading && !myReportsError && myReports.length === 0 && (
              <p className="dashboard-data-state">
                You have not submitted any rescue alerts yet.
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
                    aria-label={`View details for alert ${report.reference}`}
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
    </div>
  );
}
