import { SignInButton, useAuth, useUser } from "@clerk/react";
import { useEffect, useState } from "react";
import spcaLogo from "../assets/spca-logo.png";
import { fetchAllAdoptionApplications } from "../services/adoptionsApi";
import type { AdoptionApplication } from "../types/adoption";
import { isDevBypassEnabled } from "../utils/devBypass";
import { SiteHeader, type SiteHeaderView } from "./SiteHeader";

type StaffDashboardProps = {
  onNavigate: (
    view: SiteHeaderView | "register-animal" | "manage-animals" | "manage-rescue-reports" | "manage-adoption-applications",
  ) => void;
};

type StaffRole = "staff" | "veterinarian";

// Work-queue rows are shortcuts to the screen that resolves them. They carry no
// counts of their own: this dashboard only has a data source for the adoption
// queue (fetched from GET /api/adoptions below), so the other rows describe the
// action instead of asserting a number nothing here can verify.
type QueueItem = {
  title: string;
  detail: string;
  dotClass: string;
  view: SiteHeaderView;
};

const queueItems: QueueItem[] = [
  {
    title: "Rescue alerts",
    detail: "Review incoming rescue reports",
    dotClass: "urgent",
    view: "manage-rescue-reports",
  },
  {
    title: "Animals awaiting intake",
    detail: "Finish profiles that still need details",
    dotClass: "active",
    view: "manage-animals",
  },
  {
    title: "Adoption applications",
    detail: "",
    dotClass: "adoption",
    view: "manage-adoption-applications",
  },
];

// Approved/completed, rejected and withdrawn are already resolved, so only
// submitted and under_review applications are "awaiting a staff decision".
function isAwaitingDecision(status: AdoptionApplication["status"]): boolean {
  return status === "submitted" || status === "under_review";
}

// A real count can be unknown while it loads (or if the queue call fails) -
// shown as a dash rather than a made-up number.
function metricValue(value: number | null): string {
  return value === null ? "—" : String(value);
}

export function StaffDashboard({ onNavigate }: StaffDashboardProps) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const role = user?.publicMetadata.role;
  const hasStaffAccess = isDevBypassEnabled || role === "staff" || role === "veterinarian";
  const roleLabel: Record<StaffRole, string> = {
    staff: "SPCA staff",
    veterinarian: "Veterinarian",
  };
  const currentRole = roleLabel[role as StaffRole] ?? "Staff";

  // The real adoption review queue (staff-only endpoint). Null until it has
  // loaded, so the tiles can tell "not loaded" apart from a genuine zero.
  const [applications, setApplications] = useState<AdoptionApplication[] | null>(null);
  const [queueError, setQueueError] = useState("");

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !hasStaffAccess) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const rows = await fetchAllAdoptionApplications(token);
        if (!cancelled) setApplications(rows);
      } catch {
        // Leave the counts unknown ("—") rather than inventing a value; the
        // review queue itself still surfaces the load error to the reviewer.
        if (!cancelled) setQueueError("Adoption applications could not be loaded.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken, hasStaffAccess, isLoaded, isSignedIn]);

  const newSubmissions =
    applications?.filter((application) => application.status === "submitted").length ?? null;
  const underReview =
    applications?.filter((application) => application.status === "under_review").length ?? null;
  const awaitingDecision =
    newSubmissions === null || underReview === null ? null : newSubmissions + underReview;
  // Pending applications that cannot be approved yet because a veterinarian has
  // not cleared the animal - the same gate adoptions.service enforces.
  const awaitingClearance =
    applications?.filter(
      (application) =>
        isAwaitingDecision(application.status) &&
        application.animal !== null &&
        !application.animal.medicallyCleared,
    ).length ?? null;

  const adoptionQueueDetail = queueError
    ? queueError
    : applications === null
      ? "Loading applications…"
      : awaitingDecision === 0
        ? "No applications are waiting for review"
        : `${awaitingDecision} ${
            awaitingDecision === 1 ? "application is" : "applications are"
          } ready for review`;

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
          <p>
            Staff and veterinary workspaces are available to authorised team
            members.
          </p>
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
          <p>Your account does not have staff or veterinary permissions.</p>
          <button
            type="button"
            className="teal-button"
            onClick={() => onNavigate("home")}
          >
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
        currentPage="staff-dashboard"
        onNavigate={onNavigate}
      />

      <section className="dashboard-welcome">
        <div>
          <span className="role-pill teal-pill">{currentRole}</span>
          <p className="eyebrow">Today&apos;s priorities</p>
          <h2>Keep every animal moving toward care.</h2>
          <p>
            Welcome back, {user?.firstName ?? "team member"}. Review the queue
            and keep rescue, intake, adoption, and medical records up to date.
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => onNavigate("my-profile")}
          >
            Edit my profile
          </button>
        </div>
        <div className="dashboard-actions">
          <button
            type="button"
            className="dashboard-action-button"
            onClick={() => onNavigate("manage-rescue-reports")}
          >
            Rescue Alerts
          </button>
          <button
            type="button"
            className="dashboard-action-button"
            onClick={() => onNavigate("manage-adoption-applications")}
          >
            Adoption Applications
          </button>
          <button
            type="button"
            className="dashboard-action-button"
            onClick={() => onNavigate("register-animal")}
          >
            Register Animal
          </button>
          <button
            type="button"
            className="dashboard-action-button"
            onClick={() => onNavigate("manage-animals")}
          >
            Manage Animal Profiles
          </button>
          <button
            type="button"
            className="dashboard-action-button"
            onClick={() => onNavigate("home")}
          >
            View Public Listings
          </button>
        </div>
      </section>

      {/* Every tile is derived from the real adoption queue above; the
          rescue/intake/appointment counters this used to show were hardcoded
          and had no data source here, so they were removed rather than faked. */}
      <section className="dashboard-metrics" aria-label="Adoption review summary">
        <article>
          <span>Applications</span>
          <strong>{metricValue(awaitingDecision)}</strong>
          <small>Submitted or under review</small>
        </article>
        <article>
          <span>New submissions</span>
          <strong>{metricValue(newSubmissions)}</strong>
          <small>Not yet opened</small>
        </article>
        <article>
          <span>Under review</span>
          <strong>{metricValue(underReview)}</strong>
          <small>Being assessed</small>
        </article>
        <article>
          <span>Awaiting clearance</span>
          <strong>{metricValue(awaitingClearance)}</strong>
          <small>Cannot be approved yet</small>
        </article>
      </section>

      <section className="activity-panel dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Work queue</p>
            <h2>Items needing attention</h2>
          </div>
        </div>
        <div className="activity-list">
          {queueItems.map((item) => (
            <div key={item.title}>
              <span className={`activity-dot ${item.dotClass}`} />
              <p>
                <strong>{item.title}</strong>
                <span>
                  {item.view === "manage-adoption-applications"
                    ? adoptionQueueDetail
                    : item.detail}
                </span>
              </p>
              <button
                type="button"
                className="mini-button"
                onClick={() => onNavigate(item.view)}
              >
                Open queue
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
