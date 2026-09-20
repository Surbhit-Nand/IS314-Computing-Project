import { SignInButton, UserButton, useAuth, useUser } from "@clerk/react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import spcaLogo from "../../assets/spca-logo.png";
import { fetchStaffAnimals } from "../../services/animalsApi";
import { fetchAllRescueReports, updateRescueReport } from "../../services/rescueApi";
import { rescueStatusClass, rescueUrgencyLabel } from "../../types/rescue";
import type { RescueReport, RescueUrgency } from "../../types/rescue";
import type { Animal } from "../../types/animal";
import { isDevBypassEnabled } from "../../utils/devBypass";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { SkeletonLoader } from "../../components/SkeletonLoader";

type ManageRescueReportsProps = {
  onNavigate: (view: "home" | "staff-dashboard" | "rescue-report-phone") => void;
};

// Single source of truth for the lifecycle order on the client side - keep in
// sync with RESCUE_REPORT_STATUSES in server/src/modules/rescue/rescue.service.ts.
const REPORT_STATUSES = ["submitted", "assigned", "rescued", "closed"] as const;
type ReportStatus = (typeof REPORT_STATUSES)[number];

// The active queue only shows reports still being worked on - resolved
// reports stay in the database (never deleted) but are excluded here and
// from the status dropdown.
const ACTIVE_STATUSES = REPORT_STATUSES.filter(
  (status): status is Exclude<ReportStatus, "closed"> => status !== "closed",
);

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
// current stage reads "Under Review"), "assigned" -> "Assigned", "rescued" ->
// "In Progress", and "closed" -> "Resolved". Used purely for display - the
// underlying status values/options are unchanged.
const REPORT_TIMELINE = [
  { label: "Submitted" },
  { label: "Under Review" },
  { label: "Assigned" },
  { label: "In Progress" },
  { label: "Resolved" },
] as const;

const CURRENT_STAGE: Record<ReportStatus, number> = {
  submitted: 1,
  assigned: 2,
  rescued: 3,
  closed: 4,
};

