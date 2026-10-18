import { SignInButton, SignUpButton, SignOutButton, UserButton, useAuth, useUser } from "@clerk/react";
import { useState } from "react";
import spcaLogo from "../assets/spca-logo.png";
import { DonateModal } from "../features/donations/DonateModal";
import type { AppNotification } from "../types/notification";
import { TAKEOVER_REVIEW_EVENT, TAKEOVER_REVIEW_STORAGE_KEY, takeoverReviewTarget } from "../utils/takeoverReview";
import { NotificationBell } from "./NotificationBell";
import { openVeterinaryEmergencyQueue } from "../utils/veterinaryEmergencyFocus";
import { isDevBypassEnabled } from "../utils/devBypass";
import { isDispatcherRole } from "../utils/roles";
import "./NotificationBell.css";
import { IconClipboard, IconActivity, IconClock, IconPawPrint, IconPlus, IconHeart } from "./MedicalIcons";

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
  | "my-animals"
  | "my-animal-record"
  | "my-animal-booking"
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
  // links (Home, About Us, Animals, Rescue Report, Donate) so vets
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
  // Adoption review access mirrors the queue's requireStaffOrAbove gate, so a
  // notification can never route someone somewhere the API would reject.
  const canReviewAdoptions = isStaffModuleRole;

  function handleNotificationNavigation(entityType: string | null, item?: AppNotification) {
    const target = item ? takeoverReviewTarget(item) : null;
    if (target && isDispatcher) {
      sessionStorage.setItem(TAKEOVER_REVIEW_STORAGE_KEY, JSON.stringify(target));
      window.dispatchEvent(new CustomEvent(TAKEOVER_REVIEW_EVENT, { detail: target }));
      navigate("rescue-active");
      return;
    }
    if (entityType === "rescue_report") navigate(isDispatcher ? "rescue-active" : canReviewAdoptions ? "manage-rescue-reports" : "my-reports");
    if (entityType === "adoption_application") navigate(canReviewAdoptions ? "manage-adoption-applications" : "my-applications");
    if (entityType === "veterinary_emergency_alert" && isVeterinarian) openVeterinaryEmergencyQueue(navigate);
  }
  // Internal screens use team navigation for account dashboards and staff forms.
  const internalPages = new Set([
    "dashboard",
    "staff-dashboard",
    "dispatcher-dashboard",
    "register-animal",
    "manage-animals",
    "edit-animal",
    "manage-rescue-reports",
    "manage-adoption-applications",
    "rescue-report-phone",
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

  const isWorkspace = isInternalPage || isRescuePage;
  const workspaceName = isRescuePage && isDispatcher ? "Rescue operations" : isAdmin ? "Administration" : "Staff workspace";

  return (
    <header className={`site-header${isWorkspace ? " workspace-sidebar" : ""}`}>
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
        {isWorkspace && <span className="workspace-brand-copy"><strong>SPCA Fiji</strong><small>{workspaceName}</small></span>}
      </button>

      {isWorkspace && <p className="workspace-nav-label">Workspace</p>}

      {!hideSiteNav ? (
      <nav
        className={`main-nav${menuOpen ? " open" : ""}`}
        aria-label="Main navigation"
      >
        {isRescuePage ? (
          <>
            <button type="button" className={currentPage === "rescue-board" ? "nav-link active" : "nav-link"} onClick={() => navigate("rescue-board")}><IconClipboard size={17} /><span>Mission Board<small>Incoming rescue cases</small></span></button>
            <button type="button" className={currentPage === "rescue-active" ? "nav-link active" : "nav-link"} onClick={() => navigate("rescue-active")}><IconActivity size={17} /><span>Active Mission<small>Your current response</small></span></button>
            <button type="button" className={currentPage === "rescue-history" ? "nav-link active" : "nav-link"} onClick={() => navigate("rescue-history")}><IconClock size={17} /><span>Mission History<small>Completed responses</small></span></button>
          </>
        ) : isInternalPage ? (
          <>
            {/* Internal screens share one focused workspace navigation. */}
            <button
              type="button"
              className={
                currentPage === dashboardView() ? "nav-link active" : "nav-link"
              }
              onClick={() => navigate(dashboardView())}
            >
              <IconActivity size={17} /><span>Dashboard<small>Your work at a glance</small></span>
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
              <IconClipboard size={17} /><span>Rescue queue<small>Alerts &amp; intake</small></span>
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
                <IconPawPrint size={17} /><span>Animals<small>Profiles &amp; care</small></span>
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
                <IconPlus size={17} /><span>Register<small>Welcome a new animal</small></span>
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
                <IconHeart size={17} /><span>Adoptions<small>Applications &amp; reviews</small></span>
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
                <IconClipboard size={17} /><span>Reports<small>Insights &amp; summaries</small></span>
              </button>
            )}
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
                public donate prompt is hidden for their accounts. */}
            {isSignedIn && !isStaff && !isAdmin && (
              <button
                type="button"
                className={
                  currentPage === "user-dashboard" ||
                  currentPage === "my-reports" ||
                  currentPage === "my-applications" ||
                  currentPage === "my-profile" ||
                  currentPage === "my-animals" ||
                  currentPage === "my-animal-record" ||
                  currentPage === "my-animal-booking"
                    ? "nav-link active"
                    : "nav-link"
                }
                onClick={() => navigate("user-dashboard")}
              >
                My dashboard
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

      {isWorkspace && <div className="workspace-sidebar-note"><IconPawPrint size={44} className="workspace-note-paw" /><span className="workspace-note-icon"><IconHeart size={18} /></span><strong>Every animal. Every step.</strong><p>Keep rescue, care and adoption moving together.</p></div>}
      <div className="header-actions">
        {!isLoaded ? null : isSignedIn ? (
          <>
            <NotificationBell key={user?.id} isLoaded={isLoaded} isSignedIn={isSignedIn} getToken={getToken} isVeterinarian={isVeterinarian} onOpen={handleNotificationNavigation} />
            {!isWorkspace && (isStaff || isAdmin || hideSiteNav) && <button
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
            </button>}
            <div className="user-avatar-circle">
              <UserButton />
            </div>
            {isWorkspace && <span className="workspace-user-name">{user?.firstName || "Team member"}<small>{workspaceName}</small></span>}
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
      {isWorkspace && isSignedIn && <SignOutButton redirectUrl="/"><button type="button" className="workspace-signout">Sign out</button></SignOutButton>}

      <DonateModal open={donateOpen} onClose={() => setDonateOpen(false)} />
    </header>
  );
}
