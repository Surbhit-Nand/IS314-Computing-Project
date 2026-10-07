import { SignInButton, useAuth, useUser } from "@clerk/react";
import { useEffect, useMemo, useState } from "react";
import spcaLogo from "../../assets/spca-logo.png";
import { fetchAllRescueReports } from "../../services/rescueApi";
import { rescueStatusClass, rescueUrgencyLabel } from "../../types/rescue";
import type { RescueReport, RescueReportStatus, RescueUrgency } from "../../types/rescue";
import { isDevBypassEnabled } from "../../utils/devBypass";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { SiteHeader, type SiteHeaderView } from "../../components/SiteHeader";
import { SkeletonLoader } from "../../components/SkeletonLoader";

type ManageRescueReportsProps = {
  onNavigate: (view: SiteHeaderView) => void;
};

// The staff queue shows every report still being worked on. Resolved reports
// stay in the database (they are never deleted) but are excluded here and from
// the status dropdown - staff review resolved cases via Mission History.
const ACTIVE_STATUSES: RescueReportStatus[] = ["submitted", "assigned", "in_progress", "awaiting_reassignment"];
const STATUS_FILTERS = ["all", ...ACTIVE_STATUSES] as const;

// Urgency sort order for the queue: highest first.
const URGENCY_RANK: Record<RescueUrgency, number> = {
  critical: 0,
  high: 1,
  moderate: 2,
  low: 3,
};

// Reporter-facing progress steps shown at the top of an expanded report. The
// stored statuses sit on this timeline: "submitted" is received (so its
// current stage reads "Under Review"), "assigned" -> "Assigned",
// "in_progress" -> "In Progress", and "resolved" -> "Resolved". Used purely
// for display.
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

