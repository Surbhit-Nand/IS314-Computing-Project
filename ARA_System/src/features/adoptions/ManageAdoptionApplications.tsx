import { SignInButton, useAuth, useUser } from "@clerk/react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import spcaLogo from "../../assets/spca-logo.png";
import { SiteHeader, type SiteHeaderView } from "../../components/SiteHeader";
import {
  fetchAdoptionApplicationDetail,
  fetchAllAdoptionApplications,
  updateAdoptionApplication,
} from "../../services/adoptionsApi";
import {
  fetchMyNotifications,
  markAllNotificationsRead,
} from "../../services/notificationsApi";
import {
  adoptionStatusClass,
  adoptionStatusLabel,
  adoptionStatusShortLabel,
  type AdoptionAnimalSummary,
  type AdoptionApplication,
  type AdoptionStatus,
} from "../../types/adoption";
import {
  isGiftAdoption,
  isMinorApplication,
  questionnaireSections,
} from "./AdoptionQuestionnaireAnswers";
import {
  ACTIVE_STATUS_FILTERS,
  HISTORY_STATUS_FILTERS,
  QUEUE_TAB_STATUSES,
  isTerminalAdoptionStatus,
  type AdoptionQueueTab,
} from "./adoptionQueue";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { isDevBypassEnabled } from "../../utils/devBypass";
import { formatDate } from "../../utils/format";
import { Breadcrumbs } from "../../components/Breadcrumbs";

type ManageAdoptionApplicationsProps = {
  onNavigate: (view: SiteHeaderView) => void;
};

const SHORT_STATUS_LABEL: Record<AdoptionStatus, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  completed: "Completed",
  rejected: "Rejected",
};

// Status filter value: "all" plus every lifecycle state (the dropdown
// options themselves adapt to the active tab - see ACTIVE/HISTORY_STATUS_FILTERS).
type QueueStatusFilter = "all" | AdoptionStatus;

// Mirrors ALLOWED_TRANSITIONS in server/src/modules/adoptions/adoptions.service.ts:
// submitted -> under_review/rejected, under_review -> approved/rejected,
// approved -> completed, completed/rejected are terminal.
const NEXT_STATUSES: Record<AdoptionStatus, AdoptionStatus[]> = {
  submitted: ["under_review", "rejected"],
  under_review: ["approved", "rejected"],
  approved: ["completed"],
  completed: [],
  rejected: [],
};

// Copy for the "Medical clearance" row. Lifted out of the JSX because the
// three-way branch reads as an unreadable nested ternary inline.
function clearanceDetail(animal: AdoptionAnimalSummary | null) {
  if (!animal) return "Unknown - animal no longer on record";
  return animal.medicallyCleared
    ? "Cleared by the veterinary team - eligible for approval."
    : "Not yet cleared - a veterinarian must clear this animal before the application can be approved.";
}

// The warning appended to a "Move to" option. Approval reads differently
// depending on whether the vet has cleared the animal yet.
function transitionHint(status: AdoptionStatus, awaitingClearance: boolean) {
  if (status === "approved") {
    return awaitingClearance
      ? " (blocked - animal not medically cleared)"
      : " (this animal can only be approved once)";
  }
  if (status === "completed") return " (removes the animal from public listings)";
  return "";
}

