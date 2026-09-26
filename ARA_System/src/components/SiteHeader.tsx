import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/react";
import { useState } from "react";
import spcaLogo from "../assets/spca-logo.png";
import { DonateModal } from "../features/donations/DonateModal";
import { isDevBypassEnabled } from "../utils/devBypass";
import { isDispatcherRole } from "../utils/roles";

export type SiteHeaderView =
  | "home"
  | "animal-listings"
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