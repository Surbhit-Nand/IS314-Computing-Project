import { SignInButton, SignUpButton, UserButton, useAuth, useUser } from "@clerk/react";
import { useEffect, useState } from "react";
import spcaLogo from "../assets/spca-logo.png";
import { DonateModal } from "../features/donations/DonateModal";
import {
  fetchMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notificationsApi";
import type { NotificationsInbox } from "../types/notification";
import { isDevBypassEnabled } from "../utils/devBypass";
import { isDispatcherRole } from "../utils/roles";

export type SiteHeaderView =
  | "home"
  | "animal-listings"
  | "animal-profile"
  | "about"
  | "login"
  | "register"
  | "dashboard"
  | "staff-dashboard"
  | "dispatcher-dashboard"
  | "rescue-board"
  | "rescue-active"
  | "rescue-history"
  | "user-dashboard"
  | "rescue-report"
  | "my-reports"
  | "adoption-apply"
  | "my-applications"
  | "my-profile"
  | "manage-adoption-applications"
  | "register-animal"
  | "manage-animals"
  | "edit-animal"
  | "manage-rescue-reports"
  | "rescue-report-phone"
  | "reports"
  | "veterinary-dashboard"
  | "veterinary-record"
  | "vet-appointments"
  | "vet-appointment-details";

type SiteHeaderProps = {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  currentPage: string;
  onNavigate: (view: SiteHeaderView) => void;
  // The veterinary module is a focused work screen: hide the public-site
  // links (Home, About Us, Animals, Rescue Report, Adopt, Donate) so vets
  // aren't shown navigation they don't use inside the module.
  hideSiteNav?: boolean;
};

// Shared public-site header. On screens narrower than 980px the nav links
// collapse into a hamburger-toggled dropdown anchored under the top-left menu
// button; the auth/account actions always stay pinned top-right.
export function SiteHeader({
  isLoaded,
  isSignedIn,
  currentPage,
  onNavigate,
  hideSiteNav = false,
}: SiteHeaderProps) {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  // Applicant inbox for the header bell. Fetched on sign-in and refreshed
  // every minute so adoption status moves surface without a page reload.
  // Failures stay silent - the bell just shows nothing rather than breaking
  // the header when the API is down.
  const [inbox, setInbox] = useState<NotificationsInbox | null>(null);
  const [bellOpen, setBellOpen] = useState(false);

  useEffect(() => {
    // The bell only renders for signed-in sessions, so nothing needs clearing
    // on sign-out - the next sign-in overwrites the inbox below.
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    async function loadInbox() {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const data = await fetchMyNotifications(token);
        if (!cancelled) setInbox(data);
      } catch {
        if (!cancelled) setInbox(null);
      }
    }
    void loadInbox();
    const timer = window.setInterval(() => void loadInbox(), 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [getToken, isLoaded, isSignedIn]);

  async function handleMarkAllRead() {
    try {
      const token = await getToken();
      if (!token) return;
      await markAllNotificationsRead(token);
      setInbox((previous) =>
        previous
          ? { items: previous.items.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })), unreadCount: 0 }
          : previous,
      );
    } catch {
      // Leave the bell as-is; the next poll retries.
    }
  }

  async function handleOpenNotification(id: string, entityType: string | null) {
    setBellOpen(false);
    try {
      const token = await getToken();
      if (!token) return;
      await markNotificationRead(token, id);
      setInbox((previous) =>
        previous
          ? {
              items: previous.items.map((item) =>
                item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item,
              ),
              unreadCount: Math.max(0, previous.unreadCount - 1),
            }
          : previous,
      );
    } catch {
      // Read state syncs on the next poll.
    }
    if (entityType === "adoption_application") {
      navigate("my-applications");
    }
  }
  const userRole = user?.publicMetadata.role;
  const isAdmin = userRole === "manager" || userRole === "admin";
  const isDispatcher = isDispatcherRole(userRole);
  const isVeterinarian = userRole === "veterinarian";
  // isDevBypassEnabled is OR'd in here only so the "Dashboard" nav buttons
  // appear locally without a real role - see src/utils/devBypass.ts.
  const isStaff = isDevBypassEnabled || isDispatcher || userRole === "staff" || isVeterinarian;
  // Module-level work (register animals, review adoptions) is staff work -
  // Dispatchers keep the rescue queue and public site only.
  const isStaffModuleRole =
    isDevBypassEnabled || isAdmin || userRole === "staff" || isVeterinarian;
  // Internal screens rendered by account-type dashboards and staff forms swap
  // the public prompts for team navigation; staff can still preview the
  // public site through the "View public site" link.
  const internalPages = new Set([
    "dashboard",
    "staff-dashboard",
    "dispatcher-dashboard",
    "register-animal",
    "manage-animals",
    "edit-animal",
    "manage-rescue-reports",
    "reports",
  ]);
  const isInternalPage = (isStaff || isAdmin) && internalPages.has(currentPage);
  const isRescuePage = new Set(["rescue-board", "rescue-active", "rescue-history"]).has(currentPage);

  function dashboardView(): SiteHeaderView {
    return isAdmin
      ? "dashboard"
      : isDispatcher
        ? "dispatcher-dashboard"
        : isVeterinarian
          ? "veterinary-dashboard"
          : "staff-dashboard";
  }

  function navigate(view: SiteHeaderView) {
    setMenuOpen(false);
    onNavigate(view);
  }

  return (
    <header className="site-header">
      {!hideSiteNav ? (
        <button
          type="button"
          className={`nav-toggle${menuOpen ? " open" : ""}`}
          aria-label="Toggle navigation menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
      ) : null}

      <button
        type="button"
        className="brand-group brand-button"
        onClick={() => navigate("home")}
      >
        <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
      </button>

      {!hideSiteNav ? (
      <nav
        className={`main-nav${menuOpen ? " open" : ""}`}
        aria-label="Main navigation"
      >
        {isRescuePage ? (
          <>
            <button type="button" className={currentPage === "rescue-board" ? "nav-link active" : "nav-link"} onClick={() => navigate("rescue-board")}>Mission Board</button>
            <button type="button" className={currentPage === "rescue-active" ? "nav-link active" : "nav-link"} onClick={() => navigate("rescue-active")}>Active Mission</button>
            <button type="button" className={currentPage === "rescue-history" ? "nav-link active" : "nav-link"} onClick={() => navigate("rescue-history")}>Mission History</button>
          </>
        ) : isInternalPage ? (
          <>
            {/* Staff-first layout: signed-in staff see team navigation on
                their internal screens, with the public site one click away. */}
            <button
              type="button"
              className={
                currentPage === dashboardView() ? "nav-link active" : "nav-link"
              }
              onClick={() => navigate(dashboardView())}
            >
              Dashboard
            </button>
            <button
              type="button"
              className={
                currentPage === "manage-rescue-reports"
                  ? "nav-link active"
                  : "nav-link"
              }
              onClick={() => navigate("manage-rescue-reports")}
            >
              Rescue queue
            </button>
            {isStaffModuleRole && (
              <button
                type="button"
                className={
                  currentPage === "manage-animals"
                    ? "nav-link active"
                    : "nav-link"
                }
                onClick={() => navigate("manage-animals")}
              >
                Animals
              </button>
            )}
            {isStaffModuleRole && (
              <button
                type="button"
                className={
                  currentPage === "register-animal"
                    ? "nav-link active"
                    : "nav-link"
                }
                onClick={() => navigate("register-animal")}
              >
                Register
              </button>
            )}
            {isStaffModuleRole && (
              <button
                type="button"
                className={
                  currentPage === "manage-adoption-applications"
                    ? "nav-link active"
                    : "nav-link"
                }
                onClick={() => navigate("manage-adoption-applications")}
              >
                Adoptions
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                className={
                  currentPage === "reports" ? "nav-link active" : "nav-link"
                }
                onClick={() => navigate("reports")}
              >
                Reports
              </button>
            )}
            <button
              type="button"
              className="nav-link"
              onClick={() => navigate("home")}
            >
              View public site
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={currentPage === "home" ? "nav-link active" : "nav-link"}
              onClick={() => navigate("home")}
            >
              Home
            </button>
            <button
              type="button"
              className={currentPage === "about" ? "nav-link active" : "nav-link"}
              onClick={() => navigate("about")}
            >
              About Us
            </button>
            <button
              type="button"
              className={
                currentPage === "animal-listings" ? "nav-link active" : "nav-link"
              }
              onClick={() => navigate("animal-listings")}
            >
              Animals
            </button>
            <button
              type="button"
              className={
                currentPage === "rescue-report" ? "nav-link active" : "nav-link"
              }
              onClick={() => navigate("rescue-report")}
            >
              Rescue Alert
            </button>
            {/* Staff, vets, and managers run the rescue operation, so the
                public adopt and donate prompts are hidden for their accounts. */}
            {!isStaff && !isAdmin && (
              <button
                type="button"
                className={
                  currentPage === "animal-listings" ? "nav-link active" : "nav-link"
                }
                onClick={() => navigate("animal-listings")}
              >
                Adopt
              </button>
            )}
            {!isStaff && !isAdmin && (
              <button
                type="button"
                className="nav-link"
                onClick={() => {
                  setMenuOpen(false);
                  setDonateOpen(true);
                }}
              >
                Donate
              </button>
            )}
          </>
        )}
      </nav>
      ) : null}

      <div className="header-actions">
        {!isLoaded ? null : isSignedIn ? (
          <>
            <div className="notification-bell-wrap">
              <button
                type="button"
                className="notification-bell"
                onClick={() => setBellOpen((open) => !open)}
                aria-label={inbox && inbox.unreadCount > 0 ? `Notifications, ${inbox.unreadCount} unread` : "Notifications"}
                aria-expanded={bellOpen}
              >
                <span aria-hidden="true">🔔</span>
                {inbox && inbox.unreadCount > 0 && (
                  <span className="notification-badge" aria-hidden="true">
                    {inbox.unreadCount > 9 ? "9+" : inbox.unreadCount}
                  </span>
                )}
              </button>
              {bellOpen && (
                <div className="notification-panel" role="dialog" aria-label="Notifications">
                  <div className="notification-panel-head">
                    <strong>Notifications</strong>
                    {inbox && inbox.unreadCount > 0 && (
                      <button type="button" className="mini-button" onClick={() => void handleMarkAllRead()}>
                        Mark all read
                      </button>
                    )}
                  </div>
                  {!inbox || inbox.items.length === 0 ? (
                    <p className="notification-empty">You are all caught up.</p>
                  ) : (
                    <ul className="notification-list">
                      {inbox.items.slice(0, 10).map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            className={`notification-item${item.readAt ? "" : " unread"}`}
                            onClick={() => void handleOpenNotification(item.id, item.entityType)}
                          >
                            <span className="notification-item-title">{item.title}</span>
                            {item.body && <span className="notification-item-body">{item.body}</span>}
                            <span className="notification-item-time">
                              {new Date(item.createdAt).toLocaleString(undefined, {
                                day: "numeric",
                                month: "short",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              className="teal-button dashboard-link"
              onClick={() =>
                navigate(
                  isAdmin
                    ? "dashboard"
                    : isDispatcher
                      ? "dispatcher-dashboard"
                      : isVeterinarian
                        ? "veterinary-dashboard"
                        : isStaff
                          ? "staff-dashboard"
                          : "user-dashboard",
                )
              }
            >
              {isAdmin
                ? "Admin dashboard"
                : isDispatcher
                  ? "Dispatcher dashboard"
                  : isVeterinarian
                    ? "Veterinary dashboard"
                    : isStaff
                      ? "Staff dashboard"
                      : "My dashboard"}
            </button>
            <div className="user-avatar-circle">
              <UserButton />
            </div>
          </>
        ) : (
          <>
            <SignInButton mode="modal">
              <button type="button" className="ghost-button">
                Login
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button type="button" className="teal-button">
                Register
              </button>
            </SignUpButton>
          </>
        )}
      </div>

      <DonateModal open={donateOpen} onClose={() => setDonateOpen(false)} />
    </header>
  );
}