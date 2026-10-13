import { SignInButton, useAuth, useUser } from "@clerk/react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import spcaLogo from "../assets/spca-logo.png";
import {
  acceptMission,
  completeMissionDebrief,
  fetchMissionBoard,
  fetchMissionHistory,
  fetchMyActiveMissions,
  markIntakeHandoffReceived,
  postRescueUpdate,
  releaseMission,
  startMission,
} from "../services/rescueApi";
import type { MyActiveMissions } from "../services/rescueApi";
import {
  RESCUE_OUTCOME_LABELS,
  RESCUE_UPDATE_TYPE_LABELS,
  isRescueSuccessOutcome,
  rescueStatusClass,
  rescueUrgencyLabel,
} from "../types/rescue";
import type {
  RescueMission,
  RescueOutcome,
  RescueReportStatus,
  RescueUpdateType,
  RescueUrgency,
} from "../types/rescue";
import { isDevBypassEnabled } from "../utils/devBypass";
import { getFreshClerkToken } from "../utils/clerkToken";
import { isDispatcherRole } from "../utils/roles";
import { formatDate, formatDateTime } from "../utils/format";
import { RescueProgressTimeline } from "../features/rescue/RescueProgressTimeline";
import { RescueReadOnlyMap } from "../features/rescue/RescueReadOnlyMap";
import { ProgressImageUpload } from "../features/rescue/ProgressImageUpload";
import { SiteHeader } from "./SiteHeader";
import type { SiteHeaderView } from "./SiteHeader";
import type { NavigateDestination, RescueDetailSource } from "../navigation/araNavigation";

// The views this portal can send the user to. App.tsx's navigate() accepts the
// wider View union, so it type-checks against this narrower signature.
export type PortalView = SiteHeaderView;

export type RescuePage = "rescue-board" | "rescue-active" | "rescue-history";

type RescueOperationsPortalProps = {
  onNavigate: (view: PortalView) => void;
  page?: RescuePage;
  detailMissionId?: string | null;
  detailSource?: RescueDetailSource | null;
  onNavigateDestination: NavigateDestination;
};

// Reporter-facing progress steps shown at the top of a mission's detail page -
// the same lifecycle the reporter sees in My Reports.
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

const STATUS_BADGE_LABEL: Record<RescueReportStatus, string> = {
  submitted: "Under Review",
  assigned: "Assigned",
  in_progress: "In Progress",
  awaiting_reassignment: "Needs Dispatcher",
  resolved: "Resolved",
};

// Compact urgency labels for badges and overview rows; the full label stays in
// the tooltip and in the detail view where space allows.
const URGENCY_SHORT_LABEL: Record<RescueUrgency, string> = {
  critical: "Critical",
  high: "High",
  moderate: "Moderate",
  low: "Low",
};

const URGENCY_TONE: Record<RescueUrgency, string> = {
  critical: "red",
  high: "amber",
  moderate: "yellow",
  low: "blue",
};

// The exact input shape the debrief endpoint accepts (no photos - the debrief
// schema is text-only by design).
type DebriefInput = {
  outcome: RescueOutcome;
  whatHappened: string;
  animalCondition?: string;
  veterinaryPriority?: RescueUrgency;
  unsuccessfulDetails?: string;
};

type RescueSummaryIconName = "inbox" | "refresh" | "clipboard" | "pulse" | "check";

type RescueSummaryCard = {
  key: string;
  label: string;
  value: number;
  tone: "amber" | "red" | "blue" | "green" | "charcoal";
  icon: RescueSummaryIconName;
  description: string;
};

function RescueSummaryIcon({ name }: { name: RescueSummaryIconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "inbox" && (
        <>
          <path d="M4 5.5h16v13H4z" />
          <path d="M4 13h4l1.5 2h5L16 13h4" />
        </>
      )}
      {name === "refresh" && (
        <>
          <path d="M19 8a7.5 7.5 0 0 0-13.2-1.8L4 8" />
          <path d="M4 4v4h4" />
          <path d="M5 16a7.5 7.5 0 0 0 13.2 1.8L20 16" />
          <path d="M20 20v-4h-4" />
        </>
      )}
      {name === "clipboard" && (
        <>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4.5V3h6v1.5M8 10h8M8 14h5" />
        </>
      )}
      {name === "pulse" && <path d="M3 12h4l2-6 4 12 2-6h6" />}
      {name === "check" && (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m8 12 2.7 2.7L16.5 9" />
        </>
      )}
    </svg>
  );
}

