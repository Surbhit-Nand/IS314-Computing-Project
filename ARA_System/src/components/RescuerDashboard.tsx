import { SignInButton, useAuth, useUser } from "@clerk/react";
import spcaLogo from "../assets/spca-logo.png";
import { isDevBypassEnabled } from "../utils/devBypass";
import { SiteHeader, type SiteHeaderView } from "./SiteHeader";

type RescuerDashboardProps = {
  onNavigate: (
    view: SiteHeaderView | "manage-rescue-reports" | "rescue-report-phone",
  ) => void;
};

// Dedicated workspace for the rescuer role - the team member who handles
// rescue reports. Grants same narrow dashboard in the header; server-side
// access to the rescue queue is gated by requireRescuerOrAbove on the rescue
// routes (wired by the module owner).
export function RescuerDashboard({ onNavigate }: RescuerDashboardProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const role = user?.publicMetadata.role;
  const hasRescuerAccess = isDevBypassEnabled || role === "rescuer";

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
            The rescue workspace is available to authorised rescuers and SPCA
            team members.
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

  if (!hasRescuerAccess) {
    return (
      <main className="dashboard-locked">
        <div className="dashboard-locked-card">
          <div className="auth-brand">
            <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
            <strong>SPCA Fiji</strong>
          </div>
          <p className="eyebrow">SPCA operations</p>
          <h1>Access restricted</h1>
          <p>Your account does not have rescuer permissions.</p>
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
        currentPage="rescuer-dashboard"
        onNavigate={onNavigate}
      />

      <section className="dashboard-welcome">
        <div>
          <span className="role-pill teal-pill">Rescuer</span>
          <p className="eyebrow">Today&apos;s priorities</p>
          <h2>Review reports and get rescuers on the move.</h2>
          <p>
            Welcome back, {user?.firstName ?? "team member"}. The rescue queue
            brings in every online and phone report for dispatch.
          </p>
        </div>
        <div className="dashboard-actions">
          <button
            type="button"
            className="dashboard-action-button"
            onClick={() => onNavigate("manage-rescue-reports")}
          >
            Rescue Queue
          </button>
          <button
            type="button"
            className="dashboard-action-button"
            onClick={() => onNavigate("rescue-report-phone")}
          >
            Log Phone Report
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

      <section className="dashboard-metrics" aria-label="Rescue work summary">
        <article>
          <span>Rescue reports</span>
          <strong>—</strong>
          <small>Queue wiring in progress</small>
        </article>
        <article>
          <span>Pending dispatch</span>
          <strong>—</strong>
          <small>Awaiting assignment</small>
        </article>
        <article>
          <span>Phone intakes</span>
          <strong>—</strong>
          <small>Logged by your team</small>
        </article>
        <article>
          <span>Closed reports</span>
          <strong>—</strong>
          <small>Resolved cases</small>
        </article>
      </section>

      <section className="activity-panel dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Rescue queue</p>
            <h2>Dispatch reports as they arrive</h2>
          </div>
          <button
            type="button"
            className="teal-button small-button"
            onClick={() => onNavigate("manage-rescue-reports")}
          >
            Open queue
          </button>
        </div>
        <div className="activity-list">
          <p className="dashboard-data-state">
            The rescue queue is being wired up. Once live, every report will
            land here for assignment and dispatch.
          </p>
        </div>
      </section>
    </main>
  );
}