// Staff-only page: the adoption application review queue. Each application
// expands into a review panel where staff read the applicant's answers and
// status history, then move the application forward (or reject it with a
// note that the applicant will see). Reuses the shared operations-queue
// layout classes from the rescue dispatch page so the two functions look
// and behave identically.
export function ManageAdoptionApplications({ onNavigate }: ManageAdoptionApplicationsProps) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const role = user?.publicMetadata.role;
  const hasStaffAccess =
    isDevBypassEnabled ||
    role === "staff" ||
    role === "veterinarian" ||
    role === "manager" ||
    role === "admin";

  const [applications, setApplications] = useState<AdoptionApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [queueTab, setQueueTab] = useState<AdoptionQueueTab>("active");
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Status-history detail per expanded application, fetched on expand.
  const [detailById, setDetailById] = useState<Record<string, AdoptionApplication>>({});
  const [savingMessage, setSavingMessage] = useState("");
  const [savingError, setSavingError] = useState("");
  // Unread "new submission" notifications for the signed-in staffer. The
  // header bell lives on public pages only, so the queue surfaces its own
  // count that the reviewer can acknowledge once they've seen the list.
  const [unreadSubmissions, setUnreadSubmissions] = useState(0);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !hasStaffAccess) return;

    void (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Your Clerk session has expired.");
        setApplications(await fetchAllAdoptionApplications(token));
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Adoption applications could not be loaded.",
        );
      } finally {
        setIsLoading(false);
      }
    })();

    void (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const inbox = await fetchMyNotifications(token);
        setUnreadSubmissions(
          inbox.items.filter((item) => item.type === "adoption.submitted" && !item.readAt).length,
        );
      } catch {
        // The queue itself is the source of truth; a bell failure hides the
        // chip rather than blocking reviews.
      }
    })();
  }, [getToken, hasStaffAccess, isLoaded, isSignedIn]);

  async function acknowledgeSubmissions() {
    try {
      const token = await getToken();
      if (!token) return;
      await markAllNotificationsRead(token);
      setUnreadSubmissions(0);
    } catch {
      // Count syncs on the next visit.
    }
  }

  // Tab counts for the Active/History switch. Computed from the full list
  // so switching tabs never loses the search/filter context.
  const activeCount = applications.filter(
    (application) => !isTerminalAdoptionStatus(application.status),
  ).length;
  const historyCount = applications.length - activeCount;

  function switchTab(tab: AdoptionQueueTab) {
    setQueueTab(tab);
    setStatusFilter("all");
    setExpandedId(null);
  }

  // Newest applications on top; older ones in the same status group below.
  // The tab splits live work (Active) from finished applications (History)
  // before search/status narrow it further.
  const visibleApplications = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const tabStatuses = QUEUE_TAB_STATUSES[queueTab];
    return applications
      .filter((application) => {
        if (!tabStatuses.includes(application.status)) return false;
        if (statusFilter !== "all" && application.status !== statusFilter) return false;
        if (!term) return true;
        return [
          application.animal?.name ?? "",
          application.animal?.publicId ?? "",
          application.applicantClerkUserId,
        ]
          .join(" ")
          .toLowerCase()
          .includes(term);
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [applications, queueTab, searchTerm, statusFilter]);

  async function openDetail(id: string) {
    setExpandedId(id);
    setSavingMessage("");
    setSavingError("");
    if (detailById[id]) return;
    try {
      const token = await getToken();
      if (!token) throw new Error("Your Clerk session has expired.");
      const detail = await fetchAdoptionApplicationDetail(token, id);
      setDetailById((previous) => ({ ...previous, [id]: detail }));
    } catch {
      // The row's own data is enough to render the review panel; only the
      // timestamped history would be missing.
    }
  }

  async function handleReview(event: FormEvent<HTMLFormElement>, application: AdoptionApplication) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextStatus = String(form.get("status") ?? "") as AdoptionStatus;
    const reviewNotes = String(form.get("reviewNotes") ?? "").trim();

    if (nextStatus === "rejected" && reviewNotes === "") {
      setSavingError("Add a review note explaining the rejection so the applicant knows why.");
      return;
    }

    setSavingMessage("");
    setSavingError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Your Clerk session has expired. Please sign in again.");
      const updated = await updateAdoptionApplication(token, application.id, {
        status: nextStatus,
        reviewNotes,
      });
      setApplications((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item)),
      );
      setDetailById((previous) =>
        previous[updated.id] ? { ...previous, [updated.id]: { ...previous[updated.id], ...updated } } : previous,
      );
      setSavingMessage(
        `Application for ${updated.animal?.name ?? "the animal"} moved to ${SHORT_STATUS_LABEL[updated.status]}.`,
      );
    } catch (error) {
      setSavingError(
        error instanceof Error ? error.message : "The adoption application could not be updated.",
      );
    }
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
          <p>Reviewing adoption applications is available to authorised team members.</p>
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
      <SiteHeader isLoaded={isLoaded} isSignedIn={isSignedIn} currentPage="manage-adoption-applications" onNavigate={onNavigate} />
      <header className="workspace-section-head"><p className="eyebrow">SPCA operations</p><h1>Adoption applications</h1><p>Review applications and help each animal find the right home.</p></header>

      <Breadcrumbs
        trail={[
          { label: "Staff Dashboard", onClick: () => onNavigate("staff-dashboard") },
          { label: "Adoption applications" },
        ]}
      />

      <section className="dashboard-panel">
        <div className="queue-tabs" role="tablist" aria-label="Adoption queue sections">
          <button
            type="button"
            role="tab"
            aria-selected={queueTab === "active"}
            className={`queue-tab${queueTab === "active" ? " active" : ""}`}
            onClick={() => switchTab("active")}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={queueTab === "history"}
            className={`queue-tab${queueTab === "history" ? " active" : ""}`}
            onClick={() => switchTab("history")}
          >
            History ({historyCount})
          </button>
        </div>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">
              {queueTab === "active" ? "Needs review" : "Finished applications"}
            </p>
            <h2>{visibleApplications.length} application{visibleApplications.length === 1 ? "" : "s"}</h2>
            {unreadSubmissions > 0 && (
              <button
                type="button"
                className="chip"
                title="New submissions since you last acknowledged them - click to mark seen"
                onClick={() => void acknowledgeSubmissions()}
              >
                {unreadSubmissions} new
              </button>
            )}
          </div>
          <div className="rescue-queue-controls">
            <select
              className="animal-search-input filter-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as QueueStatusFilter)}
              aria-label="Filter by status"
            >
              {["all", ...(queueTab === "active" ? ACTIVE_STATUS_FILTERS : HISTORY_STATUS_FILTERS)].map((status) => (
                <option key={status} value={status}>
                  {status === "all"
                    ? "All statuses"
                    : `Status: ${SHORT_STATUS_LABEL[status as AdoptionStatus]}`}
                </option>
              ))}
            </select>
            <input
              type="search"
              className="animal-search-input"
              placeholder="Search animal, animal ID, applicant..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </div>

        {savingMessage && <p className="invite-feedback success">{savingMessage}</p>}
        {savingError && <p className="invite-feedback error">{savingError}</p>}

        {isLoading && <SkeletonLoader variant="card" />}
        {!isLoading && loadError && <p className="dashboard-data-state error">{loadError}</p>}
        {!isLoading && !loadError && visibleApplications.length === 0 && (
          <p className="dashboard-data-state">
            {queueTab === "history"
              ? "No finished applications yet."
              : "No adoption applications match your filters."}
          </p>
        )}

        {!isLoading && !loadError && visibleApplications.length > 0 && (
          <div className="rescue-queue">
            {visibleApplications.map((application) => {
              const isExpanded = expandedId === application.id;
              const detail = detailById[application.id] ?? application;
              const nextStatuses = NEXT_STATUSES[application.status] ?? [];

              // Only a veterinarian can set animals.medically_cleared (clearAnimal,
              // behind requireVeterinaryAccess) and the server refuses
              // under_review -> approved without it, so flag it here rather than
              // let the reviewer find out from a rejected save. Read off `detail`
              // so an expanded row uses the freshest fetch.
              const awaitingClearance = !!detail.animal && !detail.animal.medicallyCleared;
              return (
                <div key={application.id} className={`rescue-card${isExpanded ? " expanded" : ""}`}>
                  <button
                    type="button"
                    className="rescue-summary"
                    onClick={() => {
                      if (isExpanded) setExpandedId(null);
                      else void openDetail(application.id);
                    }}
                    aria-expanded={isExpanded}
                  >
                    <div className="rescue-summary-main">
                      <strong className="rescue-summary-ref">
                        {application.animal?.name ?? "Animal"}
                        {application.animal ? ` - ${application.animal.publicId}` : ""}
                      </strong>
                      <span className="rescue-summary-loc">
                        Applicant {application.applicantClerkUserId}
                      </span>
                      <span className="rescue-summary-reporter">
                        submitted {formatDate(application.createdAt)}
                      </span>
                    </div>
                    <div className="rescue-summary-badges">
                      {awaitingClearance && (
                        <span
                          className="adoption-clearance-badge"
                          title="A veterinarian has not cleared this animal yet, so this application cannot be approved."
                        >
                          Not cleared
                        </span>
                      )}
                      {isGiftAdoption(application) && (
                        <span
                          className="adoption-clearance-badge"
                          title="This adoption is a gift for someone else - confirm the recipient is ready for a pet."
                        >
                          Gift - extra review
                        </span>
                      )}
                      {isMinorApplication(application) && (
                        <span
                          className="adoption-clearance-badge"
                          title="The applicant is under 18 - guardian details and consent are on file in the application."
                        >
                          Minor - guardian consent on file
                        </span>
                      )}
                      <span className={`adoption-status-badge ${adoptionStatusClass(application.status)}`}>
                        {SHORT_STATUS_LABEL[application.status]}
                      </span>
                      <span className="rescue-view-action">Review</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="rescue-detail-body">
                      <div className="rescue-detail-columns">
                        <div className="rescue-details-card">
                          <h3 className="rescue-card-title">Application Details</h3>
                          <dl className="rescue-details-list">
                            <div className="rescue-detail-field">
                              <dt>Applicant (Clerk ID)</dt>
                              <dd>{application.applicantClerkUserId}</dd>
                            </div>
                            <div className="rescue-detail-field">
                              <dt>Animal</dt>
                              <dd>
                                {application.animal
                                  ? `${application.animal.name} (${application.animal.publicId})`
                                  : "Animal no longer on record"}
                              </dd>
                            </div>
                            <div className="rescue-detail-field">
                              <dt>Medical clearance</dt>
                              <dd>{clearanceDetail(detail.animal)}</dd>
                            </div>
                            <div className="rescue-detail-field">
                              <dt>Date submitted</dt>
                              <dd>
                                {formatDate(application.createdAt)}
                                {application.updatedAt !== application.createdAt
                                  ? ` (updated ${formatDate(application.updatedAt)})`
                                  : ""}
                              </dd>
                            </div>
                            {questionnaireSections(detail).map((section) => (
                              <div key={section.title} className="rescue-detail-field full">
                                <dt>{section.title}</dt>
                                <dd>
                                  {section.rows.map((row) => (
                                    <p key={row.label} className="adoption-answer-row">
                                      <strong>{row.label}:</strong>{" "}
                                      {row.href ? (
                                        <a href={row.href} target="_blank" rel="noreferrer">
                                          {row.value}
                                        </a>
                                      ) : (
                                        row.value
                                      )}
                                    </p>
                                  ))}
                                </dd>
                              </div>
                            ))}
                          </dl>

                          {detail.history && detail.history.length > 0 && (
                            <div className="adoption-history">
                              <h4 className="rescue-card-subtitle">Status history</h4>
                              <ul>
                                {detail.history.map((entry) => (
                                  <li key={entry.id}>
                                    <span className={`adoption-status-badge adoption-history-badge ${adoptionStatusClass(entry.status)}`}>
                                      {SHORT_STATUS_LABEL[entry.status]}
                                    </span>
                                    <span className="adoption-history-when">{formatDate(entry.createdAt)}</span>
                                    {entry.note && <span className="adoption-history-note">{entry.note}</span>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {nextStatuses.length > 0 ? (
                        <form
                          className="rescue-dispatch-card"
                          onSubmit={(event) => void handleReview(event, application)}
                        >
                          <h3 className="rescue-card-title">Review & Status</h3>

                          <div className="dispatch-field">
                            <span className="dispatch-label">Current status</span>
                            <span
                              className={`adoption-status-badge ${adoptionStatusClass(application.status)}`}
                              title={adoptionStatusLabel(application.status)}
                            >
                              {adoptionStatusShortLabel(application.status)}
                            </span>
                          </div>

                          <label className="dispatch-field">
                            <span className="dispatch-label">Move to</span>
                            <select name="status" defaultValue={application.status}>
                              <option value={application.status}>
                                {SHORT_STATUS_LABEL[application.status]}
                              </option>
                              {nextStatuses.map((status) => (
                                <option
                                  key={status}
                                  value={status}
                                  disabled={status === "approved" && awaitingClearance}
                                >
                                  Move to: {SHORT_STATUS_LABEL[status]}
                                  {transitionHint(status, awaitingClearance)}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="dispatch-field">
                            <span className="dispatch-label">
                              Review note
                              <em className="optional-hint">(shown to the applicant)</em>
                            </span>
                            <textarea
                              name="reviewNotes"
                              rows={4}
                              placeholder={
                                nextStatuses.includes("rejected")
                                  ? "Required if rejecting - tell the applicant why."
                                  : "Optional note for the applicant."
                              }
                              defaultValue={application.reviewNotes ?? ""}
                            />
                          </label>

                          {awaitingClearance && (
                            <p className="dispatch-hint">
                              {detail.animal?.name} has not been medically cleared by a
                              veterinarian yet, so this application cannot be approved. Ask the
                              veterinary team to issue clearance first - you can still move it to
                              Under Review or reject it in the meantime.
                            </p>
                          )}

                          <button
                            type="submit"
                            className="teal-button dispatch-save"
                          >
                            Save review
                          </button>
                        </form>
                        ) : (
                          <div className="rescue-dispatch-card">
                            <h3 className="rescue-card-title">Review & Status</h3>
                            <p className="dispatch-hint">
                              This application is {SHORT_STATUS_LABEL[application.status].toLowerCase()} and
                              closed - no further action is needed. The full record stays here
                              for reference.
                            </p>
                          </div>
                        )}
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
