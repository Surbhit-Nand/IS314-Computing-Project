import { SignInButton, useAuth, useUser } from "@clerk/react";
import { isDevBypassEnabled } from "../utils/devBypass";
import { SiteHeader, type SiteHeaderView } from "./SiteHeader";

type StaffDashboardProps = {
  onNavigate: (
    view: SiteHeaderView | "register-animal" | "manage-animals" | "manage-rescue-reports" | "manage-adoption-applications",
  ) => void;
};

type StaffRole = "staff" | "veterinarian";

const queueItems = [
  ["Rescue reports", "6 reports need an initial review", "urgent"],
  ["Animals awaiting intake", "4 animals need profile details", "active"],
  ["Adoption applications", "8 applications are ready for review", "pending"],
  ["Medical follow-ups", "3 appointments are scheduled today", "medical"],
];

export function StaffDashboard({ onNavigate }: StaffDashboardProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const role = user?.publicMetadata.role;
  const hasStaffAccess = isDevBypassEnabled || role === "staff" || role === "veterinarian";
  const roleLabel: Record<StaffRole, string> = {
    staff: "SPCA staff",
    veterinarian: "Veterinarian",
  };
  const currentRole = roleLabel[role as StaffRole] ?? "Staff";

  if (!isLoaded || !isSignedIn) {
    return (
      <main className="dashboard-locked">
        <div className="dashboard-locked-card">
          <p className="eyebrow">ARA operations</p>
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
          <p className="eyebrow">ARA operations</p>
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
        </div>
        <div className="dashboard-actions">
          <button
            type="button"
            className="dashboard-action-button"
            onClick={() => onNavigate("manage-rescue-reports")}
          >
            Rescue Reports
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

      <section className="dashboard-metrics" aria-label="Staff work summary">
        <article>
          <span>Rescue reports</span>
          <strong>6</strong>
          <small>Awaiting initial review</small>
        </article>
        <article>
          <span>Animals to intake</span>
          <strong>4</strong>
          <small>Profiles need attention</small>
        </article>
        <article>
          <span>Applications</span>
          <strong>8</strong>
          <small>Ready for review</small>
        </article>
        <article>
          <span>Appointments today</span>
          <strong>3</strong>
          <small>Scheduled follow-ups</small>
        </article>
      </section>

      <section className="activity-panel dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Work queue</p>
            <h2>Items needing attention</h2>
          </div>
          <span className="panel-note">Updated just now</span>
        </div>
        <div className="activity-list">
          {queueItems.map(([title, detail, status]) => (
            <div key={title}>
              <span className={`activity-dot ${status}`} />
              <p>
                <strong>{title}</strong>
                <span>{detail}</span>
              </p>
              <span className="role-pill muted">Open queue</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