// Free-text match used by the shared search box. Case-insensitive over the
// fields a user is most likely to type: reference, location, reporter, animal.
function matchesSearch(mission: RescueMission, term: string): boolean {
  if (!term) return true;
  return [
    mission.reference,
    mission.location,
    mission.reporterName,
    mission.animalType ?? "",
    mission.animalBreed ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(term);
}

// The single Rescue Operations portal - replaces both the dispatcher
// dashboard and the staff "rescue queue" page. Role-aware: dispatchers run
// the mission lifecycle (Accept / Start / update / Debrief); staff follow
// every mission read-only and receive intake handoffs.
export function RescueOperationsPortal({ onNavigate, page = "rescue-board", detailMissionId = null, detailSource = null, onNavigateDestination }: RescueOperationsPortalProps) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const role = user?.publicMetadata.role;
  const isDispatcher = isDispatcherRole(role);
  const isStaffRole = role === "staff" || role === "veterinarian" || role === "manager" || role === "admin";
  // Dispatchers can act; staff modules also manage intake + phone reports.
  // isDevBypassEnabled covers the no-role local-dev case.
  const canAct = isDevBypassEnabled || isDispatcher;
  const canReceiveIntake = isDevBypassEnabled || isStaffRole;
  const hasAccess = isDevBypassEnabled || isDispatcher || isStaffRole;

  const [board, setBoard] = useState<RescueMission[]>([]);
  const [myAssigned, setMyAssigned] = useState<RescueMission[]>([]);
  const [myInProgress, setMyInProgress] = useState<RescueMission[]>([]);
  const [history, setHistory] = useState<RescueMission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  // Mission Board "View Details" opens a modal over the list; Active Mission
  // and Mission History rows open a history-backed detail page. Only the
  // dialog stays local; detailMissionId/detailSource come from App history.
  const [boardModalId, setBoardModalId] = useState<string | null>(null);
  const requestVersion = useRef(0);

  // Navigating between rescue pages resets the local dialog. Restored detail
  // context must remain intact. Adjusting state
  // during render (guarded by an inequality) is the sanctioned React pattern
  // for reacting to a prop change without a cascading effect.
  const [prevPage, setPrevPage] = useState<RescuePage>(page);
  if (prevPage !== page) {
    setPrevPage(page);
    setBoardModalId(null);
  }

  // Loads all three lists together once access is confirmed. After every
  // action the same function re-runs so the Board / Active / History lists
  // refresh immediately from the server, staying honest even if another
  // dispatcher moves a mission.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !hasAccess) return;
    void loadAll();
    return () => { requestVersion.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken, hasAccess, isLoaded, isSignedIn]);

  async function loadAll() {
    const version = ++requestVersion.current;
    try {
      const token = await getFreshClerkToken(getToken);
      if (!token) throw new Error("Your Clerk session has expired.");
      const [nextBoard, nextHistory, nextActive]: [RescueMission[], RescueMission[], MyActiveMissions] =
        await Promise.all([
          fetchMissionBoard(token),
          fetchMissionHistory(token),
          canAct ? fetchMyActiveMissions(token) : Promise.resolve({ assigned: [], inProgress: [] }),
        ]);
      if (version !== requestVersion.current) return;
      setBoard(nextBoard);
      setHistory(nextHistory);
      setMyAssigned(nextActive.assigned);
      setMyInProgress(nextActive.inProgress);
      setLoadError("");
    } catch (error) {
      if (version !== requestVersion.current) return;
      setLoadError(error instanceof Error ? error.message : "Rescue operations could not be loaded.");
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  }

  // The mission shown on a Board details modal (only unassigned/awaiting
  // missions live on the Board). Accepting it moves it off the list, so the
  // modal disappears on its own.
  const boardModalMission = useMemo(
    () => board.find((mission) => mission.id === boardModalId) ?? null,
    [board, boardModalId],
  );

  // The mission shown on an Active / History detail page. A mission opened
  // from Active that just got resolved lives in `history` after the reload, so
  // it keeps rendering read-only there instead of collapsing. If it vanishes
  // entirely, the effect below replaces the entry with its source list.
  const detailMission = useMemo(() => {
    if (!detailMissionId) return null;
    return (
      history.find((mission) => mission.id === detailMissionId) ??
      myAssigned.find((mission) => mission.id === detailMissionId) ??
      myInProgress.find((mission) => mission.id === detailMissionId) ??
      null
    );
  }, [detailMissionId, history, myAssigned, myInProgress]);

  useEffect(() => {
    if (detailMissionId && !isLoading && !loadError && !detailMission) {
      onNavigateDestination({ view: detailSource ?? page }, true);
    }
  }, [detailMissionId, detailMission, detailSource, page, isLoading, loadError, onNavigateDestination]);


  // Shared wrapper for every mutation: clears prior feedback, runs the API
  // call with a fresh Clerk token, then reloads so all tabs reflect the new
  // state (e.g. a just-completed mission leaves Board/Active and shows in
  // History) without the UI keeping its own copy of the truth. Returns true
  // only when the save AND the reload both succeeded, so a caller that must
  // reset its own form (Mission Updates) never clears typed text on a failed
  // save.
  async function runAction(
    successMessage: string,
    action: (token: string) => Promise<unknown>,
  ): Promise<boolean> {
    setActionMessage("");
    setActionError("");
    try {
      const token = await getFreshClerkToken(getToken);
      if (!token) throw new Error("Your Clerk session has expired.");
      await action(token);
      setActionMessage(successMessage);
      await loadAll();
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The action could not be completed.");
      return false;
    }
  }

  async function handleAccept(mission: RescueMission): Promise<boolean> {
    return runAction(
      `${mission.reference} accepted - it is now assigned to you.`,
      (token) => acceptMission(token, mission.id),
    );
  }

  async function handleStart(mission: RescueMission, input: { notes?: string; imageUrls?: string[] }) {
    await runAction(
      `${mission.reference} is now in progress.`,
      (token) => startMission(token, mission.id, input),
    );
  }

  async function handleRelease(mission: RescueMission, reason: string) {
    const isHandover = mission.status === "in_progress";
    await runAction(
      isHandover
        ? `${mission.reference} handed over - it is back on the Mission Board for another dispatcher.`
        : `${mission.reference} released - it is back on the Mission Board for another dispatcher.`,
      (token) => releaseMission(token, mission.id, reason),
    );
  }

  async function handleUpdate(
    mission: RescueMission,
    input: { updateType: RescueUpdateType; message?: string; imageUrls?: string[] },
  ): Promise<boolean> {
    return runAction(
      `Update filed on ${mission.reference}.`,
      (token) => postRescueUpdate(token, mission.id, input),
    );
  }

  async function handleDebrief(mission: RescueMission, input: DebriefInput) {
    await runAction(
      `${mission.reference} is resolved - thank you.`,
      (token) => completeMissionDebrief(token, mission.id, input),
    );
  }

  async function handleMarkReceived(mission: RescueMission) {
    const handoff = mission.intakeHandoff;
    if (!handoff) return;
    await runAction(
      `Intake for ${mission.reference} marked as received.`,
      (token) => markIntakeHandoffReceived(token, handoff.id),
    );
  }

  // One search box shared by every tab, applied to whichever list is showing.
  // Each visible list is derived from its server-grouped source (Board =
  // unassigned submitted alerts only; Active is already split server-side into
  // Assigned / In Progress; History = resolved), so searching and tabbing can
  // never mix groups.
  const search = searchTerm.trim().toLowerCase();
  const activeCount = myAssigned.length + myInProgress.length;
  const visibleBoard = useMemo(
    () => board.filter((mission) => matchesSearch(mission, search)),
    [board, search],
  );
  const visibleAssigned = useMemo(
    () => myAssigned.filter((mission) => matchesSearch(mission, search)),
    [myAssigned, search],
  );
  const visibleInProgress = useMemo(
    () => myInProgress.filter((mission) => matchesSearch(mission, search)),
    [myInProgress, search],
  );
  const visibleHistory = useMemo(
    () => history.filter((mission) => matchesSearch(mission, search)),
    [history, search],
  );

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
          <p>Rescue Operations is available to authorised team members.</p>
          <SignInButton mode="modal">
            <button type="button" className="teal-button">
              Log in
            </button>
          </SignInButton>
        </div>
      </main>
    );
  }

  if (!hasAccess) {
    return (
      <main className="dashboard-locked">
        <div className="dashboard-locked-card">
          <div className="auth-brand">
            <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
            <strong>SPCA Fiji</strong>
          </div>
          <p className="eyebrow">SPCA operations</p>
          <h1>Access restricted</h1>
          <p>Your account does not have dispatcher, staff, veterinary, manager, or admin permissions.</p>
          <button type="button" className="teal-button" onClick={() => onNavigate("home")}>
            Return home
          </button>
        </div>
      </main>
    );
  }

  const staffDashboardView: PortalView = role === "manager" || role === "admin" ? "dashboard" : "staff-dashboard";
  const pageTitle =
    page === "rescue-board" ? "Mission Board" : page === "rescue-active" ? "Active Mission" : "Mission History";
  const pageDescription =
    page === "rescue-board"
      ? null
      : page === "rescue-active"
        ? "Your accepted missions, separated into Assigned and In Progress."
        : "Resolved cases with their timeline, outcome, and debrief.";

  const panelTitle =
    page === "rescue-board"
      ? "Unresolved alerts"
      : page === "rescue-active"
        ? "Assigned & in progress"
        : "Resolved missions";
  const showingAll =
    page === "rescue-board"
      ? visibleBoard.length === board.length
      : page === "rescue-active"
        ? visibleAssigned.length === myAssigned.length && visibleInProgress.length === myInProgress.length
        : visibleHistory.length === history.length;
  const panelNote =
    page === "rescue-board"
      ? showingAll
        ? `${board.length} on the board`
        : `${visibleBoard.length} of ${board.length} alerts shown`
      : page === "rescue-active"
        ? canAct
          ? `${activeCount} mission${activeCount === 1 ? "" : "s"} in your name`
          : "Dispatcher workspace - read-only here"
        : showingAll
          ? `${history.length} resolved · open a case for its timeline and debrief`
          : `${visibleHistory.length} of ${history.length} missions shown`;

  // Compact summary counts feed straight off the server-loaded lists, so they
  // always mirror the live queue. "Needs reassignment" counts released and
  // handed-over alerts sitting back on the board waiting for a new dispatcher.
  // Dispatchers own the full lifecycle; the staff variant sticks to the
  // read-only counts actually available to them.
  const releasedCount = board.filter((mission) => mission.status === "awaiting_reassignment").length;
  const unclaimedCount = board.filter((mission) => mission.status === "submitted").length;
  const summaryCards: RescueSummaryCard[] = canAct
    ? [
        {
          key: "awaiting",
          label: "Awaiting assignment",
          value: unclaimedCount,
          tone: "amber",
          icon: "inbox",
          description: "Waiting for a dispatcher",
        },
        {
          key: "reassign",
          label: "Needs reassignment",
          value: releasedCount,
          tone: "red",
          icon: "refresh",
          description: "Ready for a new dispatcher",
        },
        {
          key: "assigned",
          label: "Assigned",
          value: myAssigned.length,
          tone: "blue",
          icon: "clipboard",
          description: "Accepted and not started",
        },
        {
          key: "progress",
          label: "In progress",
          value: myInProgress.length,
          tone: "green",
          icon: "pulse",
          description: "Rescue underway",
        },
        {
          key: "resolved",
          label: "Resolved",
          value: history.length,
          tone: "charcoal",
          icon: "check",
          description: "Completed rescue missions",
        },
      ]
    : [
        {
          key: "awaiting",
          label: "Awaiting assignment",
          value: unclaimedCount,
          tone: "amber",
          icon: "inbox",
          description: "Waiting for a dispatcher",
        },
        {
          key: "reassign",
          label: "Needs reassignment",
          value: releasedCount,
          tone: "red",
          icon: "refresh",
          description: "Ready for a new dispatcher",
        },
        {
          key: "urgent",
          label: "Critical & high",
          value: board.filter((mission) => mission.urgency === "critical" || mission.urgency === "high").length,
          tone: "red",
          icon: "pulse",
          description: "Urgent open alerts",
        },
        {
          key: "phone",
          label: "Phone alerts",
          value: board.filter((mission) => mission.source === "phone").length,
          tone: "blue",
          icon: "clipboard",
          description: "Reported by phone",
        },
        {
          key: "resolved",
          label: "Resolved",
          value: history.length,
          tone: "charcoal",
          icon: "check",
          description: "Completed rescue missions",
        },
      ];

  // A mission opened from Active Mission or Mission History renders as its own
  // in-portal detail page: the dispatcher navbar stays put, the back link
  // returns to the exact list (search and the open Active tab preserved), and
  // the full detail/actions panel shows read-only or editable as the stage
  // allows.
  if (detailMission) {
    return (
      <main className="dashboard-page rescue-workspace">
        <SiteHeader
          isLoaded={isLoaded}
          isSignedIn={isSignedIn}
          currentPage={detailSource ?? page}
          onNavigate={onNavigate}
        />
        <div className="rescue-container">
          {actionMessage && <p className="invite-feedback success">{actionMessage}</p>}
          {actionError && <p className="invite-feedback error">{actionError}</p>}
          <MissionDetailPage
            key={detailMission.id}
            mission={detailMission}
            source={detailSource}
            canAct={canAct}
            isDispatcher={isDispatcher}
            clerkUserId={user?.id}
            canReceiveIntake={canReceiveIntake}
            getToken={getToken}
            onBack={() => onNavigateDestination({ view: detailSource ?? page })}
            onAccept={() => handleAccept(detailMission)}
            onStart={(input) => handleStart(detailMission, input)}
            onUpdate={(input) => handleUpdate(detailMission, input)}
            onDebrief={(input) => handleDebrief(detailMission, input)}
            onMarkReceived={() => handleMarkReceived(detailMission)}
            onRelease={(reason) => handleRelease(detailMission, reason)}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-page rescue-workspace">
      <SiteHeader isLoaded={isLoaded} isSignedIn={isSignedIn} currentPage={page} onNavigate={onNavigate} />

      <div className="rescue-container">
        <header className="rescue-page-head">
          <div className="rescue-page-head-text">
            {page !== "rescue-board" && (
              <p className="eyebrow">Rescue operations · {canAct ? "Dispatcher workspace" : "Rescue operations team"}</p>
            )}
            <h1>{pageTitle}</h1>
            {pageDescription && <p className="rescue-page-desc">{pageDescription}</p>}
          </div>
          {(canReceiveIntake || !canAct) && (
            <div className="rescue-workspace-actions">
              {canReceiveIntake && (
                <button type="button" className="teal-button" onClick={() => onNavigate("rescue-report-phone")}>
                  Log phone alert
                </button>
              )}
              {!canAct && (
                <button type="button" className="ghost-button" onClick={() => onNavigate(staffDashboardView)}>
                  Dashboard
                </button>
              )}
            </div>
          )}
        </header>

        {page === "rescue-board" && (
          <section className="rescue-summary-cards" aria-label="Rescue summary">
            {summaryCards.map((card) => (
              <article key={card.key} className={`rescue-stat-card tone-${card.tone}`}>
                <span className="rescue-stat-icon">
                  <RescueSummaryIcon name={card.icon} />
                </span>
                <div className="rescue-stat-content">
                  <span className="rescue-stat-label">{card.label}</span>
                  <strong className="rescue-stat-value">{card.value}</strong>
                  <span className="rescue-stat-hint">{card.description}</span>
                </div>
              </article>
            ))}
          </section>
        )}

        {actionMessage && <p className="invite-feedback success">{actionMessage}</p>}
        {actionError && <p className="invite-feedback error">{actionError}</p>}

        <div className="rescue-content-grid">
          <section className="dashboard-panel rescue-main-panel">
            <div className="panel-heading rescue-panel-heading">
              <div>
                <h2>{panelTitle}</h2>
                <p className="rescue-panel-note">{panelNote}</p>
              </div>
              <div className="ops-panel-controls">
                <input
                  type="search"
                  className="animal-search-input"
                  placeholder="Search reference, location, reporter..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  aria-label="Search missions"
                />
              </div>
            </div>

            {isLoading && <p className="dashboard-data-state">Loading rescue missions...</p>}
            {!isLoading && loadError && <p className="dashboard-data-state error">{loadError}</p>}

            {!isLoading && !loadError && page === "rescue-active" && !canAct && (
              <EmptyGroup
                title="Active Mission is a dispatcher workspace"
                hint="Every mission stays visible read-only on the Mission Board and Mission History."
              />
            )}

            {!isLoading && !loadError && page === "rescue-board" && visibleBoard.length === 0 && (
              <EmptyGroup
                title={board.length === 0 ? "No alerts awaiting a dispatcher" : "No alerts match your search"}
                hint={
                  board.length === 0
                    ? "New rescue alerts from the public, phone alerts, and any released or handed-over missions will appear here for a dispatcher to accept."
                    : "Try a different reference, location, or reporter name."
                }
              />
            )}

            {!isLoading && !loadError && page === "rescue-history" && visibleHistory.length === 0 && (
              <EmptyGroup
                title={history.length === 0 ? "No resolved missions yet" : "No missions match your search"}
                hint={
                  history.length === 0
                    ? "Completed missions appear here with their debrief, outcome, and any intake handoff."
                    : "Try a different reference, location, or reporter name."
                }
              />
            )}

            {page === "rescue-board" && visibleBoard.length > 0 && (
              <MissionsList
                missions={visibleBoard}
                group="board"
                onOpen={(mission) => setBoardModalId(mission.id)}
              />
            )}

            {page === "rescue-active" && canAct && (
              <div className="ops-active-groups">
                <section className="ops-mission-group assigned">
                  <div className="ops-group-heading">
                    <div>
                      <p className="eyebrow">Accepted, not started</p>
                      <h3>Assigned <span>{myAssigned.length}</span></h3>
                    </div>
                  </div>
                  {visibleAssigned.length > 0 ? (
                    <MissionsList
                      missions={visibleAssigned}
                      group="assigned"
                      onOpen={(mission) => {
                        onNavigateDestination({ view: "rescue-active", rescueMissionId: mission.id, detailSource: "rescue-active" });
                      }}
                    />
                  ) : (
                    <ActiveGroupEmpty subTab="assigned" sourceCount={myAssigned.length} visibleCount={visibleAssigned.length} />
                  )}
                </section>
                <section className="ops-mission-group in-progress">
                  <div className="ops-group-heading">
                    <div>
                      <p className="eyebrow">Started by you</p>
                      <h3>In Progress <span>{myInProgress.length}</span></h3>
                    </div>
                  </div>
                  {visibleInProgress.length > 0 ? (
                    <MissionsList
                      missions={visibleInProgress}
                      group="in_progress"
                      onOpen={(mission) => {
                        onNavigateDestination({ view: "rescue-active", rescueMissionId: mission.id, detailSource: "rescue-active" });
                      }}
                    />
                  ) : (
                    <ActiveGroupEmpty subTab="in_progress" sourceCount={myInProgress.length} visibleCount={visibleInProgress.length} />
                  )}
                </section>
              </div>
            )}

            {page === "rescue-history" && visibleHistory.length > 0 && (
              <MissionsList
                missions={visibleHistory}
                group="history"
                onOpen={(mission) => {
                  onNavigateDestination({ view: "rescue-history", rescueMissionId: mission.id, detailSource: "rescue-history" });
                }}
              />
            )}
          </section>

          <RescueSidePanel page={page} board={board} assigned={myAssigned} inProgress={myInProgress} history={history} />
        </div>
      </div>

      {boardModalMission && (
        <BoardMissionModal
          mission={boardModalMission}
          canAct={canAct}
          isDispatcher={isDispatcher}
          onClose={() => setBoardModalId(null)}
          onAccept={() => handleAccept(boardModalMission)}
        />
      )}
    </main>
  );
}