// Short, friendly badge labels for each stored status.
const STATUS_BADGE_LABEL: Record<ReportStatus, string> = {
  submitted: "Under Review",
  assigned: "Assigned",
  rescued: "In Progress",
  closed: "Resolved",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Staff-only page: the full rescue queue. Each report expands into a dispatch
// panel where staff assign a rescuer, attach an animal profile, leave a
// handling note, and move the report forward through its lifecycle.
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
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingMessage, setSavingMessage] = useState("");
  const [savingError, setSavingError] = useState("");
  // Live "assign dispatcher" value for each open dispatch card - status options
  // unlock as soon as a name is typed, before the report is saved.
  const [pendingAssignment, setPendingAssignment] = useState<Record<string, string>>({});

  // Loads the rescue queue plus the animal list (for linking reports to an
  // intake profile) once the staff member's access is confirmed.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !hasStaffAccess) return;

    void (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Your Clerk session has expired.");
        const [loadedReports, loadedAnimals] = await Promise.all([
          fetchAllRescueReports(token),
          fetchStaffAnimals(token),
        ]);
        setReports(loadedReports);
        setAnimals(loadedAnimals);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Rescue reports could not be loaded.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [getToken, hasStaffAccess, isLoaded, isSignedIn]);

  // Empty-string contacts/notes are normalized to nothing before dispatch so
  // untouched optional fields don't get stored as blank values.
  function normalizeOptional(value: string): string | undefined {
    return value.trim() === "" ? undefined : value.trim();
  }

  // Applies the text search and status filter client-side over the loaded
  // queue, hides resolved reports, and sorts by urgency (Critical first,
  // oldest report first within the same urgency). Sorting runs over the
  // filtered set, so it keeps working while searching or filtering.
  const visibleReports = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return reports
      .filter((report) => report.status !== "closed")
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

  async function handleDispatch(
    event: FormEvent<HTMLFormElement>,
    report: RescueReport,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextStatus = String(form.get("status") ?? "");
    const assignedTo = normalizeOptional(String(form.get("assignedTo") ?? ""));
    const officeNote = normalizeOptional(String(form.get("officeNote") ?? ""));
    const animalId = String(form.get("animalId") ?? "") || undefined;

    // Moving past Under Review (to Assigned/In Progress/Resolved) requires a
    // dispatcher. Mirrored server-side; this keeps the failure message clear.
    const nextStatusIndex = REPORT_STATUSES.indexOf(nextStatus as ReportStatus);
    const hasAssignedTo = Boolean(assignedTo) || Boolean(report.assignedTo);
    if (
      nextStatus !== report.status &&
      nextStatusIndex > REPORT_STATUSES.indexOf("submitted") &&
      !hasAssignedTo
    ) {
      setSavingError("Assign a dispatcher before moving the report past Under Review.");
      return;
    }

    setSavingMessage("");
    setSavingError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Your Clerk session has expired. Please sign in again.");
      const updated = await updateRescueReport(token, report.id, {
        ...(nextStatus !== report.status ? { status: nextStatus } : {}),
        ...(assignedTo !== undefined ? { assignedTo } : {}),
        ...(officeNote !== undefined ? { officeNote } : {}),
        ...(animalId !== undefined ? { animalId } : {}),
      });
      setReports((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
      setSavingMessage(`Report ${updated.reference} updated.`);
    } catch (error) {
      setSavingError(
        error instanceof Error ? error.message : "The rescue report could not be updated.",
      );
    }
  }

  function nextStatusOptions(current: string): ReportStatus[] {
    const currentIndex = REPORT_STATUSES.indexOf(current as ReportStatus);
    if (currentIndex === -1) return [];
    return REPORT_STATUSES.slice(currentIndex + 1);
  }

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
          <p>Dispatching rescue reports is available to authorised team members.</p>
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
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <button type="button" className="brand-button" onClick={() => onNavigate("home")}>
            <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
          </button>
          <div>
            <p className="eyebrow">SPCA operations</p>
            <h1>Rescue report dispatch</h1>
          </div>
        </div>
        <div className="dashboard-header-actions">
          <button
            type="button"
            className="teal-button"
            onClick={() => onNavigate("rescue-report-phone")}
          >
            Log phone report
          </button>
          <div className="user-avatar-circle">
            <UserButton />
          </div>
        </div>
      </header>

      <Breadcrumbs
        trail={[
          { label: "Staff Dashboard", onClick: () => onNavigate("staff-dashboard") },
          { label: "Rescue queue" },
        ]}
      />

      <section className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Rescue reports</p>
            <h2>{visibleReports.length} report{visibleReports.length === 1 ? "" : "s"}</h2>
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
                    : `Status: ${STATUS_BADGE_LABEL[status as ReportStatus]}`}
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

        {savingMessage && <p className="invite-feedback success">{savingMessage}</p>}
        {savingError && <p className="invite-feedback error">{savingError}</p>}

        {isLoading && <SkeletonLoader variant="card" />}
        {!isLoading && loadError && <p className="dashboard-data-state error">{loadError}</p>}
        {!isLoading && !loadError && visibleReports.length === 0 && (
          <p className="dashboard-data-state">No rescue reports match your filters.</p>
        )}

        {!isLoading && !loadError && visibleReports.length > 0 && (
          <div className="rescue-queue">
            {visibleReports.map((report) => {
              const isExpanded = expandedId === report.id;
              const currentStage = CURRENT_STAGE[report.status];
              const hasDispatcher =
                (pendingAssignment[report.id] ?? report.assignedTo ?? "").trim() !== "";
              return (
                <div key={report.id} className={`rescue-card${isExpanded ? " expanded" : ""}`}>
                  <button
                    type="button"
                    className="rescue-summary"
                    onClick={() => setExpandedId(isExpanded ? null : report.id)}
                    aria-expanded={isExpanded}
                  >
                    <div className="rescue-summary-main">
                      <strong className="rescue-summary-ref">{report.reference}</strong>
                      <span className="rescue-summary-loc">
                        {report.location}
                        {report.source === "phone" ? " (phone)" : ""}
                      </span>
                      <span className="rescue-summary-reporter">by {report.reporterName}</span>
                    </div>
                    <div className="rescue-summary-badges">
                      <span className={`rescue-status-badge ${rescueStatusClass(report.status)}`}>
                        {STATUS_BADGE_LABEL[report.status]}
                      </span>
                      <span className={`rescue-assignee-badge${report.assignedTo ? " assigned" : ""}`}>
                        {report.assignedTo ?? "Unassigned"}
                      </span>
                      <span className={`rescue-urgency-badge ${report.urgency}`} title={rescueUrgencyLabel(report.urgency)}>
                        {report.urgency}
                      </span>
                      <span className="rescue-view-action">View / Manage</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="rescue-detail-body">
                      <div className="rescue-progress-tracker" aria-label="Report progress">
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
                          <h3 className="rescue-card-title">Report Details</h3>
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

                        <form
                          className="rescue-dispatch-card"
                          onSubmit={(event) => void handleDispatch(event, report)}
                        >
                          <h3 className="rescue-card-title">Dispatch & Status</h3>

                          <div className="dispatch-field">
                            <span className="dispatch-label">Current status</span>
                            <span className={`rescue-status-badge ${rescueStatusClass(report.status)}`}>
                              {STATUS_BADGE_LABEL[report.status]}
                            </span>
                          </div>

                          <label className="dispatch-field">
                            <span className="dispatch-label">Assign dispatcher</span>
                            <input
                              type="text"
                              name="assignedTo"
                              placeholder="e.g. Jo Vatubua"
                              value={pendingAssignment[report.id] ?? report.assignedTo ?? ""}
                              onChange={(event) =>
                                setPendingAssignment((previous) => ({
                                  ...previous,
                                  [report.id]: event.target.value,
                                }))
                              }
                            />
                          </label>

                          <label className="dispatch-field">
                            <span className="dispatch-label">Link animal profile</span>
                            <select name="animalId" defaultValue={report.animalId ?? ""}>
                              <option value="">No profile linked yet</option>
                              {animals.map((animal) => (
                                <option key={animal.id} value={animal.id}>
                                  {animal.publicId} - {animal.name} ({animal.type})
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="dispatch-field">
                            <span className="dispatch-label">Update status</span>
                            <select name="status" defaultValue={report.status}>
                              <option value={report.status}>
                                {STATUS_BADGE_LABEL[report.status]}
                              </option>
                              {nextStatusOptions(report.status).map((status) => {
                                const locked =
                                  !hasDispatcher &&
                                  REPORT_STATUSES.indexOf(status) >
                                    REPORT_STATUSES.indexOf("submitted");
                                return (
                                  <option key={status} value={status} disabled={locked}>
                                    {locked
                                      ? "Assign a dispatcher first"
                                      : `Move to: ${STATUS_BADGE_LABEL[status]}`}
                                  </option>
                                );
                              })}
                            </select>
                            {!hasDispatcher && nextStatusOptions(report.status).length > 0 && (
                              <span className="dispatch-hint">
                                Assign a dispatcher to unlock status changes.
                              </span>
                            )}
                          </label>

                          <label className="dispatch-field">
                            <span className="dispatch-label">Internal handling notes</span>
                            <textarea
                              name="officeNote"
                              rows={4}
                              placeholder="Notes for your team (not shown to the reporter)"
                              defaultValue={report.officeNote ?? ""}
                            />
                          </label>

                          <button type="submit" className="teal-button dispatch-save">
                            Save Changes
                          </button>
                        </form>
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