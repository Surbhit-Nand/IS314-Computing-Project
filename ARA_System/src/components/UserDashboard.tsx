import { SignInButton, useAuth, useUser } from "@clerk/react";
import { SiteHeader, type SiteHeaderView } from "./SiteHeader";

type UserDashboardProps = {
  onNavigate: (view: SiteHeaderView | "rescue-report" | "my-reports") => void;
};

const activity = [
  [
    "Adoption application",
    "Niko · Submitted 2 days ago",
    "Under review",
    "pending",
  ],
  [
    "Rescue report",
    "Report #RR-1024 · Suva",
    "Assigned to SPCA staff",
    "active",
  ],
  ["Vet follow-up", "Ginger · 12 September 2026", "Booked", "confirmed"],
];

export function UserDashboard({ onNavigate }: UserDashboardProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  if (!isLoaded || !isSignedIn) {
    return (
      <main className="dashboard-locked">
        <div className="dashboard-locked-card">
          <p className="eyebrow">Your ARA account</p>
          <h1>Sign in to continue</h1>
          <p>
            Log in to view your applications, reports, appointments, and saved
            animals.
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

  return (
    <main className="user-dashboard-page">
      <SiteHeader
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage="user-dashboard"
        onNavigate={onNavigate}
      />

      <section className="user-welcome dashboard-welcome">
        <div>
          <span className="role-pill teal-pill">Registered user</span>
          <p className="eyebrow">Welcome back</p>
          <h2>{user?.firstName ?? "Friend"}, follow your ARA journey.</h2>
          <p>
            Signed in as{" "}
            {user?.primaryEmailAddress?.emailAddress ?? "Clerk user"}. Keep
            track of the animals and requests that matter to you.
          </p>
        </div>
        <button
          type="button"
          className="teal-button"
          onClick={() => onNavigate("home")}
        >
          Browse animals
        </button>
      </section>

      <section className="user-dashboard-grid" aria-label="Account summary">
        <article className="user-stat-card">
          <span>Applications</span>
          <strong>1</strong>
          <small>1 under review</small>
        </article>
        <article className="user-stat-card">
          <span>Rescue reports</span>
          <strong>1</strong>
          <small>Latest report assigned</small>
        </article>
        <article className="user-stat-card">
          <span>Vet appointments</span>
          <strong>1</strong>
          <small>Next appointment booked</small>
        </article>
        <article className="user-stat-card">
          <span>Saved animals</span>
          <strong>3</strong>
          <small>Ready to revisit</small>
        </article>
      </section>

      <section className="user-dashboard-columns">
        <div className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Your activity</p>
              <h2>Recent updates</h2>
            </div>
            <button type="button" className="text-button">
              View history
            </button>
          </div>
          <div className="user-activity-list">
            {activity.map(([title, detail, status, statusClass]) => (
              <div key={title}>
                <span className={`user-activity-icon ${statusClass}`}>
                  {statusClass === "confirmed" ? "✓" : "•"}
                </span>
                <p>
                  <strong>{title}</strong>
                  <span>{detail}</span>
                </p>
                <span className={`user-status ${statusClass}`}>{status}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="dashboard-panel user-actions-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Need help?</p>
              <h2>Start something new</h2>
            </div>
          </div>
          <button
            type="button"
            className="user-action-button"
            onClick={() => onNavigate("rescue-report")}
          >
            <strong>Submit a rescue report</strong>
            <span>Tell SPCA Fiji about an animal that needs help.</span>
          </button>
          <button type="button" className="user-action-button">
            <strong>Book a vet follow-up</strong>
            <span>Arrange care for a rescued animal.</span>
          </button>
          <button type="button" className="user-action-button">
            <strong>Support the rescue network</strong>
            <span>Make a donation through secure checkout.</span>
          </button>
        </div>
      </section>
    </main>
  );
}