// Short, friendly badge labels for each stored status.
const STATUS_BADGE_LABEL: Record<RescueReportStatus, string> = {
  submitted: "Under Review",
  assigned: "Assigned",
  in_progress: "In Progress",
  awaiting_reassignment: "Needs Dispatcher",
  resolved: "Resolved",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Staff-only page: the full rescue queue, restored as a read-only review
// surface. Every report is listed with its details; dispatchers own the
// actual mission updates now (claim / start / debrief in the portal), so this
// page shows what each report's state is without letting staff change it.
export function ManageRescueReports({ onNavigate }: ManageRescueReportsProps) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const role = user?.publicMetadata.role;
  const hasStaffAccess =
    isDevBypassEnabled ||
    role === "staff" ||
    role === "veterinarian" ||
    role === "manager" ||
    role === "admin";

  const [reports, setReports] = useState<RescueReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Loads the full rescue queue once the staff member's access is confirmed.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !hasStaffAccess) return;

    void (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Your Clerk session has expired.");
        setReports(await fetchAllRescueReports(token));
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Rescue alerts could not be loaded.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [getToken, hasStaffAccess, isLoaded, isSignedIn]);

  // Applies the text search and status filter client-side over the loaded
  // queue, hides resolved reports, and sorts by urgency (Critical first,
  // oldest report first within the same urgency). Sorting runs over the
  // filtered set, so it keeps working while searching or filtering.
  const visibleReports = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return reports
      .filter((report) => report.status !== "resolved")
      .filter((report) => {
        if (statusFilter !== "all" && report.status !== statusFilter) return false;
        if (!term) return true;
        return [report.reference, report.location, report.reporterName, report.animalType ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => {
        const urgencyDiff = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
        if (urgencyDiff !== 0) return urgencyDiff;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }, [reports, searchTerm, statusFilter]);

  if (!isLoaded || !isSignedIn) {
    return (
      <main className="dashboard-locked">
        <div className="dashboard-locked-card">
          <div className="auth-brand">
            <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
            <strong>SPCA Fiji</strong>
          </div>
          <p className="eyebrow">SPCA operations</p>
          <h1>Sign in to continue</h1>
          <p>The rescue queue is available to authorised team members.</p>
          <SignInButton mode="modal">
            <button type="button" className="teal-button">
              Log in
            </button>
          </SignInButton>
        </div>
      </main>
    );
  }

  if (!hasStaffAccess) {
    return (
      <main className="dashboard-locked">
        <div className="dashboard-locked-card">
          <div className="auth-brand">
            <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
            <strong>SPCA Fiji</strong>
          </div>
          <p className="eyebrow">SPCA operations</p>
          <h1>Access restricted</h1>
          <p>Your account does not have staff, veterinary, manager, or admin permissions.</p>
          <button type="button" className="teal-button" onClick={() => onNavigate("home")}>
            Return home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <SiteHeader
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage="manage-rescue-reports"
        onNavigate={onNavigate}
      />

      <Breadcrumbs
        trail={[
          { label: "Staff Dashboard", onClick: () => onNavigate("staff-dashboard") },
          { label: "Rescue queue" },
        ]}
      />

      <header className="rescue-page-head">
        <div className="rescue-page-head-text">
          <p className="eyebrow">SPCA operations</p>
          <h1>Rescue alert queue</h1>
        </div>
        <div className="rescue-workspace-actions">
          <button
            type="button"
            className="teal-button"
            onClick={() => onNavigate("rescue-report-phone")}
          >
            Log phone alert
          </button>
        </div>
      </header>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Rescue alerts</p>
            <h2>{visibleReports.length} alert{visibleReports.length === 1 ? "" : "s"}</h2>
          </div>
          <div className="rescue-queue-controls">
            <select
              className="animal-search-input filter-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as (typeof STATUS_FILTERS)[number])}
              aria-label="Filter by status"
            >
              {STATUS_FILTERS.map((status) => (
                <option key={status} value={status}>
                  {status === "all"
                    ? "All statuses"
                    : `Status: ${STATUS_BADGE_LABEL[status as RescueReportStatus]}`}
                </option>
              ))}
            </select>
            <input
              type="search"
              className="animal-search-input"
              placeholder="Search reference, location, reporter..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </div>

        {isLoading && <SkeletonLoader variant="card" />}
        {!isLoading && loadError && <p className="dashboard-data-state error">{loadError}</p>}
        {!isLoading && !loadError && visibleReports.length === 0 && (
          <p className="dashboard-data-state">No rescue alerts match your filters.</p>
        )}

        {!isLoading && !loadError && visibleReports.length > 0 && (
          <div className="rescue-queue reports-queue">
            <div className="reports-queue-head" aria-hidden="true">
              <span>Alert</span>
              <span>Location &amp; Reporter</span>
              <span>Status</span>
              <span>Dispatcher</span>
              <span>Urgency</span>
            </div>
            {visibleReports.map((report) => {
              const isExpanded = expandedId === report.id;
              const currentStage = CURRENT_STAGE[report.status];
              return (
                <div key={report.id} className={`rescue-card${isExpanded ? " expanded" : ""}`}>
                  <button
                    type="button"
                    className="rescue-summary"
                    onClick={() => setExpandedId(isExpanded ? null : report.id)}
                    aria-expanded={isExpanded}
                  >
                    <span className="rescue-col-report">
                      <strong className="rescue-summary-ref">{report.reference}</strong>
                    </span>
                    <span className="rescue-col-location">
                      <span className="rescue-summary-loc">
                        {report.location}
                        {report.source === "phone" ? " (phone)" : ""}
                      </span>
                      <span className="rescue-summary-reporter">by {report.reporterName}</span>
                    </span>
                    <span className="rescue-col-status">
                      <span className={`rescue-status-badge ${rescueStatusClass(report.status)}`}>
                        {STATUS_BADGE_LABEL[report.status]}
                      </span>
                    </span>
                    <span className="rescue-col-dispatcher">
                      <span className={`rescue-assignee-badge${report.assignedTo ? " assigned" : ""}`}>
                        {report.assignedTo ?? "Unassigned"}
                      </span>
                    </span>
                    <span className="rescue-col-urgency">
                      <span className={`rescue-urgency-badge ${report.urgency}`} title={rescueUrgencyLabel(report.urgency)}>
                        {report.urgency}
                      </span>
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="rescue-detail-body">
                      <div className="rescue-progress-tracker" aria-label="Alert progress">
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

                      <div className="rescue-detail-columns">
                        <div className="rescue-details-card">
                          <h3 className="rescue-card-title">Alert Details</h3>
                          <dl className="rescue-details-list">
                            <div className="rescue-detail-field">
                              <dt>Reference number</dt>
                              <dd>{report.reference}</dd>
                            </div>
                            <div className="rescue-detail-field">
                              <dt>Animal type</dt>
                              <dd>{report.animalType ?? "Not recorded"}</dd>
                            </div>
                            <div className="rescue-detail-field">
                              <dt>Breed / description</dt>
                              <dd>{report.animalBreed || "Not recorded"}</dd>
                            </div>
                            <div className="rescue-detail-field full">
                              <dt>Condition / observation</dt>
                              <dd>{report.conditionDescription}</dd>
                            </div>
                            <div className="rescue-detail-field full">
                              <dt>Location</dt>
                              <dd>
                                {report.location}
                                {report.latitude != null && report.longitude != null ? (
                                  <>
                                    {" "}
                                    -{" "}
                                    <a
                                      href={`https://www.google.com/maps?q=${report.latitude},${report.longitude}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      {report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}
                                    </a>
                                  </>
                                ) : null}
                              </dd>
                            </div>
                            <div className="rescue-detail-field">
                              <dt>Urgency</dt>
                              <dd>{rescueUrgencyLabel(report.urgency)}</dd>
                            </div>
                            <div className="rescue-detail-field">
                              <dt>Reporter</dt>
                              <dd>
                                {report.reporterName}
                                {report.reporterPhone ? <span> - {report.reporterPhone}</span> : null}
                              </dd>
                            </div>
                            <div className="rescue-detail-field">
                              <dt>Contact</dt>
                              <dd>{report.reporterEmail || "No email provided"}</dd>
                            </div>
                            <div className="rescue-detail-field">
                              <dt>Date reported</dt>
                              <dd>
                                {formatDate(report.createdAt)}
                                {report.updatedAt !== report.createdAt
                                  ? ` (updated ${formatDate(report.updatedAt)})`
                                  : ""}
                              </dd>
                            </div>
                          </dl>

                          {report.photoUrls.length > 0 && (
                            <div className="rescue-detail-photo-block">
                              <h4 className="rescue-card-subtitle">Submitted photo</h4>
                              <div className="rescue-detail-photos">
                                {report.photoUrls.map((url) => (
                                  <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                                    <img src={url} alt={`Photo for ${report.reference}`} />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="rescue-dispatch-card">
                          <h3 className="rescue-card-title">Mission status</h3>

                          <div className="dispatch-field">
                            <span className="dispatch-label">Current status</span>
                            <span className={`rescue-status-badge ${rescueStatusClass(report.status)}`}>
                              {STATUS_BADGE_LABEL[report.status]}
                            </span>
                          </div>

                          <div className="dispatch-field">
                            <span className="dispatch-label">Dispatcher</span>
                            <strong>{report.assignedTo ?? "Available for a dispatcher to accept"}</strong>
                          </div>

                          {report.assignedAt && (
                            <div className="dispatch-field">
                              <span className="dispatch-label">Assigned on</span>
                              <strong>{formatDate(report.assignedAt)}</strong>
                            </div>
                          )}

                          {report.officeNote && (
                            <div className="dispatch-field">
                              <span className="dispatch-label">Internal handling notes</span>
                              <p>{report.officeNote}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}