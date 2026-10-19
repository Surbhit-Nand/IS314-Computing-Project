import { SignInButton, useAuth } from "@clerk/react";
import { useEffect, useId, useRef, useState } from "react";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader, type SiteHeaderView } from "../../components/SiteHeader";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import {
  fetchMyAdoptionApplications,
  withdrawAdoptionApplication,
} from "../../services/adoptionsApi";
import {
  adoptionStatusClass,
  adoptionStatusLabel,
  adoptionStepIndex,
  applicantClosureLabel,
  applicantClosureShortLabel,
  ADOPTION_STATUS_STEPS,
  type AdoptionApplication,
  type AdoptionStatus,
  type AdoptionStatusHistoryEntry,
} from "../../types/adoption";
import { questionnaireSections } from "./AdoptionQuestionnaireAnswers";
import { formatDate } from "../../utils/format";

type MyApplicationsProps = {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  onNavigate: (view: SiteHeaderView) => void;
};

// Stepper position for an application. A normal (live) status maps straight to
// its forward step. Rejected and withdrawn are branch/terminal states, not
// steps, so the stepper stops on the furthest stage the status history shows
// was actually visited - a rejected application must never paint "Submitted"
// as though it were still the current stage. An empty history yields reached
// = -1, which leaves every stage unhighlighted (a neutral "closed" read).
function stepperState(
  status: AdoptionStatus,
  history: AdoptionStatusHistoryEntry[],
): { reached: number; stopped: boolean } {
  if (status !== "rejected" && status !== "withdrawn") {
    return { reached: adoptionStepIndex(status), stopped: false };
  }
  let reached = -1;
  for (const entry of history) {
    const index = ADOPTION_STATUS_STEPS.indexOf(entry.status);
    if (index > reached) reached = index;
  }
  return { reached, stopped: reached >= 0 };
}

// The withdraw endpoint returns the updated row without its history, so the
// freshly created "withdrawn" entry is appended locally to keep the modal's
// progress history complete without another round-trip.
function appendWithdrawnEntry(
  application: AdoptionApplication,
  updated: AdoptionApplication,
): AdoptionStatusHistoryEntry[] {
  const history = application.history ?? [];
  if (history.some((entry) => entry.status === "withdrawn")) return history;
  return [
    ...history,
    {
      id: `local-withdrawn-${updated.id}`,
      applicationId: updated.id,
      status: "withdrawn",
      changedByClerkUserId: updated.applicantClerkUserId,
      note: null,
      createdAt: updated.updatedAt,
    },
  ];
}

