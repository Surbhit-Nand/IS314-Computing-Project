import { SignInButton, useAuth, useUser } from "@clerk/react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import spcaLogo from "../assets/spca-logo.png";

import {
  acceptMission,
  completeMissionDebrief,
  decideMissionTakeover,
  fetchAssignedToOthers,
  fetchMissionBoard,
  fetchMissionHistory,
  fetchMyActiveMissions,
  fetchTakeoverRequest,
  markIntakeHandoffReceived,
  postRescueUpdate,
  releaseMission,
  requestMissionTakeover,
  startMission,
  withdrawMissionTakeover,
  type MyActiveMissions,
} from "../services/rescueApi";
import {
  RESCUE_OUTCOME_LABELS,
  RESCUE_UPDATE_TYPE_LABELS,
  rescueStatusClass,
  rescueUrgencyLabel,
} from "../types/rescue";
import type {
  RescueMission,
  RescueOutcome,
  RescueReportStatus,
  RescueTakeoverRequest,
  RescueUpdateType,
  RescueUrgency,
} from "../types/rescue";
import { isDevBypassEnabled } from "../utils/devBypass";
import { getFreshClerkToken } from "../utils/clerkToken";
import { isDispatcherRole } from "../utils/roles";
import { formatDate, formatDateTime } from "../utils/format";
import { filterEligibleTakeoverMissions } from "../utils/rescueMissionFilters";
import {
  TAKEOVER_REVIEW_EVENT,
  TAKEOVER_REVIEW_STORAGE_KEY,
  type TakeoverReviewTarget,
} from "../utils/takeoverReview";
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
  unsuccessfulDetails?: string;
};

type RescueSummaryIconName = "inbox" | "refresh" | "clipboard" | "pulse" | "check";