// The dedicated detail page for a mission opened from Active Mission or
// Mission History. It keeps the dispatcher navbar, adds a clear back link to
// the exact list it came from (preserving the search term and the active
// group), and renders the full detail/actions panel - read-only for resolved
// missions, interactive for an assigned/in-progress mission the dispatcher owns.
function MissionDetailPage({
  mission,
  source,
  canAct,
  isDispatcher,
  clerkUserId,
  canReceiveIntake,
  getToken,
  onBack,
  onAccept,
  onStart,
  onUpdate,
  onDebrief,
  onMarkReceived,
  onRelease,
}: {
  mission: RescueMission;
  source: "rescue-active" | "rescue-history" | null;
  canAct: boolean;
  isDispatcher: boolean;
  clerkUserId: string | undefined;
  canReceiveIntake: boolean;
  getToken: () => Promise<string | null>;
  onBack: () => void;
  onAccept: () => Promise<boolean>;
  onStart: (input: { notes?: string; imageUrls?: string[] }) => Promise<void>;
  onUpdate: (input: { updateType: RescueUpdateType; message?: string; imageUrls?: string[] }) => Promise<boolean>;
  onDebrief: (input: DebriefInput) => Promise<void>;
  onMarkReceived: () => Promise<void>;
  onRelease: (reason: string) => Promise<void>;
}) {
  const isOwner = clerkUserId != null && mission.assignedToClerkUserId === clerkUserId;
  const isResolvedDispatcherView = canAct && mission.status === "resolved";
  const backLabel = source === "rescue-history" ? "Mission History" : "Active Mission";
  return (
    <div className={`rescue-detail-page${isResolvedDispatcherView ? " rescue-history-page" : ""}`}>
      <div className="rescue-detail-page-head">
        <div className="rescue-detail-page-head-text">
          <p className="eyebrow">
            Rescue operations · {isResolvedDispatcherView ? "Mission history" : canAct ? "Dispatcher workspace" : "Rescue operations team"}
          </p>
          <h1>
            {mission.reference}{" "}
            <span className={`rescue-status-badge ${rescueStatusClass(mission.status)}`}>
              {STATUS_BADGE_LABEL[mission.status]}
            </span>
          </h1>
        </div>
        <button type="button" className="ghost-button rescue-detail-back" onClick={onBack}>
          <span aria-hidden="true">←</span> Back to {backLabel}
        </button>
      </div>
      <MissionDetail
        key={mission.id}
        mission={mission}
        canAct={canAct}
        isDispatcher={isDispatcher}
        isOwner={isOwner}
        canReceiveIntake={canReceiveIntake}
        getToken={getToken}
        onAccept={onAccept}
        onStart={onStart}
        onUpdate={onUpdate}
        onDebrief={onDebrief}
        onMarkReceived={onMarkReceived}
        onRelease={onRelease}
      />
    </div>
  );
}

