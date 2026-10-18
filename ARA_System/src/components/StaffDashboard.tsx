import { SignInButton, useAuth, useUser } from "@clerk/react";
import spcaLogo from "../assets/spca-logo.png";
import { isDevBypassEnabled } from "../utils/devBypass";
import { SiteHeader, type SiteHeaderView } from "./SiteHeader";
import { useCallback, useEffect, useState } from "react";
import { fetchStaffAnimals } from "../services/animalsApi";
import { fetchAllAdoptionApplications } from "../services/adoptionsApi";
import { fetchAllRescueReports } from "../services/rescueApi";
import { useAccountRefresh } from "../utils/useAccountRefresh";
import { IconPawPrint, IconClipboard, IconHeart, IconMedical } from "./MedicalIcons";

type StaffDashboardProps = {
  onNavigate: (
    view: SiteHeaderView | "register-animal" | "manage-animals" | "manage-rescue-reports" | "manage-adoption-applications",
  ) => void;
};

type StaffRole = "staff" | "veterinarian";

export function StaffDashboard({ onNavigate }: StaffDashboardProps) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const role = user?.publicMetadata.role;
  const hasStaffAccess = isDevBypassEnabled || role === "staff" || role === "veterinarian";
  const roleLabel: Record<StaffRole, string> = {
    staff: "SPCA staff",
    veterinarian: "Veterinarian",
  };
  const currentRole = roleLabel[role as StaffRole] ?? "Staff";
  const [counts, setCounts] = useState<{ rescue: number | null; intake: number | null; applications: number | null; care: number | null } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const [animals, applications, reports] = await Promise.allSettled([
        fetchStaffAnimals(token), fetchAllAdoptionApplications(token), fetchAllRescueReports(token),
      ]);
      setCounts({
        rescue: reports.status === "fulfilled" ? reports.value.filter((entry) => entry.status === "submitted").length : null,
        intake: animals.status === "fulfilled" ? animals.value.filter((entry) => entry.status === "intake").length : null,
        care: animals.status === "fulfilled" ? animals.value.filter((entry) => entry.status === "in_treatment").length : null,
        applications: applications.status === "fulfilled" ? applications.value.filter((entry) => ["submitted", "under_review"].includes(entry.status)).length : null,
      });
      setError([animals, applications, reports].some((entry) => entry.status === "rejected") ? "Some work queue information is unavailable. Counts shown as — could not be loaded." : "");
      setUpdatedAt(new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: "Pacific/Fiji" }));
    } catch { setCounts(null); setError("Work queue information could not be loaded."); }
  }, [getToken]);
  useEffect(() => {
    if (!isSignedIn || !hasStaffAccess) return;
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [isSignedIn, hasStaffAccess, refresh]);
  const backgroundRefresh = useCallback(() => { void refresh(); }, [refresh]);
  useAccountRefresh(Boolean(isSignedIn && hasStaffAccess), backgroundRefresh);
  const queueItems = [
    ["Rescue alerts", counts?.rescue == null ? "Unavailable" : `${counts.rescue} awaiting initial review`, "urgent"],
    ["Animals awaiting intake", counts?.intake == null ? "Unavailable" : `${counts.intake} animals at intake`, "active"],
    ["Adoption applications", counts?.applications == null ? "Unavailable" : `${counts.applications} awaiting review`, "pending"],
    ["Animals in treatment", counts?.care == null ? "Unavailable" : `${counts.care} animals receiving care`, "medical"],
  ];

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

      <section className="staff-overview-header">
        <div>
          <p className="eyebrow">Staff overview</p>
          <h1>Welcome back, {user?.firstName ?? "team member"}.</h1>
          <p>Your rescue, intake and adoption queues at a glance.</p>
        </div>
        <span className="staff-overview-role">{currentRole}</span>
      </section>

      {error && <p className="form-error" role="alert">{error}</p>}
      <section className="dashboard-metrics" aria-label="Staff work summary">
        <article>
          <span className="workspace-metric-icon"><IconClipboard size={18} /></span>
          <span>Rescue alerts</span>
          <strong>{counts?.rescue ?? "—"}</strong>
          <small>Awaiting initial review</small>
        </article>
        <article>
          <span className="workspace-metric-icon"><IconPawPrint size={18} /></span>
          <span>Animals to intake</span>
          <strong>{counts?.intake ?? "—"}</strong>
          <small>Profiles need attention</small>
        </article>
        <article>
          <span className="workspace-metric-icon"><IconHeart size={18} /></span>
          <span>Applications</span>
          <strong>{counts?.applications ?? "—"}</strong>
          <small>Ready for review</small>
        </article>
        <article>
          <span className="workspace-metric-icon"><IconMedical size={18} /></span>
          <span>Animals in treatment</span>
          <strong>{counts?.care ?? "—"}</strong>
          <small>Currently receiving care</small>
        </article>
      </section>

      <section className="activity-panel dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Work queue</p>
            <h2>Items needing attention</h2>
          </div>
          <span className="panel-note">{updatedAt ? `Last checked ${updatedAt} Fiji time` : "Loading work queue…"}</span>
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