type RescueSummaryCard = {
  key: string;
  label: string;
  value: number;
  tone: "amber" | "red" | "blue" | "green" | "charcoal";
  icon: RescueSummaryIconName;
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
  const [assignedToOthers, setAssignedToOthers] = useState<RescueMission[]>([]);
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
  const [linkedReview, setLinkedReview] = useState<TakeoverReviewTarget | null>(null);
  const detailTakeoverRequestId = linkedReview?.missionId === detailMissionId ? linkedReview.requestId : null;
  // The takeover request a notification deep-linked to, fetched fresh so the
  // detail page can show "already approved / declined / withdrawn / cancelled"
  // instead of stale Approve/Decline buttons. `detailUnavailable` is set when a
  // deep link points at an alert the viewer can no longer see.
  const [reviewRequest, setReviewRequest] = useState<RescueTakeoverRequest | null>(null);
  const [reviewRequestError, setReviewRequestError] = useState("");
  const [detailUnavailable, setDetailUnavailable] = useState(false);
  // Bumped after every list reload so the request-status fetch re-runs and the
  // takeover banner reflects the latest decision.
  const [dataVersion, setDataVersion] = useState(0);
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);

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
      const [nextBoard, nextHistory, nextActive, nextAssignedToOthers]: [
        RescueMission[],
        RescueMission[],
        MyActiveMissions,
        RescueMission[],
      ] = await Promise.all([
        fetchMissionBoard(token),
        fetchMissionHistory(token),
        canAct ? fetchMyActiveMissions(token) : Promise.resolve({ assigned: [], inProgress: [] }),
        canAct ? fetchAssignedToOthers(token) : Promise.resolve([]),
      ]);
      if (version !== requestVersion.current) return;
      setBoard(nextBoard);
      setHistory(nextHistory);
      setMyAssigned(nextActive.assigned);
      setMyInProgress(nextActive.inProgress);
      setAssignedToOthers(nextAssignedToOthers);
      setLoadError("");
      const pendingReview = sessionStorage.getItem(TAKEOVER_REVIEW_STORAGE_KEY);
      if (pendingReview) {
        sessionStorage.removeItem(TAKEOVER_REVIEW_STORAGE_KEY);
        try {
          const review = JSON.parse(pendingReview) as TakeoverReviewTarget;
          const missionId = review.missionId;
          const allLoaded = [
            ...nextActive.assigned,
            ...nextActive.inProgress,
            ...nextAssignedToOthers,
            ...nextBoard,
            ...nextHistory,
          ];
          if (missionId && allLoaded.some((mission) => mission.id === missionId)) {
            onNavigateDestination({ view: "rescue-active", rescueMissionId: missionId, detailSource: "rescue-active" });
            setLinkedReview(review);
            setDetailUnavailable(false);
          } else if (missionId) {
            // The deep-linked alert is in none of the lists this dispatcher can
            // see - it was reassigned away, resolved, or removed. Keep the user
            // on the detail route but explain the alert is gone.
            onNavigateDestination({ view: "rescue-active" });
            setLinkedReview(null);
            setDetailUnavailable(true);
          }
        } catch {
          // Malformed payload - nothing to open.
        }
      } else if (
        // If the mission open on a detail page just left every list this
        // dispatcher can see, drop the detail view back to its list instead of
        // showing a blank panel.
        detailMissionId &&
        !nextBoard.some((mission: RescueMission) => mission.id === detailMissionId) &&
        !nextHistory.some((mission: RescueMission) => mission.id === detailMissionId) &&
        !nextActive.assigned.some((mission: RescueMission) => mission.id === detailMissionId) &&
        !nextActive.inProgress.some((mission: RescueMission) => mission.id === detailMissionId) &&
        !nextAssignedToOthers.some((mission: RescueMission) => mission.id === detailMissionId)
      ) {
        onNavigateDestination({ view: detailSource ?? page }, true);
      }
      // Re-run the request-status fetch so a just-decided takeover refreshes.
      setDataVersion((version) => version + 1);
    } catch (error) {
      if (version !== requestVersion.current) return;
      setLoadError(error instanceof Error ? error.message : "Rescue operations could not be loaded.");
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  }

  // The mission shown on a Board details modal (only unassigned/awaiting
  // missions use the accept modal). Assigned-to-other missions use the
  // takeover-capable detail page below.
  const boardModalMission = useMemo(
    () => board.find((mission) => mission.id === boardModalId && !mission.assignedToClerkUserId) ?? null,
    [board, boardModalId],
  );

  // The header fires this when a takeover notification is opened while the
  // portal is already mounted (e.g. the dispatcher is sitting on Active
  // Mission, so navigating to the same view would not remount it). The header
  // also parks the payload in sessionStorage, so a reload of the loader picks
  // it up exactly like a fresh mount.
  const loadAllRef = useRef(loadAll);
  useEffect(() => {
    loadAllRef.current = loadAll;
  });
  useEffect(() => {
    function handleTakeoverReview(event: Event) {
      const target = (event as CustomEvent<TakeoverReviewTarget>).detail;
      if (!target?.missionId) return;
      sessionStorage.setItem(TAKEOVER_REVIEW_STORAGE_KEY, JSON.stringify(target));
      void loadAllRef.current();
    }
    window.addEventListener(TAKEOVER_REVIEW_EVENT, handleTakeoverReview);
    return () => window.removeEventListener(TAKEOVER_REVIEW_EVENT, handleTakeoverReview);
  }, []);

  // Fetch the deep-linked takeover request's latest status so the detail page
  // can show "already handled / no longer available" and never offers stale
  // decision buttons. Re-runs when the linked request changes or after every
  // list reload (dataVersion).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!detailTakeoverRequestId) {
        if (!cancelled) {
          setReviewRequest(null);
          setReviewRequestError("");
        }
        return;
      }
      try {
        const token = await getFreshClerkToken(getToken);
        if (!token) throw new Error("Your Clerk session has expired.");
        const request = await fetchTakeoverRequest(token, detailTakeoverRequestId);
        if (!cancelled) {
          setReviewRequest(request);
          setReviewRequestError("");
        }
      } catch (error) {
        if (!cancelled) {
          setReviewRequest(null);
          setReviewRequestError(
            error instanceof Error ? error.message : "The takeover request could not be loaded.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailTakeoverRequestId, dataVersion, getToken]);

  // The mission shown on an Active / History detail page. A mission opened
  // from Active that just got resolved lives in `history` after the reload, so
  // it keeps rendering read-only there instead of collapsing. If it vanishes
  // entirely, the effect below replaces the entry with its source list.
  const detailMission = useMemo(() => {
    if (!detailMissionId) return null;
    return (
      board.find((mission) => mission.id === detailMissionId) ??
      history.find((mission) => mission.id === detailMissionId) ??
      myAssigned.find((mission) => mission.id === detailMissionId) ??
      myInProgress.find((mission) => mission.id === detailMissionId) ??
      assignedToOthers.find((mission) => mission.id === detailMissionId) ??
      null
    );
  }, [assignedToOthers, board, detailMissionId, history, myAssigned, myInProgress]);

  useEffect(() => {
    if (detailMissionId && !isLoading && !loadError && !detailMission && !detailUnavailable) {
      onNavigateDestination({ view: detailSource ?? page }, true);
    }
  }, [detailMissionId, detailMission, detailSource, page, isLoading, loadError, detailUnavailable, onNavigateDestination]);


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
    setIsActionSubmitting(true);
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
    } finally {
      setIsActionSubmitting(false);
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

  async function handleRequestTakeover(mission: RescueMission, reason: string) {
    await runAction(
      `Takeover request sent for ${mission.reference}.`,
      (token) => requestMissionTakeover(token, mission.id, reason),
    );
  }

  async function handleWithdrawTakeover(requestId: string, reference: string) {
    await runAction(
      `Takeover request withdrawn for ${reference}.`,
      (token) => withdrawMissionTakeover(token, requestId),
    );
  }

  async function handleDecideTakeover(requestId: string, reference: string, decision: "approved" | "declined", decisionNote?: string) {
    const verb = decision === "approved" ? "approved" : "declined";
    await runAction(
      `Takeover request ${verb} for ${reference}.`,
      (token) => decideMissionTakeover(token, requestId, decision, decisionNote),
    );
  }

  // One search box shared by every tab, applied to whichever list is showing.
  // Each visible list is derived from its server-grouped source. The Board
  // keeps unresolved work together while splitting unassigned and assigned
  // missions into separate sections below.
  const search = searchTerm.trim().toLowerCase();
  const activeCount = myAssigned.length + myInProgress.length;
  const visibleBoard = useMemo(
    () => board.filter((mission) => matchesSearch(mission, search)),
    [board, search],
  );
  const visibleUnassignedBoard = useMemo(
    () => visibleBoard.filter((mission) => !mission.assignedToClerkUserId),
    [visibleBoard],
  );
  const assignedBoard = useMemo(
    () => filterEligibleTakeoverMissions(assignedToOthers, user?.id),
    [assignedToOthers, user?.id],
  );
  const visibleAssignedBoard = useMemo(
    () => assignedBoard.filter((mission) => matchesSearch(mission, search)),
    [assignedBoard, search],
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

  async function handleMarkReceived(mission: RescueMission) {
    const handoff = mission.intakeHandoff;
    if (!handoff) return;
    await runAction(
      `Intake for ${mission.reference} marked as received.`,
      (token) => markIntakeHandoffReceived(token, handoff.id),
    );
  }

  const staffDashboardView: PortalView = role === "manager" || role === "admin" ? "dashboard" : "staff-dashboard";
  const pageTitle =
    page === "rescue-board" ? "Mission Board" : page === "rescue-active" ? "Active Mission" : "Mission History";

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
        },
        {
          key: "reassign",
          label: "Needs reassignment",
          value: releasedCount,
          tone: "red",
          icon: "refresh",
        },
        {
          key: "assigned",
          label: "Assigned",
          value: myAssigned.length,
          tone: "blue",
          icon: "clipboard",
        },
        {
          key: "progress",
          label: "In progress",
          value: myInProgress.length,
          tone: "green",
          icon: "pulse",
        },
        {
          key: "resolved",
          label: "Resolved",
          value: history.length,
          tone: "charcoal",
          icon: "check",
        },
      ]
    : [
        {
          key: "awaiting",
          label: "Awaiting assignment",
          value: unclaimedCount,
          tone: "amber",
          icon: "inbox",
        },
        {
          key: "reassign",
          label: "Needs reassignment",
          value: releasedCount,
          tone: "red",
          icon: "refresh",
        },
        {
          key: "urgent",
          label: "Critical & high",
          value: board.filter((mission) => mission.urgency === "critical" || mission.urgency === "high").length,
          tone: "red",
          icon: "pulse",
        },
        {
          key: "phone",
          label: "Phone alerts",
          value: board.filter((mission) => mission.source === "phone").length,
          tone: "blue",
          icon: "clipboard",
        },
        {
          key: "resolved",
          label: "Resolved",
          value: history.length,
          tone: "charcoal",
          icon: "check",
        },
      ];

  // A takeover deep link can point at an alert this dispatcher can no longer
  // see (reassigned away, resolved, or removed). Explain that instead of
  // bouncing them back to the list with no context, and give a way back.
  if (detailUnavailable) {
    return (
      <main className="dashboard-page rescue-workspace">
        <SiteHeader
          isLoaded={isLoaded}
          isSignedIn={isSignedIn}
          currentPage="rescue-active"
          onNavigate={onNavigate}
        />
        <div className="rescue-container">
          <div className="rescue-unavailable-card">
            <p className="eyebrow">Rescue operations</p>
            <h1>That rescue alert is no longer available</h1>
            <p>
              It may have been reassigned to another dispatcher, resolved, or removed, so there is
              nothing to review here.
            </p>
            <button
              type="button"
              className="teal-button"
              onClick={() => {
                setDetailUnavailable(false);
                onNavigateDestination({ view: "rescue-active" });
              }}
            >
              Back to Active Mission
            </button>
          </div>
        </div>
      </main>
    );
  }

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
            onMarkReceived={() => handleMarkReceived(detailMission)}
            getToken={getToken}
            onBack={() => onNavigateDestination({ view: detailSource ?? page })}
            onAccept={() => handleAccept(detailMission)}
            onStart={(input) => handleStart(detailMission, input)}
            onUpdate={(input) => handleUpdate(detailMission, input)}
            onDebrief={(input) => handleDebrief(detailMission, input)}
            onRelease={(reason) => handleRelease(detailMission, reason)}
            onRequestTakeover={handleRequestTakeover}
            onWithdrawTakeover={handleWithdrawTakeover}
            onDecideTakeover={handleDecideTakeover}
            initialTakeoverRequestId={detailTakeoverRequestId}
            reviewRequest={reviewRequest}
            reviewRequestError={reviewRequestError}
            isActionSubmitting={isActionSubmitting}
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
                    ? "New rescue alerts, released missions, and unresolved missions already assigned to a dispatcher will appear here."
                    : "Try a different reference, location, or reporter name."
                }
              />
            )}

            {!isLoading && !loadError && page === "rescue-history" && visibleHistory.length === 0 && (
              <EmptyGroup
                title={history.length === 0 ? "No resolved missions yet" : "No missions match your search"}
                hint={
                  history.length === 0
                    ? "Completed missions appear here with their debrief and outcome."
                    : "Try a different reference, location, or reporter name."
                }
              />
            )}

            {page === "rescue-board" && visibleBoard.length > 0 && (
              <div className="ops-active-groups">
                <section className="ops-mission-group board-unassigned">
                  <div className="ops-group-heading">
                    <div>
                      <p className="eyebrow">Available for dispatch</p>
                      <h3>Unassigned <span>{visibleUnassignedBoard.length}</span></h3>
                    </div>
                  </div>
                  {visibleUnassignedBoard.length > 0 ? (
                    <MissionsList
                      missions={visibleUnassignedBoard}
                      group="board"
                      onOpen={(mission) => setBoardModalId(mission.id)}
                    />
                  ) : (
                    <EmptyGroup
                      title="No unassigned alerts"
                      hint="New or released alerts will appear here when they are ready for a dispatcher."
                    />
                  )}
                </section>
                <section className="ops-mission-group board-assigned">
                  <div className="ops-group-heading">
                    <div>
                      <p className="eyebrow">Already accepted</p>
                      <h3>Assigned <span>{visibleAssignedBoard.length}</span></h3>
                    </div>
                  </div>
                  {visibleAssignedBoard.length > 0 ? (
                    <MissionsList
                      missions={visibleAssignedBoard}
                      group="assigned"
                      onOpen={(mission) => {
                        onNavigateDestination({ view: "rescue-active", rescueMissionId: mission.id, detailSource: "rescue-active" });
                      }}
                    />
                  ) : (
                    <EmptyGroup
                      title="No assigned missions"
                      hint="Accepted rescue missions will appear here until they are resolved."
                    />
                  )}
                </section>
              </div>
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
                      hideAssignmentBadge
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
                      hideAssignmentBadge
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
  onMarkReceived,
  getToken,
  onBack,
  onAccept,
  onStart,
  onUpdate,
  onDebrief,
  onRelease,
  onRequestTakeover,
  onWithdrawTakeover,
  onDecideTakeover,
  initialTakeoverRequestId,
  reviewRequest,
  reviewRequestError,
  isActionSubmitting,
}: {
  mission: RescueMission;
  source: "rescue-board" | "rescue-active" | "rescue-history" | null;
  canAct: boolean;
  isDispatcher: boolean;
  clerkUserId: string | undefined;
  canReceiveIntake: boolean;
  onMarkReceived: () => Promise<void>;
  getToken: () => Promise<string | null>;
  onBack: () => void;
  onAccept: () => Promise<boolean>;
  onStart: (input: { notes?: string; imageUrls?: string[] }) => Promise<void>;
  onUpdate: (input: { updateType: RescueUpdateType; message?: string; imageUrls?: string[] }) => Promise<boolean>;
  onDebrief: (input: DebriefInput) => Promise<void>;
  onRelease: (reason: string) => Promise<void>;
  onRequestTakeover: (mission: RescueMission, reason: string) => Promise<void>;
  onWithdrawTakeover: (requestId: string, reference: string) => Promise<void>;
  onDecideTakeover: (requestId: string, reference: string, decision: "approved" | "declined", decisionNote?: string) => Promise<void>;
  initialTakeoverRequestId?: string | null;
  reviewRequest?: RescueTakeoverRequest | null;
  reviewRequestError?: string;
  isActionSubmitting: boolean;
}) {
  const isOwner = clerkUserId != null && mission.assignedToClerkUserId === clerkUserId;
  const isResolvedDispatcherView = canAct && mission.status === "resolved";
  const backLabel =
    source === "rescue-history" ? "Mission History" : source === "rescue-board" ? "Mission Board" : "Active Mission";
  return (
    <div className={`rescue-detail-page${isResolvedDispatcherView ? " rescue-history-page" : ""}`}>
      <div className="rescue-detail-page-head">
        <div className="rescue-detail-page-head-text">
          <p className="eyebrow">
            Rescue operations  {isResolvedDispatcherView ? "Mission history" : canAct ? "Dispatcher workspace" : "Rescue operations team"}
          </p>
          <h1>
            {mission.reference}{" "}
            <span className={`rescue-status-badge ${rescueStatusClass(mission.status)}`}>
              {STATUS_BADGE_LABEL[mission.status]}
            </span>
          </h1>
        </div>
        <button type="button" className="ghost-button rescue-detail-back" onClick={onBack}>
          <span aria-hidden="true">←</span> {backLabel}
        </button>
      </div>
      <MissionDetail
        key={mission.id}
        mission={mission}
        isActiveMission={source === "rescue-active"}
        canAct={canAct}
        isDispatcher={isDispatcher}
        isOwner={isOwner}
        canReceiveIntake={canReceiveIntake}
        onMarkReceived={onMarkReceived}
        getToken={getToken}
        onAccept={onAccept}
        onStart={onStart}
        onUpdate={onUpdate}
        onDebrief={onDebrief}
        onRelease={onRelease}
        onRequestTakeover={onRequestTakeover}
        onWithdrawTakeover={onWithdrawTakeover}
        onDecideTakeover={onDecideTakeover}
        initialTakeoverRequestId={initialTakeoverRequestId}
        reviewRequest={reviewRequest}
        reviewRequestError={reviewRequestError}
        isActionSubmitting={isActionSubmitting}
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
            <p className="eyebrow">Mission Board &middot; Alert Details</p>
            <h2>{mission.reference}</h2>
            <div className="board-mission-header-badges">
              {isHandedOver ? (
                <span className="rescue-status-badge awaiting-reassignment">Needs Reassignment</span>
              ) : (
                <span className={`rescue-status-badge ${rescueStatusClass(mission.status)}`}>
                  {STATUS_BADGE_LABEL[mission.status]}
                </span>
              )}
              <span className={`ops-urgency-badge ${mission.urgency}`} title={rescueUrgencyLabel(mission.urgency)}>
                <span className="ops-urgency-dot" aria-hidden="true" />
                {URGENCY_SHORT_LABEL[mission.urgency]}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="ghost-button modal-close"
            onClick={onClose}
           aria-label="Close alert details"
           title="Close alert details"
          >
           <svg className="board-mission-close-icon" viewBox="0 0 16 16" focusable="false" aria-hidden="true">
             <path d="m4 4 8 8M12 4l-8 8" />
           </svg>
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
                  Open Directions
                </a>
              </div>
            )}

            <div className="board-mission-action-area">
              {canAct && (
                <MissionAcceptButton
                  isHandedOver={isHandedOver}
                  onAccept={onAccept}
                  onSuccess={onClose}
                  showHint={false}
                />
              )}
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
  hideAssignmentBadge = false,
  onOpen,
}: {
  missions: RescueMission[];
  group: "board" | "assigned" | "in_progress" | "history";
  hideAssignmentBadge?: boolean;
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
              {!hideAssignmentBadge && mission.assignedToClerkUserId && mission.status !== "awaiting_reassignment" && (
                <span className="ops-case-reassign-tag">Assigned to {mission.assignedTo ?? "dispatcher"}</span>
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
                <svg viewBox="0 0 12 12" focusable="false">
                  <path d="M4 2.5 7.5 6 4 9.5" />
                </svg>
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

// Mission History's Rescue Progress card shows only the main mission progress
// events: acceptance, release, reassignment/handover (the same-status
// "Mission transferred" entry written on an approved takeover), rescue started,
// and resolved. Standalone note/photo history rows - entries logged without a
// status change and without a handover - are filtered out here; they remain in
// the Mission Updates card, and the underlying timeline data is untouched.
function mainMissionProgress(progress: RescueMission["progress"]): RescueMission["progress"] {
  return progress.filter(
    (entry) => entry.fromStatus !== entry.toStatus || entry.toStatus === "assigned",
  );
}

// The full detail/actions panel for one mission: the progress tracker, the
// generated mission summary, the report details + map + photos, the
// dispatcher's action forms (or read-only state), the in-rescue quick updates,
// the debrief.
function MissionDetail({
  mission,
  isActiveMission,
  canAct,
  isDispatcher,
  isOwner,
  canReceiveIntake,
  onMarkReceived,
  getToken,
  onAccept,
  onStart,
  onUpdate,
  onDebrief,
  onRelease,
  onRequestTakeover,
  onWithdrawTakeover,
  onDecideTakeover,
  initialTakeoverRequestId,
  reviewRequest,
  reviewRequestError,
  isActionSubmitting,
}: {
  mission: RescueMission;
  isActiveMission: boolean;
  canAct: boolean;
  isDispatcher: boolean;
  isOwner: boolean;
  canReceiveIntake: boolean;
  onMarkReceived: () => Promise<void>;
  getToken: () => Promise<string | null>;
  onAccept: () => Promise<boolean>;
  onStart: (input: { notes?: string; imageUrls?: string[] }) => Promise<void>;
  onUpdate: (input: { updateType: RescueUpdateType; message?: string; imageUrls?: string[] }) => Promise<boolean>;
  onDebrief: (input: DebriefInput) => Promise<void>;
  onRelease: (reason: string) => Promise<void>;
  onRequestTakeover: (mission: RescueMission, reason: string) => Promise<void>;
  onWithdrawTakeover: (requestId: string, reference: string) => Promise<void>;
  onDecideTakeover: (requestId: string, reference: string, decision: "approved" | "declined", decisionNote?: string) => Promise<void>;
  initialTakeoverRequestId?: string | null;
  reviewRequest?: RescueTakeoverRequest | null;
  reviewRequestError?: string;
  isActionSubmitting: boolean;
}) {
  const currentStage = CURRENT_STAGE[mission.status];
  const isResolvedDispatcherView = canAct && mission.status === "resolved";
  const hasPin = mission.latitude != null && mission.longitude != null;
  const canAccept = canAct && (mission.status === "submitted" || mission.status === "awaiting_reassignment") && !mission.assignedToClerkUserId;
  const canStart = canAct && isOwner && mission.status === "assigned";
  const canWork = canAct && isOwner && mission.status === "in_progress";
  const shouldShowDirectionsBelowMap =
    isActiveMission &&
    hasPin &&
    isDispatcher &&
    (mission.status === "assigned" || mission.status === "in_progress");
  const isHandedOver =
    mission.status === "awaiting_reassignment" &&
    mission.progress[mission.progress.length - 1]?.fromStatus === "in_progress";
  const reassignmentNote = [...mission.progress]
    .reverse()
    .find((entry) => entry.toStatus === "awaiting_reassignment");
  const directionsUrl = hasPin
    ? `https://www.google.com/maps/dir/?api=1&destination=${mission.latitude},${mission.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mission.location)}`;
  // Long histories start collapsed; changing missions resets this local state.
  const [updatesToShow, setUpdatesToShow] = useState(5);
  const hiddenUpdates = mission.updates.length - updatesToShow;
  const pendingTakeoverRequests = mission.takeoverRequests ?? [];
  const [takeoverRequestsOpen, setTakeoverRequestsOpen] = useState(Boolean(initialTakeoverRequestId));
  const [previousReviewId, setPreviousReviewId] = useState(initialTakeoverRequestId);
  if (previousReviewId !== initialTakeoverRequestId) {
    setPreviousReviewId(initialTakeoverRequestId);
    if (initialTakeoverRequestId) setTakeoverRequestsOpen(true);
  }
  const [confirmingTakeoverId, setConfirmingTakeoverId] = useState<string | null>(null);
  const takeoverRequestRefs = useRef(new Map<string, HTMLDivElement>());

  // The request a notification deep-linked to. While it is still pending it is
  // in `pendingTakeoverRequests` and the review card below handles it. Once it
  // has been decided, withdrawn, or cancelled it drops out of that list, so we
  // show its current status from the freshly-fetched request instead - and the
  // decision buttons are never offered again.
  const linkedRequestIsPending =
    !!initialTakeoverRequestId &&
    pendingTakeoverRequests.some((req) => req.id === initialTakeoverRequestId);
  const linkedRequestStatusMessage = (() => {
    if (!initialTakeoverRequestId || linkedRequestIsPending) return null;
    if (reviewRequest && reviewRequest.status !== "pending") {
      const who = reviewRequest.requestedByName ?? "The requesting dispatcher";
      switch (reviewRequest.status) {
        case "approved":
          return {
            tone: "approved" as const,
            text: `${who}'s takeover request was approved - the mission was transferred.`,
          };
        case "declined":
          return {
            tone: "declined" as const,
            text: `${who}'s takeover request was declined.`,
            note: reviewRequest.decisionNote ?? undefined,
          };
        case "withdrawn":
          return { tone: "withdrawn" as const, text: `${who} withdrew their takeover request.` };
        case "cancelled":
          return {
            tone: "cancelled" as const,
            text: `${who}'s takeover request was closed because the mission moved on.`,
          };
        default:
          return null;
      }
    }
    if (reviewRequestError) return { tone: "unavailable" as const, text: reviewRequestError };
    return null;
  })();

  useEffect(() => {
    if (!initialTakeoverRequestId) return;
    takeoverRequestRefs.current.get(initialTakeoverRequestId)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
    });
  }, [initialTakeoverRequestId, pendingTakeoverRequests.length]);

  // Alert Details is rendered once here and reused by both layouts: the active
  // view uses it as a direct grid child, while the resolved view nests it in
  // the left column, so the card markup is never duplicated.
  const alertDetailsCard = (
    <div className="rescue-details-card">
      <div className="rescue-facts-heading"><span className="rescue-facts-icon" aria-hidden="true"><RescueSummaryIcon name="clipboard" /></span><div><h3 className="rescue-card-title">Alert details</h3><p>The original report and location.</p></div></div>
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

      {!isResolvedDispatcherView && <div className="rescue-mission-media">
      {hasPin && (
        <div className="rescue-detail-photo-block">
          <h4 className="rescue-card-subtitle">Location map</h4>
          <RescueReadOnlyMap latitude={mission.latitude as number} longitude={mission.longitude as number} />
          {shouldShowDirectionsBelowMap && (
            <div className="rescue-detail-directions">
              <a
                className="teal-button dispatch-save"
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Directions
              </a>
            </div>
          )}
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
      </div>}
    </div>
  );

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

      {linkedRequestStatusMessage && (
        <section
          className={`rescue-takeover-status rescue-takeover-status-${linkedRequestStatusMessage.tone}`}
          role="status"
          aria-label="Takeover request status"
        >
          <strong>Takeover request update</strong>
          <p>{linkedRequestStatusMessage.text}</p>
          {"note" in linkedRequestStatusMessage && linkedRequestStatusMessage.note && (
            <p className="rescue-takeover-status-note">Note: "{linkedRequestStatusMessage.note}"</p>
          )}
        </section>
      )}

      {isResolvedDispatcherView ? (
        <>
          <div className="rescue-history-overview">{alertDetailsCard}<ResolvedMissionDebrief mission={mission} /></div>
          <MissionArchive mission={mission} />
        </>
      ) : (
        <div className="rescue-detail-columns">
          {alertDetailsCard}
          <>
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

          {canAct && isDispatcher && !shouldShowDirectionsBelowMap && (
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

          {canStart && mission.status === "assigned" && isOwner && (
            <AssignedMissionStartActions
              getToken={getToken}
              onStart={onStart}
              onUpdate={onUpdate}
              onRelease={onRelease}
            />
          )}

          {mission.status === "assigned" && canAct && !isOwner && mission.myTakeoverRequest && (
            <div className="dispatch-field dispatch-note">
              <span className="dispatch-label">Request Pending</span>
              <p>You requested to take this over: "{mission.myTakeoverRequest.reason}"</p>
              <button
                type="button"
                className="ghost-button"
                onClick={() => onWithdrawTakeover(mission.myTakeoverRequest!.id, mission.reference)}
              >
                Withdraw Request
              </button>
            </div>
          )}

          {mission.status === "assigned" && canAct && !isOwner && !mission.myTakeoverRequest && (
            <div className="dispatch-field">
              <span className="dispatch-label">Request to take over</span>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const reason = (form.elements.namedItem("takeoverReason") as HTMLTextAreaElement).value;
                  if (reason.trim()) {
                    onRequestTakeover(mission, reason.trim());
                    form.reset();
                  }
                }}
                style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
              >
                <textarea
                  name="takeoverReason"
                  placeholder="Why are you better positioned to take this mission?"
                  className="dispatch-input"
                  rows={2}
                  required
                />
                <button type="submit" className="teal-button" style={{ alignSelf: "flex-start" }}>
                  Request Takeover
                </button>
              </form>
            </div>
          )}

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

          {canWork && (
            <InProgressMissionActions
              getToken={getToken}
              onUpdate={onUpdate}
              onDebrief={onDebrief}
              onRelease={onRelease}
            />
          )}

          {mission.status === "resolved" && (
            <p className="dispatch-form-hint">
              This mission is resolved and read-only. Its full timeline and debrief are shown below.
            </p>
          )}
          </div>
          {mission.status === "assigned" && canAct && isDispatcher && isOwner && (
            <section className="rescue-takeover-card" aria-label="Takeover Requests">
              <button
                type="button"
                className="rescue-takeover-card-header"
                aria-expanded={takeoverRequestsOpen}
                onClick={() => setTakeoverRequestsOpen((open) => !open)}
              >
                <span>Takeover requests · {pendingTakeoverRequests.length}</span>
                <span aria-hidden="true">{takeoverRequestsOpen ? "−" : "+"}</span>
              </button>
              {takeoverRequestsOpen && (
                <div className="rescue-takeover-card-body">
                  {pendingTakeoverRequests.length === 0 ? (
                    <p className="dispatch-empty">No pending takeover requests.</p>
                  ) : (
                    pendingTakeoverRequests.map((req) => (
                      <div
                        key={req.id}
                        className={`rescue-takeover-request${req.id === initialTakeoverRequestId ? " rescue-takeover-request-linked" : ""}`}
                        ref={(element) => {
                          if (element) takeoverRequestRefs.current.set(req.id, element);
                          else takeoverRequestRefs.current.delete(req.id);
                        }}
                      >
                        <div className="rescue-takeover-request-copy">
                          <strong>{req.requestedByName ?? "Another dispatcher"}</strong>
                          <p>{req.reason}</p>
                          <time dateTime={req.createdAt}>Submitted {formatDateTime(req.createdAt)}</time>
                        </div>
                        {confirmingTakeoverId === req.id ? (
                          <div className="rescue-takeover-confirmation">
                            <p>
                              Transfer this mission to {req.requestedByName ?? "this dispatcher"}? It will move from
                              your active missions to theirs.
                            </p>
                            <div className="rescue-takeover-actions">
                              <button
                                type="button"
                                className="teal-button"
                                disabled={isActionSubmitting}
                                onClick={() => {
                                  setConfirmingTakeoverId(null);
                                  void onDecideTakeover(req.id, mission.reference, "approved");
                                }}
                              >
                                Confirm transfer
                              </button>
                              <button
                                type="button"
                                className="ghost-button"
                                disabled={isActionSubmitting}
                                onClick={() => setConfirmingTakeoverId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="rescue-takeover-actions">
                            <button
                              type="button"
                              className="teal-button"
                              disabled={isActionSubmitting}
                              onClick={() => setConfirmingTakeoverId(req.id)}
                            >
                              Approve transfer
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              disabled={isActionSubmitting}
                              onClick={() => void onDecideTakeover(req.id, mission.reference, "declined")}
                            >
                              Decline
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </section>
          )}
          </>
        </div>
      )}

      {!isResolvedDispatcherView && (
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
          <RescueProgressTimeline report={{ ...mission, progress: mainMissionProgress(mission.progress) }} />
        </>
      )}
    </div>
  );
}

function MissionAcceptButton({
  isHandedOver,
  onAccept,
  onSuccess,
  showHint = true,
}: {
  isHandedOver: boolean;
  onAccept: () => Promise<boolean>;
  onSuccess?: () => void;
  showHint?: boolean;
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
      {showHint && (
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
      )}
      {error && <p className="invite-feedback error">{error}</p>}
      <button type="button" className="teal-button dispatch-save" onClick={() => void handleClick()} disabled={submitting}>
        {submitting ? "Accepting mission..." : "Accept Mission"}
      </button>
    </div>
  );
}

function AssignedMissionStartActions({
  getToken,
  onStart,
  onUpdate,
  onRelease,
}: {
  getToken: () => Promise<string | null>;
  onStart: (input: { notes?: string; imageUrls?: string[] }) => Promise<void>;
  onUpdate: (input: { updateType: RescueUpdateType; message?: string; imageUrls?: string[] }) => Promise<boolean>;
  onRelease: (reason: string) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleStart() {
    setError("");
    setSubmitting(true);
    try {
      await onStart({ notes: undefined, imageUrls: [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The mission could not be started.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mission-action-sections" aria-label="Assigned mission actions">
      <details className="mission-action-section">
        <summary className="mission-action-trigger">
          <span>Add notes or photos (optional)</span>
        </summary>
        <div className="mission-action-body">
          <QuickUpdateForm getToken={getToken} onUpdate={onUpdate} />
        </div>
      </details>
      <details className="mission-action-section">
        <summary className="mission-action-trigger">
          <span>Release Mission</span>
        </summary>
        <div className="mission-action-body">
          <ReleaseMissionForm isHandover={false} onRelease={onRelease} embedded />
        </div>
      </details>
      <button
        type="button"
        className="teal-button dispatch-save mission-start-cta"
        disabled={submitting}
        onClick={() => void handleStart()}
      >
        {submitting ? "Starting mission..." : "Start Mission"}
      </button>
      {error && <p className="invite-feedback error">{error}</p>}
    </div>
  );
}

// Release Mission (Assigned) / Request Handover (In Progress): the assigned
// dispatcher gives the alert up. The reason is required and lands on the
// timeline so the next dispatcher knows why. A handed-over rescue keeps its
// mission updates and resumes In Progress for the next dispatcher.
function ReleaseMissionForm({
  isHandover,
  onRelease,
  embedded = false,
}: {
  isHandover: boolean;
  onRelease: (reason: string) => Promise<void>;
  embedded?: boolean;
}) {
  const reasonId = useId();
  const [open, setOpen] = useState(false);
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

  if (!embedded && !open) {
    return (
      <button
        type="button"
        className="ghost-button mission-secondary-button"
        onClick={() => setOpen(true)}
      >
        {isHandover ? "Request Handover" : "Release Mission"}
      </button>
    );
  }

  return (
    <form
      className="mission-release-panel"
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
        )}
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
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            if (!embedded) setOpen(false);
            setError("");
          }}
          disabled={submitting}
        >
          Cancel
        </button>
        <button type="submit" className="danger-button dispatch-save" disabled={submitting}>
          {submitting ? "Releasing alert..." : isHandover ? "Confirm Handover" : "Confirm Release"}
        </button>
      </div>
    </form>
  );
}

function InProgressMissionActions({
  getToken,
  onUpdate,
  onDebrief,
  onRelease,
}: {
  getToken: () => Promise<string | null>;
  onUpdate: (input: { updateType: RescueUpdateType; message?: string; imageUrls?: string[] }) => Promise<boolean>;
  onDebrief: (input: DebriefInput) => Promise<void>;
  onRelease: (reason: string) => Promise<void>;
}) {
  return (
    <div className="mission-action-sections" aria-label="In-progress mission actions">
      <details className="mission-action-section">
        <summary className="mission-action-trigger">
          <span>Add update</span>
        </summary>
        <div className="mission-action-body">
          <QuickUpdateForm getToken={getToken} onUpdate={onUpdate} />
        </div>
      </details>
      <details className="mission-action-section">
        <summary className="mission-action-trigger">
          <span>Request Handover</span>
        </summary>
        <div className="mission-action-body">
          <ReleaseMissionForm isHandover onRelease={onRelease} embedded />
        </div>
      </details>
      <details className="mission-action-section mission-action-section--primary">
        <summary className="mission-action-trigger">
          <span>Resolve Mission</span>
        </summary>
        <div className="mission-action-body">
          <DebriefForm onDebrief={onDebrief} />
        </div>
      </details>
    </div>
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
  const [unsuccessfulDetails, setUnsuccessfulDetails] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const showUnsuccessfulDetails = outcome === "other";
  // "Animal could not be located" has no animal to describe, so the optional
  // condition field is hidden for that outcome and never submitted - even if
  // one was typed before the outcome was switched.
  const showAnimalCondition = outcome !== "not_located";

  // "Other" was retired for new dispatcher resolutions - historical debriefs
  // that used it still render in Mission History, but the Resolve Mission form
  // can no longer select or submit it.
  function validate(): string {
    if (!outcome) return "Select a rescue outcome.";
    if (outcome === "other") return '"Other" is no longer available as a rescue outcome.';
    if (!whatHappened.trim()) return "A debrief of what happened is required.";
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
        animalCondition: showAnimalCondition ? animalCondition.trim() || undefined : undefined,
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
          Review your debrief before confirming. Confirming marks this mission <strong>Resolved</strong>.
        </p>
        <div className="dispatch-field">
          <span className="dispatch-label">Rescue outcome</span>
          <strong>{RESCUE_OUTCOME_LABELS[outcome as RescueOutcome]}</strong>
        </div>
        <div className="dispatch-field">
          <span className="dispatch-label">What happened</span>
          <p className="rescue-confirm-text">{whatHappened.trim()}</p>
        </div>
        {showAnimalCondition && animalCondition.trim() && (
          <div className="dispatch-field">
            <span className="dispatch-label">Animal condition</span>
            <p className="rescue-confirm-text">{animalCondition.trim()}</p>
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
        Complete the mission with a short debrief.
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
          {(Object.keys(RESCUE_OUTCOME_LABELS) as RescueOutcome[])
            .filter((key) => key !== "other")
            .map((key) => (
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
      {showAnimalCondition && (
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

function MissionArchive({ mission }: { mission: RescueMission }) {
  const hasPin = mission.latitude != null && mission.longitude != null;
  const photos = [...new Set([...mission.photoUrls, ...mission.updates.flatMap((entry) => entry.imageUrls), ...mission.progress.flatMap((entry) => entry.imageUrls)])];
  const [tab, setTab] = useState<"location" | "photos" | "activity">(hasPin ? "location" : photos.length ? "photos" : "activity");
  return (
    <section className="mission-archive" aria-label="Mission records">
      <div className="mission-archive-tabs" role="group" aria-label="Mission record sections">
        <button type="button" aria-pressed={tab === "location"} onClick={() => setTab("location")}>Location</button>
        <button type="button" aria-pressed={tab === "photos"} onClick={() => setTab("photos")}>Photos <span>{photos.length}</span></button>
        <button type="button" aria-pressed={tab === "activity"} onClick={() => setTab("activity")}>Activity</button>
      </div>
      {tab === "location" && <div className="mission-location-pane">
        <div className="mission-location-info">
          <span className="mission-location-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg></span>
          <span className="eyebrow">On the ground</span>
          <h3>Where the rescue began</h3>
          <p>{mission.location}</p>
          <a href={hasPin ? `https://www.google.com/maps?q=${mission.latitude},${mission.longitude}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mission.location)}`} target="_blank" rel="noopener noreferrer">Open directions <span aria-hidden="true">?</span></a>
        </div>
        {hasPin ? <div className="mission-map-frame"><RescueReadOnlyMap latitude={mission.latitude!} longitude={mission.longitude!} /><div className="mission-map-caption"><span><i /> Reported position</span><span>{mission.latitude!.toFixed(5)}, {mission.longitude!.toFixed(5)}</span></div></div> : <p>No map pin was provided with this report.</p>}
      </div>}
      {tab === "photos" && <div className="mission-photo-pane">{photos.length ? photos.map((url, index) => <a href={url} key={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={`Mission photo ${index + 1} for ${mission.reference}`} loading="lazy" /><span>Photo {index + 1} ↗</span></a>) : <p>No photos were attached to this mission.</p>}</div>}
      {tab === "activity" && <ResolvedMissionActivity mission={mission} />}
    </section>
  );
}

function ResolvedMissionActivity({ mission }: { mission: RescueMission }) {
  const [limit, setLimit] = useState(5);
  const entries = [
    { id: "submitted", date: mission.createdAt, title: "Alert submitted", actor: mission.reporterName || "Reporter", detail: "Rescue report received.", photos: [] as string[], status: "submitted" as RescueReportStatus | null },
    ...mission.progress.filter((entry) => entry.toStatus !== "submitted").map((entry) => ({
      id: `progress-${entry.id}`, date: entry.createdAt, title: STATUS_BADGE_LABEL[entry.toStatus], actor: entry.dispatcherName || "SPCA team",
      detail: [entry.notes, entry.outcome ? RESCUE_OUTCOME_LABELS[entry.outcome] : null, entry.additionalRemarks].filter(Boolean).join(" · "), photos: entry.imageUrls, status: entry.toStatus as RescueReportStatus | null,
    })),
    ...mission.updates.map((entry) => ({ id: `update-${entry.id}`, date: entry.createdAt, title: RESCUE_UPDATE_TYPE_LABELS[entry.updateType], actor: entry.dispatcherName || "SPCA team", detail: entry.message || "", photos: entry.imageUrls, status: null as RescueReportStatus | null })),
  ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || a.id.localeCompare(b.id));
  return (
    <section className="mission-activity-section" aria-label="Complete mission activity">
      <header><div><p className="eyebrow">Every step of the rescue</p><h3>Mission journal</h3></div><span>{entries.length} updates &middot; Latest first</span></header>
      <ol>{entries.slice(0, limit).map((entry) => <li key={entry.id}>
        <time dateTime={entry.date}>{formatDateTime(entry.date)}</time>
        <span className={`mission-feed-marker${entry.status === "resolved" ? " complete" : ""}`} aria-hidden="true"><RescueSummaryIcon name={entry.status === "resolved" ? "check" : entry.status === "in_progress" ? "pulse" : entry.status === "assigned" ? "inbox" : "clipboard"} /></span>
        <div className="mission-feed-body"><div><strong>{entry.title}</strong><span>by {entry.actor}</span></div>{entry.detail && <p>{entry.detail}</p>}{entry.photos.length > 0 && <div className="mission-feed-photos">{entry.photos.map((url) => <a key={url} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={`${entry.title} evidence`} loading="lazy" /></a>)}</div>}</div>
      </li>)}</ol>
      {entries.length > limit && <button type="button" className="ghost-button" onClick={() => setLimit(entries.length)}>Show {entries.length - limit} more updates</button>}
    </section>
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

  const dispatcher = debrief.dispatcherName ?? mission.assignedTo ?? "SPCA team";
  const outcomeLabel = RESCUE_OUTCOME_LABELS[debrief.outcome] ?? debrief.outcome;

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
        <strong>{outcomeLabel}</strong>
      </div>

      <hr className="rescue-debrief-divider" />

      <div className="rescue-debrief-group">
        <div className="rescue-debrief-field">
          <span className="rescue-debrief-label">What happened</span>
          <p className="rescue-debrief-text">{debrief.whatHappened}</p>
        </div>
        {debrief.outcome !== "not_located" && debrief.animalCondition && (
          <div className="rescue-debrief-field">
            <span className="rescue-debrief-label">Animal condition</span>
            <p className="rescue-debrief-text">{debrief.animalCondition}</p>
          </div>
        )}
        {debrief.unsuccessfulDetails && (
          <div className="rescue-debrief-field">
            <span className="rescue-debrief-label">Additional outcome details</span>
            <p className="rescue-debrief-text">{debrief.unsuccessfulDetails}</p>
          </div>
        )}
      </div>

      <hr className="rescue-debrief-divider" />

      <p className="rescue-debrief-meta">
        <span>{dispatcher}</span>
        <span className="rescue-debrief-meta-sep" aria-hidden="true">
          ·
        </span>
        <span>{formatDateTime(debrief.createdAt)}</span>
      </p>
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