// Mission Board "View Details" modal. Informational (alert facts, photos,
// location/map, urgency) plus the Accept action and directions - the full
// timeline and mission log live on the Active / History detail pages after a
// dispatcher takes the case. Managed entirely by portal state, so the board
// behind it (and its search) survives the open/close.
function BoardMissionModal({
  mission,
  canAct,
  isDispatcher,
  onClose,
  onAccept,
}: {
  mission: RescueMission;
  canAct: boolean;
  isDispatcher: boolean;
  onClose: () => void;
  onAccept: () => Promise<boolean>;
}) {
  const hasPin = mission.latitude != null && mission.longitude != null;
  const isHandedOver = mission.status === "awaiting_reassignment";
  const reassignmentNote = [...mission.progress].reverse().find((entry) => entry.toStatus === "awaiting_reassignment");
  const directionsUrl = hasPin
    ? `https://www.google.com/maps/dir/?api=1&destination=${mission.latitude},${mission.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mission.location)}`;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal board-mission-modal" role="dialog" aria-modal="true" aria-label={`${mission.reference} details`}>
        <div className="modal-header board-mission-header">
          <div className="board-mission-heading">
            <p className="eyebrow">Mission Board · alert details</p>
            <h2>{mission.reference}</h2>
            <div className="board-mission-header-badges">
              <span className={`rescue-status-badge ${rescueStatusClass(mission.status)}`}>
                {STATUS_BADGE_LABEL[mission.status]}
              </span>
              <span className={`ops-urgency-badge ${mission.urgency}`} title={rescueUrgencyLabel(mission.urgency)}>
                <span className="ops-urgency-dot" aria-hidden="true" />
                {URGENCY_SHORT_LABEL[mission.urgency]}
              </span>
              {isHandedOver && <span className="ops-case-reassign-tag board-mission-reassign-badge">Needs reassignment</span>}
            </div>
          </div>
          <button
            type="button"
            className="ghost-button modal-close"
            onClick={onClose}
            aria-label="Close details"
            title="Close details"
          >
            ×
          </button>
        </div>

        {isHandedOver && reassignmentNote && (
          <p className="board-mission-note">
            <strong>Why it needs a new dispatcher:</strong>{" "}
            {reassignmentNote.notes || "Released by the previous dispatcher."}
          </p>
        )}

        <div className="board-mission-columns">
          <section className="board-mission-details-card" aria-label="Alert details">
            <div className="board-mission-section-heading">
              <div>
                <p className="eyebrow">Report overview</p>
                <h3>Alert Details</h3>
              </div>
            </div>

            <div className="board-mission-detail-groups">
              <div className="board-mission-detail-group">
                <h4>Animal</h4>
                <dl className="rescue-details-list board-mission-fields">
                  <div className="rescue-detail-field">
                    <dt>Animal type</dt>
                    <dd>{mission.animalType ?? "Unknown"}</dd>
                  </div>
                  <div className="rescue-detail-field">
                    <dt>Breed</dt>
                    <dd>{mission.animalBreed || "Not recorded"}</dd>
                  </div>
                  <div className="rescue-detail-field full">
                    <dt>Description and condition</dt>
                    <dd>{mission.conditionDescription}</dd>
                  </div>
                </dl>
              </div>

              <div className="board-mission-detail-group">
                <h4>Report and location</h4>
                <dl className="rescue-details-list board-mission-fields">
                  <div className="rescue-detail-field full">
                    <dt>Full location</dt>
                    <dd>{mission.location}</dd>
                  </div>
                  <div className="rescue-detail-field">
                    <dt>Source</dt>
                    <dd>{mission.source === "phone" ? "Phone alert" : "Online report"}</dd>
                  </div>
                  <div className="rescue-detail-field">
                    <dt>Date reported</dt>
                    <dd>{formatDate(mission.createdAt)}</dd>
                  </div>
                </dl>
              </div>

              <div className="board-mission-detail-group">
                <h4>Reporter</h4>
                <dl className="rescue-details-list board-mission-fields">
                  <div className="rescue-detail-field">
                    <dt>Reporter</dt>
                    <dd>{mission.reporterName || "Anonymous alert"}</dd>
                  </div>
                  <div className="rescue-detail-field">
                    <dt>Contact details</dt>
                    <dd>
                      <span className="board-mission-contact-line">
                        {mission.reporterPhone ? `Phone: ${mission.reporterPhone}` : "No phone provided"}
                      </span>
                      <span className="board-mission-contact-line">
                        {mission.reporterEmail ? `Email: ${mission.reporterEmail}` : "No email provided"}
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {mission.photoUrls.length > 0 && (
              <div className="rescue-detail-photo-block board-mission-block">
                <h4 className="rescue-card-subtitle">Submitted photos</h4>
                <div className="rescue-detail-photos board-mission-photos">
                  {mission.photoUrls.map((photoUrl) => (
                    <a key={photoUrl} href={photoUrl} target="_blank" rel="noreferrer">
                      <img src={photoUrl} alt={`${mission.reference} submitted photo`} />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="board-mission-location-card" aria-label="Location and action">
            <div className="board-mission-section-heading">
              <div>
                <p className="eyebrow">Saved alert location</p>
                <h3>Location &amp; action</h3>
              </div>
            </div>
            <p className="board-mission-map-address">{mission.location}</p>

            {hasPin ? (
              <div className="board-mission-map">
                <RescueReadOnlyMap latitude={mission.latitude!} longitude={mission.longitude!} />
              </div>
            ) : (
              <div className="board-mission-map-empty">
                <strong>No map pin was saved.</strong>
                <span>The report location is shown above and can be used for directions.</span>
              </div>
            )}

            {canAct && (
              <div className="board-mission-map-tools">
                <a className="ghost-button board-mission-direction" href={directionsUrl} target="_blank" rel="noreferrer">
                  Get directions
                </a>
              </div>
            )}

            <div className="board-mission-action-area">
              {canAct && <MissionAcceptButton isHandedOver={isHandedOver} onAccept={onAccept} onSuccess={onClose} />}
              {!canAct && isDispatcher && (
                <p className="board-mission-readonly">Dispatchers accept missions from their own queue.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// Renders one group of mission cards as compact rows. Clicking a row opens it
// where it belongs: the Mission Board shows a details modal over the board,
// while Active Mission / Mission History open the mission on its own detail
// page. `group` drives the per-stage left accent (Assigned vs In Progress) so
// an active mission reads differently at a glance.
function MissionsList({
  missions,
  group,
  onOpen,
}: {
  missions: RescueMission[];
  group: "board" | "assigned" | "in_progress" | "history";
  onOpen: (mission: RescueMission) => void;
}) {
  if (missions.length === 0) return null;

  return (
    <div className="ops-case-list">
      <div
        className={`ops-case-columns ops-case-grid${
          group === "board"
            ? " ops-case-columns-board"
            : group === "assigned" || group === "in_progress"
              ? " ops-case-columns-active"
              : ""
        }`}
        aria-hidden="true"
      >
        <span>Case</span>
        <span>Location &amp; reporter</span>
        <span>Urgency</span>
        <span />
      </div>
      {missions.map((mission) => (
        <div
          key={mission.id}
          className={`ops-case${
            group === "assigned"
              ? " ops-case--assigned"
              : group === "in_progress"
                ? " ops-case--in-progress"
                : mission.status === "awaiting_reassignment"
                  ? " ops-case--reassign"
                  : ""
          }`}
        >
          <button
            type="button"
            className="ops-case-row ops-case-grid"
            onClick={() => onOpen(mission)}
            aria-label={`Open details for ${mission.reference}`}
          >
            <span className="ops-case-cell">
              <strong className="ops-case-ref">{mission.reference}</strong>
              {mission.status === "awaiting_reassignment" && (
                <span className="ops-case-reassign-tag">Needs reassignment</span>
              )}
            </span>
            <span className="ops-case-cell">
              <span className="ops-case-loc">
                {mission.location}
                {mission.source === "phone" ? " · phone alert" : ""}
              </span>
              <span className="ops-case-reporter">
                {mission.reporterName ? `Reported by ${mission.reporterName}` : "Anonymous alert"}
              </span>
            </span>
            <span className="ops-case-cell">
              <span
                className={`ops-urgency-badge ${mission.urgency}`}
                title={rescueUrgencyLabel(mission.urgency)}
              >
                <span className="ops-urgency-dot" aria-hidden="true" />
                {URGENCY_SHORT_LABEL[mission.urgency]}
              </span>
            </span>
            <span className="ops-view-details">
              <span>View Details</span>
              <span className="ops-chevron" aria-hidden="true">
                ›
              </span>
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}

// A friendly empty state used when a group has no rows at all (or a search
// filtered every row out). Rendered in place of the mission list.
function EmptyGroup({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="ops-empty">
      <span className="ops-empty-mark" aria-hidden="true" />
      <p className="ops-empty-title">{title}</p>
      <p className="ops-empty-hint">{hint}</p>
    </div>
  );
}

// The Active Mission workspace's empty state, mirroring whichever sub-tab the
// dispatcher is on (Assigned vs In Progress) so the guidance matches the tab.
function ActiveGroupEmpty({
  subTab,
  sourceCount,
  visibleCount,
}: {
  subTab: "assigned" | "in_progress";
  sourceCount: number;
  visibleCount: number;
}) {
  if (visibleCount > 0) return null;
  if (sourceCount > 0) {
    return (
      <EmptyGroup
        title="No missions match your search"
        hint="Try a different reference, location, or reporter name."
      />
    );
  }
  return subTab === "assigned" ? (
    <EmptyGroup
      title="No assigned missions"
      hint="Accept an alert from the Mission Board and it moves to Assigned."
    />
  ) : (
    <EmptyGroup
      title="No missions in progress"
      hint="Start an assigned mission and it moves to In Progress automatically."
    />
  );
}

// The compact right-hand overview beside the case list. Each page surfaces the
// most relevant split of real, loaded data - the urgency mix of the open
// queue, the dispatcher's workload by stage, or the debrief outcomes of the
// resolved backlog. Bars are relative to the group total and hidden when a
// group has nothing yet.
function RescueSidePanel({
  page,
  board,
  assigned,
  inProgress,
  history,
}: {
  page: RescuePage;
  board: RescueMission[];
  assigned: RescueMission[];
  inProgress: RescueMission[];
  history: RescueMission[];
}) {
  const urgencyRows = (missions: RescueMission[]) =>
    (["critical", "high", "moderate", "low"] as RescueUrgency[]).map((urgency) => ({
      label: URGENCY_SHORT_LABEL[urgency],
      count: missions.filter((mission) => mission.urgency === urgency).length,
      tone: URGENCY_TONE[urgency],
    }));

  const outcomeRows = () => {
    const counts = new Map<RescueOutcome, number>();
    for (const mission of history) {
      const outcome = mission.debrief?.outcome;
      if (outcome) counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
    }
    return (Object.keys(RESCUE_OUTCOME_LABELS) as RescueOutcome[])
      .filter((outcome) => (counts.get(outcome) ?? 0) > 0)
      .map((outcome) => ({
        label: RESCUE_OUTCOME_LABELS[outcome],
        count: counts.get(outcome) as number,
        tone: "teal",
      }));
  };

  const title =
    page === "rescue-board" ? "Priority overview" : page === "rescue-active" ? "Workload overview" : "Outcome overview";
  const note =
    page === "rescue-board"
      ? null
      : page === "rescue-active"
        ? "Your missions by stage and urgency."
        : "Debrief outcomes across resolved missions.";

  const groups =
    page === "rescue-board"
      ? [{ title: "Open urgency", rows: urgencyRows(board) }]
      : page === "rescue-active"
        ? [
            {
              title: "Stage",
              rows: [
                { label: "Assigned", count: assigned.length, tone: "teal" },
                { label: "In progress", count: inProgress.length, tone: "green" },
              ],
            },
            { title: "Open urgency", rows: urgencyRows([...assigned, ...inProgress]) },
          ]
        : [{ title: "Outcomes", rows: outcomeRows() }];

  return (
    <aside className="rescue-side-panel" aria-label={title}>
      <h3>{title}</h3>
      {note && <p className="rescue-side-note">{note}</p>}
      {groups.map((group) => {
        const total = group.rows.reduce((sum, row) => sum + row.count, 0);
        return (
          <div key={group.title} className="rescue-side-group">
            {page !== "rescue-board" && <p className="rescue-side-group-title">{group.title}</p>}
            <div className="rescue-side-rows">
              {group.rows.map((row) => {
                const pct = total === 0 ? 0 : (row.count / total) * 100;
                const width = row.count > 0 && pct < 8 ? 8 : pct;
                return (
                  <div key={row.label} className="rescue-side-row">
                    <div className="rescue-side-row-head">
                      <span>{row.label}</span>
                      <span>{row.count}</span>
                    </div>
                    <div className="rescue-side-track">
                      <div
                        className={`rescue-side-fill tone-${row.tone}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {total === 0 && <p className="rescue-side-empty">Nothing to show yet.</p>}
            </div>
          </div>
        );
      })}
    </aside>
  );
}

// The full detail/actions panel for one mission: the progress tracker, the
// generated mission summary, the report details + map + photos, the
// dispatcher's action forms (or read-only state), the in-rescue quick updates,
// the debrief, and any intake handoff.
function MissionDetail({
  mission,
  canAct,
  isDispatcher,
  isOwner,
  canReceiveIntake,
  getToken,
  onAccept,
  onStart,
  onUpdate,
  onDebrief,
  onMarkReceived,
  onRelease,
}: {
  mission: RescueMission;
  canAct: boolean;
  isDispatcher: boolean;
  isOwner: boolean;
  canReceiveIntake: boolean;
  getToken: () => Promise<string | null>;
  onAccept: () => Promise<boolean>;
  onStart: (input: { notes?: string; imageUrls?: string[] }) => Promise<void>;
  onUpdate: (input: { updateType: RescueUpdateType; message?: string; imageUrls?: string[] }) => Promise<boolean>;
  onDebrief: (input: DebriefInput) => Promise<void>;
  onMarkReceived: () => Promise<void>;
  onRelease: (reason: string) => Promise<void>;
}) {
  const currentStage = CURRENT_STAGE[mission.status];
  const isResolvedDispatcherView = canAct && mission.status === "resolved";
  const hasPin = mission.latitude != null && mission.longitude != null;
  const canAccept = canAct && (mission.status === "submitted" || mission.status === "awaiting_reassignment") && !mission.assignedToClerkUserId;
  const canStart = canAct && isOwner && mission.status === "assigned";
  const canWork = canAct && isOwner && mission.status === "in_progress";
  // A released/handed-over alert can be given up again only by whoever is now
  // holding it; it is accepted from the board while unassigned.
  const canRelease = canAct && isOwner && (mission.status === "assigned" || mission.status === "in_progress");
  const isHandedOver =
    mission.status === "awaiting_reassignment" &&
    mission.progress[mission.progress.length - 1]?.fromStatus === "in_progress";
  const reassignmentNote = [...mission.progress]
    .reverse()
    .find((entry) => entry.toStatus === "awaiting_reassignment");
  const directionsUrl = hasPin
    ? `https://www.google.com/maps/dir/?api=1&destination=${mission.latitude},${mission.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mission.location)}`;
  // Long histories start collapsed to a manageable count; dispatchers can
  // reveal the rest instead of scrolling past years of updates. Keyed by
  // mission.id at the call site so the count resets between missions.
  const [updatesToShow, setUpdatesToShow] = useState(5);
  const hiddenUpdates = mission.updates.length - updatesToShow;

  return (
    <div className={`rescue-detail-body${isResolvedDispatcherView ? " rescue-history-body" : ""}`}>
      <div className="rescue-progress-tracker" aria-label="Mission progress">
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

      <div className={isResolvedDispatcherView ? "rescue-history-overview" : "rescue-detail-columns"}>
        <div className="rescue-details-card">
          <h3 className="rescue-card-title">Alert Details</h3>
          <dl className="rescue-details-list">
            <div className="rescue-detail-field">
              <dt>Reference number</dt>
              <dd>{mission.reference}</dd>
            </div>
            <div className="rescue-detail-field">
              <dt>Animal type</dt>
              <dd>{mission.animalType ?? "Not recorded"}</dd>
            </div>
            <div className="rescue-detail-field">
              <dt>Breed / description</dt>
              <dd>{mission.animalBreed || "Not recorded"}</dd>
            </div>
            <div className="rescue-detail-field">
              <dt>Urgency</dt>
              <dd>{rescueUrgencyLabel(mission.urgency)}</dd>
            </div>
            <div className="rescue-detail-field full">
              <dt>Condition / observation</dt>
              <dd>{mission.conditionDescription}</dd>
            </div>
            <div className="rescue-detail-field full">
              <dt>Location</dt>
              <dd>
                {mission.location}
                {mission.latitude != null && mission.longitude != null ? (
                  <>
                    {" "}
                    -{" "}
                    <a
                      href={`https://www.google.com/maps?q=${mission.latitude},${mission.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {mission.latitude.toFixed(5)}, {mission.longitude.toFixed(5)}
                    </a>
                  </>
                ) : null}
              </dd>
            </div>
            <div className="rescue-detail-field">
              <dt>Reporter</dt>
              <dd>
                {mission.reporterName}
                {mission.reporterPhone ? <span> - {mission.reporterPhone}</span> : null}
              </dd>
            </div>
            <div className="rescue-detail-field">
              <dt>Contact</dt>
              <dd>{mission.reporterEmail || "No email provided"}</dd>
            </div>
            <div className="rescue-detail-field">
              <dt>Reported</dt>
              <dd>{formatDate(mission.createdAt)}</dd>
            </div>
            <div className="rescue-detail-field">
              <dt>Source</dt>
              <dd>{mission.source === "phone" ? "Phone call" : "Online form"}</dd>
            </div>
          </dl>

          {hasPin && (
            <div className="rescue-detail-photo-block">
              <h4 className="rescue-card-subtitle">Location map</h4>
              <RescueReadOnlyMap latitude={mission.latitude as number} longitude={mission.longitude as number} />
            </div>
          )}

          {mission.photoUrls.length > 0 && (
            <div className="rescue-detail-photo-block">
              <h4 className="rescue-card-subtitle">Submitted photo</h4>
              <div className="rescue-detail-photos">
                {mission.photoUrls.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt={`Photo for ${mission.reference}`} />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {isResolvedDispatcherView ? (
          <ResolvedMissionDebrief mission={mission} />
        ) : (
          <div className="rescue-dispatch-card">
          <h3 className="rescue-card-title">Mission Actions</h3>
          <div className="dispatch-field">
            <span className="dispatch-label">Current status</span>
            <span className={`rescue-status-badge ${rescueStatusClass(mission.status)}`}>
              {STATUS_BADGE_LABEL[mission.status]}
            </span>
          </div>
          <div className="dispatch-field">
            <span className="dispatch-label">Dispatcher</span>
            <strong>{mission.assignedTo ?? "Available for a dispatcher to accept"}</strong>
          </div>
          {mission.assignedAt && (
            <div className="dispatch-field">
              <span className="dispatch-label">Assigned on</span>
              <strong>{formatDate(mission.assignedAt)}</strong>
            </div>
          )}
          {mission.officeNote && (
            <div className="dispatch-field">
              <span className="dispatch-label">Internal handling notes</span>
              <p>{mission.officeNote}</p>
            </div>
          )}

          {mission.status === "awaiting_reassignment" && (
            <div className="dispatch-field dispatch-note">
              <span className="dispatch-label">Why it needs a new dispatcher</span>
              <p>
                {reassignmentNote?.notes ? `"${reassignmentNote.notes}"` : "The previous dispatcher gave this alert up."}{" "}
                {reassignmentNote?.dispatcherName ? `- ${reassignmentNote.dispatcherName}.` : ""}
              </p>
            </div>
          )}

          {canAct && isDispatcher && (
            <a
              className="teal-button dispatch-save"
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Directions
            </a>
          )}

          {canAccept && <MissionAcceptButton isHandedOver={isHandedOver} onAccept={onAccept} />}

          {canStart && <StartMissionForm getToken={getToken} onStart={onStart} />}

          {canRelease && <ReleaseMissionForm isHandover={mission.status === "in_progress"} onRelease={onRelease} />}

          {mission.status === "assigned" && canAct && !isOwner && (
            <p className="dispatch-form-hint">
              This mission is assigned to another dispatcher. It will move on once they start it.
            </p>
          )}

          {(mission.status === "submitted" || mission.status === "awaiting_reassignment") &&
            canAct &&
            mission.assignedToClerkUserId && (
              <p className="dispatch-form-hint">
                This alert has already been accepted - it cannot be accepted twice.
              </p>
            )}

          {canWork && <QuickUpdateForm getToken={getToken} onUpdate={onUpdate} />}
          {canWork && <DebriefForm onDebrief={onDebrief} />}

          {mission.status === "resolved" && (
            <p className="dispatch-form-hint">
              This mission is resolved and read-only. Its full timeline, debrief, and any intake handoff are
              shown below.
            </p>
          )}
          </div>
        )}
      </div>

      {isResolvedDispatcherView ? (
        <div className="rescue-history-lower-grid">
          <div className="rescue-progress-block rescue-history-updates-card">
            <h4 className="rescue-card-subtitle">Mission updates</h4>
            {mission.updates.length > 0 ? (
              <>
                <ol className="rescue-activity-timeline">
                  {mission.updates.slice(0, updatesToShow).map((update) => (
                    <MissionUpdateEntry key={update.id} update={update} />
                  ))}
                </ol>
                {hiddenUpdates > 0 && (
                  <button
                    type="button"
                    className="ghost-button rescue-show-more"
                    onClick={() => setUpdatesToShow(mission.updates.length)}
                  >
                    Show {hiddenUpdates} more update{hiddenUpdates === 1 ? "" : "s"}
                  </button>
                )}
              </>
            ) : (
              <p className="rescue-history-empty">No mission updates were filed for this rescue.</p>
            )}
          </div>
          <div className="rescue-history-progress-card">
            <RescueProgressTimeline report={mission} compact />
          </div>
        </div>
      ) : (
        <>
          {mission.updates.length > 0 && (
            <div className="rescue-progress-block">
              <h4 className="rescue-card-subtitle">Mission updates</h4>
              <ol className="rescue-activity-timeline">
                {mission.updates.slice(0, updatesToShow).map((update) => (
                  <MissionUpdateEntry key={update.id} update={update} />
                ))}
              </ol>
              {hiddenUpdates > 0 && (
                <button
                  type="button"
                  className="ghost-button rescue-show-more"
                  onClick={() => setUpdatesToShow(mission.updates.length)}
                >
                  Show {hiddenUpdates} more update{hiddenUpdates === 1 ? "" : "s"}
                </button>
              )}
            </div>
          )}

          {mission.debrief && <DebriefSummary mission={mission} />}

          {mission.intakeHandoff && <IntakeHandoffSummary mission={mission} canReceiveIntake={canReceiveIntake} onMarkReceived={onMarkReceived} />}

          <RescueProgressTimeline report={mission} />
        </>
      )}
    </div>
  );
}

function MissionAcceptButton({
  isHandedOver,
  onAccept,
  onSuccess,
}: {
  isHandedOver: boolean;
  onAccept: () => Promise<boolean>;
  onSuccess?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    setError("");
    setSubmitting(true);
    try {
      const saved = await onAccept();
      if (saved) onSuccess?.();
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "The mission could not be accepted.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dispatch-form">
      <p className="dispatch-form-hint">
        {isHandedOver ? (
          <>
            Accepting a <strong>handed-over</strong> mission keeps every update already filed and resumes it at{" "}
            <strong>In Progress</strong>.
          </>
        ) : (
          <>
            Accepting assigns this alert to you and moves it to <strong>Assigned</strong>. Once en route you can
            start it without filling a form.
          </>
        )}
      </p>
      {error && <p className="invite-feedback error">{error}</p>}
      <button type="button" className="teal-button dispatch-save" onClick={() => void handleClick()} disabled={submitting}>
        {submitting ? "Accepting mission..." : "Accept Mission"}
      </button>
    </div>
  );
}

// Start Mission: notes and photos are optional - an en-route dispatcher is
// never blocked at a form. Anything entered is still saved to the timeline.
function StartMissionForm({
  getToken,
  onStart,
}: {
  getToken: () => Promise<string | null>;
  onStart: (input: { notes?: string; imageUrls?: string[] }) => Promise<void>;
}) {
  const notesId = useId();
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(input: { notes?: string; imageUrls?: string[] }) {
    setError("");
    setSubmitting(true);
    try {
      await onStart(input);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "The mission could not be started.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="dispatch-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit({ notes: notes.trim() || undefined, imageUrls: images });
      }}
    >
      <p className="dispatch-form-hint">
        Start work on this mission. Notes are <strong>optional</strong> - the status will move to{" "}
        <strong>In Progress</strong>.
      </p>
      <div className="dispatch-field">
        <label className="dispatch-label" htmlFor={notesId}>
          Notes / action plan <em className="optional-hint">(optional)</em>
        </label>
        <textarea
          id={notesId}
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional - what you plan to do, or anything worth recording at the start..."
          disabled={submitting}
        />
      </div>
      <ProgressImageUpload value={images} onChange={setImages} getToken={getToken} disabled={submitting} />
      {error && <p className="invite-feedback error">{error}</p>}
      <div className="rescue-confirm-actions">
        <button type="submit" className="teal-button dispatch-save" disabled={submitting}>
          {submitting ? "Starting mission..." : "Start Mission"}
        </button>
      </div>
    </form>
  );
}

// Release Mission (Assigned) / Request Handover (In Progress): the assigned
// dispatcher gives the alert up. The reason is required and lands on the
// timeline so the next dispatcher knows why. A handed-over rescue keeps its
// mission updates and resumes In Progress for the next dispatcher.
function ReleaseMissionForm({
  isHandover,
  onRelease,
}: {
  isHandover: boolean;
  onRelease: (reason: string) => Promise<void>;
}) {
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(reasonToSend: string) {
    setError("");
    setSubmitting(true);
    try {
      await onRelease(reasonToSend);
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : "The mission could not be released.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="dispatch-form"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = reason.trim();
        if (!trimmed) {
          setError("A short reason is required.");
          return;
        }
        void submit(trimmed);
      }}
    >
      <p className="dispatch-form-hint">
        {isHandover ? (
          <>
            Handing over keeps every update already filed and returns this alert to the Mission Board, where another
            dispatcher resumes it <strong>In Progress</strong>.
          </>
        ) : (
          <>
            Releasing returns this alert to the Mission Board for another dispatcher to accept as a fresh{" "}
            <strong>Assigned</strong> mission.
          </>
        )}{" "}
        Your reason is shown to them on the timeline.
      </p>
      <div className="dispatch-field">
        <label className="dispatch-label" htmlFor={reasonId}>
          Reason <em className="optional-hint">(required)</em>
        </label>
        <textarea
          id={reasonId}
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={
            isHandover
              ? "Why is this rescue being handed over? (trip conflict, distance, coverage...)"
              : "Why are you releasing this alert?"
          }
          disabled={submitting}
        />
      </div>
      {error && <p className="invite-feedback error">{error}</p>}
      <div className="rescue-confirm-actions">
        <button type="submit" className="danger-button dispatch-save" disabled={submitting}>
          {submitting ? "Releasing alert..." : isHandover ? "Request Handover" : "Release Mission"}
        </button>
      </div>
    </form>
  );
}

const UPDATE_TYPE_OPTIONS: { key: RescueUpdateType; label: string }[] = [
  { key: "note", label: "Note" },
  { key: "photo", label: "Photo" },
];

// Quick update filed mid-rescue: a note or a photo. Never changes the status
// - just timestamped evidence.
function QuickUpdateForm({
  getToken,
  onUpdate,
}: {
  getToken: () => Promise<string | null>;
  onUpdate: (input: { updateType: RescueUpdateType; message?: string; imageUrls?: string[] }) => Promise<boolean>
}) {
  const messageId = useId();
  const [updateType, setUpdateType] = useState<RescueUpdateType>("note");
  const [message, setMessage] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const messageRequired = updateType === "note";
  const showImageUpload = updateType === "photo";

  function validate(): string {
    if (messageRequired && !message.trim()) {
      return "A note update needs a short message.";
    }
    if (updateType === "photo" && images.length === 0 && !message.trim()) {
      return "A photo update needs at least one image (or a message).";
    }
    return "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const saved = await onUpdate({
        updateType,
        message: message.trim() || undefined,
        imageUrls: images,
      });
      if (!saved) {
        // The page-level banner already shows why it failed; keep the typed
        // text and any attached photo so the dispatcher can retry.
        return;
      }
      setMessage("");
      setImages([]);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "The mission update could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="dispatch-form" onSubmit={handleSubmit}>
      <p className="dispatch-form-hint">
        File a quick update while the rescue is in progress - it is logged with a timestamp and never changes
        the mission status.
      </p>
      <div className="dispatch-field">
        <span className="dispatch-label">Update type</span>
        <div className="rescue-confirm-actions">
          {UPDATE_TYPE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`chip${updateType === option.key ? " active" : ""}`}
              onClick={() => {
                setUpdateType(option.key);
                setError("");
              }}
              disabled={submitting}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {messageRequired || updateType === "photo" ? (
        <div className="dispatch-field">
          <label className="dispatch-label" htmlFor={messageId}>
            Message{" "}
            <em className="optional-hint">{messageRequired ? "(required)" : "(optional)"}</em>
          </label>
          <textarea
            id={messageId}
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={
              updateType === "note"
                ? "What is happening at the scene?"
                : "Add a caption for the photo (optional)..."
            }
            disabled={submitting}
          />
        </div>
      ) : null}
      {showImageUpload && (
        <ProgressImageUpload value={images} onChange={setImages} getToken={getToken} disabled={submitting} />
      )}
      {error && <p className="invite-feedback error">{error}</p>}
      <button type="submit" className="teal-button dispatch-save" disabled={submitting}>
        {submitting ? "Saving update..." : "Save update"}
      </button>
    </form>
  );
}

// The single Post-Rescue Debrief that completes the mission. Review-then-confirm
// so a bare click can never resolve a mission without the dispatcher seeing
// what they are submitting.
function DebriefForm({ onDebrief }: { onDebrief: (input: DebriefInput) => Promise<void> }) {
  const whatHappenedId = useId();
  const animalConditionId = useId();
  const unsuccessfulId = useId();
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [outcome, setOutcome] = useState<RescueOutcome | "">("");
  const [whatHappened, setWhatHappened] = useState("");
  const [animalCondition, setAnimalCondition] = useState("");
  const [veterinaryPriority, setVeterinaryPriority] = useState<RescueUrgency | "">("");
  const [unsuccessfulDetails, setUnsuccessfulDetails] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const rescued = outcome !== "" && isRescueSuccessOutcome(outcome);
  const showUnsuccessfulDetails = outcome === "other";

  function validate(): string {
    if (!outcome) return "Select a rescue outcome.";
    if (!whatHappened.trim()) return "A debrief of what happened is required.";
    if (rescued && !veterinaryPriority) return "Veterinary priority is required so the intake team can triage.";
    if (showUnsuccessfulDetails && !unsuccessfulDetails.trim()) return 'Please explain the "Other" outcome.';
    return "";
  }

  function handleReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setStep("confirm");
  }

  async function handleConfirm() {
    setError("");
    setSubmitting(true);
    try {
      await onDebrief({
        outcome: outcome as RescueOutcome,
        whatHappened: whatHappened.trim(),
        animalCondition: animalCondition.trim() || undefined,
        veterinaryPriority: veterinaryPriority === "" ? undefined : veterinaryPriority,
        unsuccessfulDetails: unsuccessfulDetails.trim() || undefined,
      });
    } catch (debriefError) {
      setError(debriefError instanceof Error ? debriefError.message : "The debrief could not be saved.");
      setStep("edit");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "confirm") {
    return (
      <div className="rescue-confirm-panel">
        <p className="dispatch-form-hint">
          Review your debrief before confirming. Confirming marks this mission <strong>Resolved</strong> and,
          for rescued animals, creates the intake handoff.
        </p>
        <div className="dispatch-field">
          <span className="dispatch-label">Rescue outcome</span>
          <strong>{RESCUE_OUTCOME_LABELS[outcome as RescueOutcome]}</strong>
        </div>
        <div className="dispatch-field">
          <span className="dispatch-label">What happened</span>
          <p className="rescue-confirm-text">{whatHappened.trim()}</p>
        </div>
        {animalCondition.trim() && (
          <div className="dispatch-field">
            <span className="dispatch-label">Animal condition</span>
            <p className="rescue-confirm-text">{animalCondition.trim()}</p>
          </div>
        )}
        {veterinaryPriority && (
          <div className="dispatch-field">
            <span className="dispatch-label">Veterinary priority</span>
            <strong>{rescueUrgencyLabel(veterinaryPriority)}</strong>
          </div>
        )}
        {unsuccessfulDetails.trim() && (
          <div className="dispatch-field">
            <span className="dispatch-label">Unsuccessful details</span>
            <p className="rescue-confirm-text">{unsuccessfulDetails.trim()}</p>
          </div>
        )}
        {error && <p className="invite-feedback error">{error}</p>}
        <div className="rescue-confirm-actions">
          <button type="button" className="ghost-button" onClick={() => setStep("edit")} disabled={submitting}>
            Back to edit
          </button>
          <button type="button" className="teal-button dispatch-save" onClick={() => void handleConfirm()} disabled={submitting}>
            {submitting ? "Completing mission..." : "Confirm debrief"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="dispatch-form" onSubmit={handleReview}>
      <p className="dispatch-form-hint">
        Complete the mission with a short debrief. Resolved animals automatically create an intake handoff
        triaged by your selected veterinary priority.
      </p>
      <div className="dispatch-field">
        <span className="dispatch-label">
          Rescue outcome <em className="optional-hint">(required)</em>
        </span>
        <select
          value={outcome}
          onChange={(event) => {
            setOutcome(event.target.value as RescueOutcome);
            setError("");
          }}
          disabled={submitting}
        >
          <option value="">Select an outcome</option>
          {(Object.keys(RESCUE_OUTCOME_LABELS) as RescueOutcome[]).map((key) => (
            <option key={key} value={key}>
              {RESCUE_OUTCOME_LABELS[key]}
            </option>
          ))}
        </select>
      </div>
      <div className="dispatch-field">
        <label className="dispatch-label" htmlFor={whatHappenedId}>
          What happened <em className="optional-hint">(required)</em>
        </label>
        <textarea
          id={whatHappenedId}
          rows={4}
          value={whatHappened}
          onChange={(event) => setWhatHappened(event.target.value)}
          placeholder="Describe what happened during the rescue - the outcome and any follow-up needed..."
          disabled={submitting}
        />
      </div>
      <div className="dispatch-field">
        <label className="dispatch-label" htmlFor={animalConditionId}>
          Animal condition <em className="optional-hint">(optional)</em>
        </label>
        <input
          id={animalConditionId}
          type="text"
          value={animalCondition}
          onChange={(event) => setAnimalCondition(event.target.value)}
          placeholder="e.g. Alert, minor injuries, very thin"
          disabled={submitting}
        />
      </div>
      {rescued && (
        <>
          <div className="dispatch-field">
            <span className="dispatch-label">
              Veterinary priority <em className="optional-hint">(required - the intake team triages on this)</em>
            </span>
            <select
              value={veterinaryPriority}
              onChange={(event) => setVeterinaryPriority(event.target.value as RescueUrgency)}
              disabled={submitting}
            >
              <option value="">Select a priority</option>
              {(["low", "moderate", "high", "critical"] as RescueUrgency[]).map((priority) => (
                <option key={priority} value={priority}>
                  {rescueUrgencyLabel(priority)}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      {showUnsuccessfulDetails && (
        <div className="dispatch-field">
          <label className="dispatch-label" htmlFor={unsuccessfulId}>
            Unsuccessful details <em className="optional-hint">(required)</em>
          </label>
          <textarea
            id={unsuccessfulId}
            rows={3}
            value={unsuccessfulDetails}
            onChange={(event) => setUnsuccessfulDetails(event.target.value)}
            placeholder="Explain what actually happened..."
            disabled={submitting}
          />
        </div>
      )}
      {error && <p className="invite-feedback error">{error}</p>}
      <button type="submit" className="teal-button dispatch-save" disabled={submitting}>
        Review and confirm
      </button>
    </form>
  );
}

function MissionUpdateEntry({ update }: { update: RescueMission["updates"][number] }) {
  return (
    <li className="rescue-activity-entry">
      <span className="rescue-activity-marker" aria-hidden="true" />
      <div className="rescue-activity-body">
        <div className="rescue-activity-head">
          <strong className="rescue-activity-phase">{RESCUE_UPDATE_TYPE_LABELS[update.updateType]}</strong>
        </div>
        {update.message && <p className="rescue-activity-note">{update.message}</p>}
        {update.imageUrls.length > 0 && (
          <div className="rescue-activity-photos">
            {update.imageUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt="Mission update photo" />
              </a>
            ))}
          </div>
        )}
        <p className="rescue-activity-meta">
          {update.dispatcherName ?? "SPCA team"} · {formatDateTime(update.createdAt)}
        </p>
      </div>
    </li>
  );
}

function ResolvedMissionDebrief({ mission }: { mission: RescueMission }) {
  const debrief = mission.debrief;
  if (!debrief) {
    return (
      <section className="rescue-debrief-card" aria-label="Post-rescue debrief">
        <div className="rescue-debrief-card-head">
          <div>
            <p className="eyebrow">Mission outcome</p>
            <h3>Post-rescue Debrief</h3>
          </div>
        </div>
        <p className="rescue-history-empty">No debrief record was found for this resolved mission.</p>
      </section>
    );
  }

  const handoff = mission.intakeHandoff;
  const rescued = isRescueSuccessOutcome(debrief.outcome);
  const priority = debrief.veterinaryPriority ?? handoff?.veterinaryPriority ?? null;
  const intakeStatus = handoff ? (handoff.status === "pending" ? "pending" : "received") : "not-required";
  const intakeLabel = handoff ? (handoff.status === "pending" ? "Pending intake" : "Received") : "Not required";
  const destination = handoff?.destination ?? (rescued ? "SPCA Fiji" : "Not applicable");
  const destinationNote = handoff
    ? "Set automatically for rescued animals"
    : rescued
      ? "Set automatically to SPCA Fiji"
      : "No intake handoff was created";
  const dispatcher = debrief.dispatcherName ?? handoff?.dispatcherName ?? mission.assignedTo ?? "SPCA team";

  return (
    <section className="rescue-debrief-card" aria-label="Post-rescue debrief">
      <div className="rescue-debrief-card-head">
        <div>
          <p className="eyebrow">Mission outcome</p>
          <h3>Post-rescue Debrief</h3>
        </div>
        <span className="rescue-debrief-outcome-badge">Completed</span>
      </div>

      <div className="rescue-debrief-outcome-panel">
        <span className="rescue-debrief-label">Rescue outcome</span>
        <strong>{RESCUE_OUTCOME_LABELS[debrief.outcome] ?? debrief.outcome}</strong>
      </div>

      <div className="rescue-debrief-narrative">
        <span className="rescue-debrief-label">What happened</span>
        <p>{debrief.whatHappened}</p>
      </div>

      <div className="rescue-debrief-facts">
        <div className="rescue-debrief-fact">
          <span className="rescue-debrief-label">Veterinary priority</span>
          {priority ? (
            <span className={`rescue-debrief-priority ${priority}`}>{rescueUrgencyLabel(priority)}</span>
          ) : (
            <span className="rescue-debrief-value-muted">Not specified</span>
          )}
        </div>
        <div className="rescue-debrief-fact">
          <span className="rescue-debrief-label">Intake handoff status</span>
          <span className={`rescue-debrief-intake-badge ${intakeStatus}`}>{intakeLabel}</span>
        </div>
        <div className="rescue-debrief-fact">
          <span className="rescue-debrief-label">Destination</span>
          <strong>{destination}</strong>
          <span className="rescue-debrief-fact-note">{destinationNote}</span>
        </div>
        <div className="rescue-debrief-fact">
          <span className="rescue-debrief-label">Dispatcher</span>
          <strong>{dispatcher}</strong>
        </div>
        <div className="rescue-debrief-fact wide">
          <span className="rescue-debrief-label">Completed</span>
          <strong>{formatDateTime(debrief.createdAt)}</strong>
        </div>
      </div>

      {debrief.unsuccessfulDetails && (
        <div className="rescue-debrief-extra">
          <span className="rescue-debrief-label">Additional outcome details</span>
          <p>{debrief.unsuccessfulDetails}</p>
        </div>
      )}
    </section>
  );
}

function DebriefSummary({ mission }: { mission: RescueMission }) {
  const debrief = mission.debrief;
  if (!debrief) return null;
  return (
    <div className="rescue-progress-block">
      <h4 className="rescue-card-subtitle">Post-rescue debrief</h4>
      <dl className="rescue-details-list">
        <div className="rescue-detail-field">
          <dt>Outcome</dt>
          <dd>{RESCUE_OUTCOME_LABELS[debrief.outcome] ?? debrief.outcome}</dd>
        </div>
        <div className="rescue-detail-field full">
          <dt>What happened</dt>
          <dd>{debrief.whatHappened}</dd>
        </div>
        {debrief.animalCondition && (
          <div className="rescue-detail-field">
            <dt>Animal condition</dt>
            <dd>{debrief.animalCondition}</dd>
          </div>
        )}
        {debrief.veterinaryPriority && (
          <div className="rescue-detail-field">
            <dt>Veterinary priority</dt>
            <dd>{rescueUrgencyLabel(debrief.veterinaryPriority)}</dd>
          </div>
        )}
        {debrief.unsuccessfulDetails && (
          <div className="rescue-detail-field full">
            <dt>Unsuccessful details</dt>
            <dd>{debrief.unsuccessfulDetails}</dd>
          </div>
        )}
        <div className="rescue-detail-field">
          <dt>Debriefed by</dt>
          <dd>{debrief.dispatcherName ?? "SPCA team"}</dd>
        </div>
        <div className="rescue-detail-field">
          <dt>Debriefed on</dt>
          <dd>{formatDateTime(debrief.createdAt)}</dd>
        </div>
      </dl>
    </div>
  );
}

function IntakeHandoffSummary({
  mission,
  canReceiveIntake,
  onMarkReceived,
}: {
  mission: RescueMission;
  canReceiveIntake: boolean;
  onMarkReceived: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const handoff = mission.intakeHandoff;
  if (!handoff) return null;
  const isPending = handoff.status === "pending";

  async function handleMarkReceived() {
    setError("");
    setSubmitting(true);
    try {
      await onMarkReceived();
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "The handoff could not be marked received.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rescue-progress-block">
      <h4 className="rescue-card-subtitle">Animal intake handoff</h4>
      <dl className="rescue-details-list">
        <div className="rescue-detail-field">
          <dt>Status</dt>
          <dd>
            <span className={`rescue-status-badge ${isPending ? "submitted" : "resolved"}`}>
              {isPending ? "Pending intake" : "Received"}
            </span>
          </dd>
        </div>
        {handoff.animalType && (
          <div className="rescue-detail-field">
            <dt>Animal type</dt>
            <dd>{handoff.animalType}</dd>
          </div>
        )}
        {handoff.animalBreed && (
          <div className="rescue-detail-field">
            <dt>Breed / description</dt>
            <dd>{handoff.animalBreed}</dd>
          </div>
        )}
        {handoff.conditionDescription && (
          <div className="rescue-detail-field full">
            <dt>Condition reported</dt>
            <dd>{handoff.conditionDescription}</dd>
          </div>
        )}
        {handoff.veterinaryPriority && (
          <div className="rescue-detail-field">
            <dt>Veterinary priority</dt>
            <dd>{rescueUrgencyLabel(handoff.veterinaryPriority)}</dd>
          </div>
        )}
        {handoff.destination && (
          <div className="rescue-detail-field">
            <dt>Destination</dt>
            <dd>{handoff.destination}</dd>
          </div>
        )}
        {handoff.notes && (
          <div className="rescue-detail-field full">
            <dt>Handoff notes</dt>
            <dd>{handoff.notes}</dd>
          </div>
        )}
        <div className="rescue-detail-field">
          <dt>Handed off by</dt>
          <dd>{handoff.dispatcherName ?? "SPCA team"}</dd>
        </div>
        <div className="rescue-detail-field">
          <dt>Handed off on</dt>
          <dd>{formatDateTime(handoff.createdAt)}</dd>
        </div>
        {handoff.receivedAt && (
          <div className="rescue-detail-field">
            <dt>Received on</dt>
            <dd>{formatDateTime(handoff.receivedAt)}</dd>
          </div>
        )}
      </dl>

      {isPending && canReceiveIntake && (
        <>
          {error && <p className="invite-feedback error">{error}</p>}
          <div className="rescue-confirm-actions">
            <button type="button" className="teal-button dispatch-save" onClick={() => void handleMarkReceived()} disabled={submitting}>
              {submitting ? "Marking received..." : "Mark as received"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
