import { SignInButton, useAuth, useUser } from "@clerk/react";
import spcaLogo from "../assets/spca-logo.png";
import { SiteHeader, type SiteHeaderView } from "./SiteHeader";
import { IconCalendar, IconClipboard, IconHeart, IconPawPrint, IconCheck } from "./MedicalIcons";
import "./UserDashboard.css";
import { useEffect, useState } from "react";
import { accountDate, fetchAccountSummary } from "../services/accountSummary";
import { accountDataChanged } from "../utils/appointments";
import { useFavoriteAnimals } from "../utils/favorites";
import { DonateModal } from "../features/donations/DonateModal";

type UserDashboardProps = { onNavigate: (view: SiteHeaderView | "vet-appointments") => void };

export function UserDashboard({ onNavigate }: UserDashboardProps) {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth();
  const { user } = useUser();
  const { favoriteCount } = useFavoriteAnimals();
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof fetchAccountSummary>> | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [donateOpen, setDonateOpen] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    let loading = false;
    let refreshPending = false;
    async function refresh() {
      if (loading) { refreshPending = true; return; }
      loading = true;
      try {
        const token = await getToken();
        if (!token) throw new Error("Sign in again to load your account.");
        const next = await fetchAccountSummary(token);
        if (!cancelled) {
          setSummary(next);
          setSummaryError(next.incomplete ? "Some account information could not be loaded. Unavailable counts are shown as —." : "");
        }
      } catch {
        if (!cancelled) { setSummary(null); setSummaryError("Account information could not be loaded. Please try again shortly."); }
      } finally {
        loading = false;
        if (refreshPending && !cancelled) { refreshPending = false; void refresh(); }
      }
    }
    const timer = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 30000);
    const onRefresh = () => { void refresh(); };
    window.addEventListener("focus", onRefresh);
    window.addEventListener(accountDataChanged, onRefresh);
    const onStorage = (event: StorageEvent) => { if (event.key === accountDataChanged) onRefresh(); };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener(accountDataChanged, onRefresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [getToken, isLoaded, isSignedIn, userId]);

  if (!isLoaded || !isSignedIn) {
    return (
      <main className="dashboard-locked">
        <div className="dashboard-locked-card">
          <div className="auth-brand">
            <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
            <strong>SPCA Fiji</strong>
          </div>
          <p className="eyebrow">Your SPCA account</p>
          <h1>Sign in to continue</h1>
          <p>
            Log in to view your applications, alerts, appointments, and saved
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
    <main className="user-dashboard-page user-dashboard-minimal">
      <SiteHeader
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage="user-dashboard"
        onNavigate={onNavigate}
      />

      <section className="user-welcome dashboard-welcome">
        <div>
          <p className="eyebrow">Your SPCA account</p>
          <h1>Welcome back, {user?.firstName ?? "Friend"}.</h1>
          <p>
            Your animals, applications and care. All in one place.
          </p>
        </div>
        <div className="user-welcome-actions">
        <button
          type="button"
          className="teal-button"
          onClick={() => onNavigate("my-animals")}
        >
          My Animals
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => onNavigate("my-reports")}
        >
          My Alerts
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => onNavigate("animal-listings")}
        >
          Browse animals
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => onNavigate("my-profile")}
        >
          Edit my profile
        </button>
        </div>
      </section>

      {summaryError && <p className="account-summary-error" role="alert">{summaryError}</p>}
      <section className="user-dashboard-grid" aria-label="Account summary" aria-busy={!summary && !summaryError}>
        <article className="user-stat-card">
          <span className="user-stat-label">Applications <IconClipboard size={18} /></span>
          <strong>{summary?.applications ?? "—"}</strong>
          <small>{summary?.pending == null ? "Awaiting account data" : `${summary.pending} awaiting review`}</small>
        </article>
        <article className="user-stat-card">
          <span className="user-stat-label">Rescue alerts <IconPawPrint size={18} /></span>
          <strong>{summary?.reports ?? "—"}</strong>
          <small>Your submitted rescue reports</small>
        </article>
        <article className="user-stat-card">
          <span className="user-stat-label">Vet appointments <IconCalendar size={18} /></span>
          <strong>{summary?.upcoming?.length ?? "—"}</strong>
          <small>{summary?.upcoming ? (summary.upcoming[0] ? `${summary.upcoming[0].animalName} · ${accountDate(summary.upcoming[0].appointmentDate)}` : "No upcoming appointments") : "Awaiting appointment data"}</small>
        </article>
        <article className="user-stat-card">
          <span className="user-stat-label">My animals <IconHeart size={18} /></span>
          <strong>{summary?.animals ?? "—"}</strong>
          <small>{favoriteCount} saved to your browser</small>
        </article>
      </section>

      <section className="user-dashboard-columns">
        <div className="dashboard-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Your activity</p>
              <h2>Recent updates</h2>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() => onNavigate("my-applications")}
            >
              View my applications
            </button>
          </div>
          <div className="user-activity-list">
            {!summary && !summaryError && <p className="account-activity-empty" role="status">Loading your latest activity…</p>}
            {summary && summary.activity.length === 0 && <p className="account-activity-empty">{summary.incomplete ? "Activity is temporarily unavailable." : "Your applications, rescue reports and appointments will appear here."}</p>}
            {summary?.activity.map(({ id, title, detail, status, tone: statusClass, view }) => (
              <div key={id}>
                <span className={`user-activity-icon ${statusClass}`} aria-hidden="true">
                  {statusClass === "confirmed" ? <IconCheck size={18} /> : statusClass === "pending" ? <IconClipboard size={18} /> : <IconPawPrint size={18} />}
                </span>
                <p>
                  <strong><button type="button" className="text-button account-activity-link" onClick={() => onNavigate(view)}>{title}<span className="activity-link-arrow" aria-hidden="true"> ↗</span></button></strong>
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
              <p className="eyebrow">Quick links</p>
              <h2>How can we help?</h2>
            </div>
          </div>
          <button
            type="button"
            className="user-action-button"
            onClick={() => onNavigate("my-animals")}
          >
            <strong>View My Animals</strong>
            <span>See your adopted animals, veterinary records and appointments.</span>
          </button>
          <button
            type="button"
            className="user-action-button"
            onClick={() => onNavigate("animal-listings")}
          >
            <strong>Apply to adopt an animal</strong>
            <span>Start an adoption application from any animal profile.</span>
          </button>
          <button type="button" className="user-action-button" onClick={() => onNavigate("my-reports")}>
            <strong>My Alerts</strong>
            <span>Track your rescue reports and updates from the team.</span>
          </button>
          <button
            type="button"
            className="user-action-button"
            onClick={() => onNavigate("rescue-report")}
          >
            <strong>Submit a rescue alert</strong>
            <span>Tell SPCA Fiji about an animal that needs help.</span>
          </button>
          <button type="button" className="user-action-button" onClick={() => onNavigate("my-animals")}>
            <strong>Book a vet follow-up</strong>
            <span>Choose one of your animals to book their next visit.</span>
          </button>
          <button type="button" className="user-action-button" onClick={() => setDonateOpen(true)}>
            <strong>Support the rescue network</strong>
            <span>Make a donation through secure checkout.</span>
          </button>
        </div>
      </section>
      <DonateModal open={donateOpen} onClose={() => setDonateOpen(false)} />
    </main>
  );
}