// Detail modal opened from the "My applications" list: forward-path stepper,
// the application's answers, the staff review note (shown whenever present,
// and highlighted on rejection) and the full timestamped status history.
function AdoptionApplicationDetailModal({
  application,
  history,
  onWithdrawn,
  onClose,
}: {
  application: AdoptionApplication;
  history: AdoptionStatusHistoryEntry[];
  onWithdrawn: (updated: AdoptionApplication) => void;
  onClose: () => void;
}) {
  const headingId = useId();
  const { getToken } = useAuth();
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const { reached, stopped } = stepperState(application.status, history);
  const canWithdraw =
    application.status === "submitted" || application.status === "under_review";

  async function handleWithdraw() {
    if (
      !window.confirm(
        "Withdraw this adoption application? Our team will stop reviewing it and you cannot undo this.",
      )
    ) {
      return;
    }
    setWithdrawError("");
    setIsWithdrawing(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your sign-in session has expired.");
      onWithdrawn(await withdrawAdoptionApplication(token, application.id));
    } catch (error) {
      setWithdrawError(
        error instanceof Error ? error.message : "The adoption application could not be withdrawn.",
      );
    } finally {
      setIsWithdrawing(false);
    }
  }

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
              // ".rejected" is the existing red stop marker; it is reused for
              // withdrawal too, which is likewise a stop rather than a stage.
              className={`adoption-stepper-stage${index < reached ? " passed" : ""}${index === reached ? " current" : ""}${index === reached && stopped ? " rejected" : ""}`}
              aria-current={index === reached ? "step" : undefined}
            >
              <span className="adoption-stepper-dot" aria-hidden="true" />
              <span className="adoption-stepper-label">{adoptionStatusLabel(status).split(" - ")[0]}</span>
            </div>
          ))}
        </div>

        <p className="adoption-status-line">
          <span
            className={`adoption-status-badge ${adoptionStatusClass(application.status)}`}
            title={applicantClosureLabel(application.status)}
          >
            {applicantClosureShortLabel(application.status)}
          </span>
        </p>

        {application.status === "withdrawn" && (
          <p className="security-note">
            {applicantClosureLabel("withdrawn")}. This application is closed and
            will not be reviewed further. You may apply again for this animal.
          </p>
        )}

        {application.status === "rejected" && (
          <div className="adoption-rejection-note">
            <p className="eyebrow">Not this time</p>
            <p>
              {application.reviewNotes ||
                "Our team has decided not to proceed with this application."}
            </p>
          </div>
        )}

        {canWithdraw && (
          <div>
            <button
              type="button"
              className="danger-button"
              onClick={() => void handleWithdraw()}
              disabled={isWithdrawing}
            >
              {isWithdrawing ? "Withdrawing..." : "Withdraw application"}
            </button>
            <p className="security-note">
              Changed your mind? You can withdraw while the application is
              waiting for a decision. This cannot be undone.
            </p>
          </div>
        )}

        {withdrawError && (
          <p className="invite-feedback error" role="alert">
            {withdrawError}
          </p>
        )}

        <dl className="rescue-detail-grid">
          <div className="rescue-detail-item">
            <dt>Date submitted</dt>
            <dd>{formatDate(application.createdAt)}</dd>
          </div>
          <div className="rescue-detail-item full">
            <dt>Animal</dt>
            <dd>
              {application.animal ? application.animal.name : "Animal no longer on record"}
            </dd>
          </div>
          {questionnaireSections(application).map((section) => (
            <div key={section.title} className="rescue-detail-item full">
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
                    {applicantClosureLabel(entry.status)}
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
  const [applications, setApplications] = useState<AdoptionApplication[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [applicationsError, setApplicationsError] = useState("");
  // Bumping this re-runs the loader, powering the "Try again" button below.
  const [reloadKey, setReloadKey] = useState(0);
  // Application whose detail modal is open (null = closed) plus its row. Each
  // /mine row already carries its full status history, so the modal renders
  // straight from it.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<AdoptionApplication | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Increments per openDetail call so a slow response for a row the applicant
  // has since navigated away from is ignored instead of clobbering the modal.
  const detailRequestRef = useRef(0);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    void (async () => {
      setApplicationsLoading(true);
      setApplicationsError("");
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
  }, [getToken, isLoaded, isSignedIn, reloadKey]);

  async function openDetail(id: string) {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;

    // Paint from the loaded row immediately - a request never gates the modal.
    const cached = applications.find((item) => item.id === id) ?? null;
    setSelectedId(id);
    setSelectedDetail(cached);
    setDetailLoading(cached === null);

    try {
      const token = await getToken();
      if (!token) throw new Error("Your Clerk session has expired.");
      // Best-effort freshness pass over the applicant's own list (each row
      // includes its status history). The staff-only single-application
      // endpoint is deliberately not used: it 403s for an applicant.
      const fresh = await fetchMyAdoptionApplications(token);
      if (detailRequestRef.current !== requestId) return;
      setApplications(fresh);
      const row = fresh.find((item) => item.id === id) ?? null;
      if (row) setSelectedDetail(row);
    } catch (error) {
      if (detailRequestRef.current !== requestId) return;
      if (!cached) {
        setApplicationsError(
          error instanceof Error ? error.message : "Your adoption applications could not be loaded.",
        );
      }
    } finally {
      if (detailRequestRef.current === requestId) setDetailLoading(false);
    }
  }

  // Withdrawal returns the updated row (without history), so the new entry is
  // appended locally and both the list and the open modal update in place.
  function applyWithdrawal(updated: AdoptionApplication) {
    setApplications((previous) =>
      previous.map((item) =>
        item.id === updated.id
          ? { ...item, ...updated, history: appendWithdrawnEntry(item, updated) }
          : item,
      ),
    );
    setSelectedDetail((previous) =>
      previous && previous.id === updated.id
        ? { ...previous, ...updated, history: appendWithdrawnEntry(previous, updated) }
        : previous,
    );
  }

  function closeDetail() {
    // Invalidate any in-flight openDetail so its response is discarded.
    detailRequestRef.current += 1;
    setSelectedId(null);
    setSelectedDetail(null);
    setDetailLoading(false);
  }

  return (
    <div className="home-page">
      <SiteHeader
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage="my-applications"
        onNavigate={onNavigate}
      />

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
              <div>
                <p className="dashboard-data-state error" role="alert">
                  {applicationsError}
                </p>
                <button
                  type="button"
                  className="teal-button small-button"
                  onClick={() => setReloadKey((key) => key + 1)}
                >
                  Try again
                </button>
              </div>
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
                    <span
                      className={`adoption-status-badge ${adoptionStatusClass(application.status)}`}
                      title={applicantClosureLabel(application.status)}
                    >
                      {applicantClosureShortLabel(application.status)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
      <SiteFooter />

      {selectedId && !selectedDetail && detailLoading && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal rescue-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Loading adoption application"
          >
            <SkeletonLoader variant="card" />
          </div>
        </div>
      )}

      {selectedId && selectedDetail && (
        <AdoptionApplicationDetailModal
          application={selectedDetail}
          history={selectedDetail.history ?? []}
          onWithdrawn={applyWithdrawal}
          onClose={closeDetail}
        />
      )}
    </div>
  );
}