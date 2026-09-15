import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/react";
import { useState } from "react";
import spcaLogo from "../assets/spca-logo.png";
import { DonateModal } from "../features/donations/DonateModal";
import { isDevBypassEnabled } from "../utils/devBypass";

export type SiteHeaderView =
  | "home"
  | "animal-listings"
  | "about"
  | "login"
  | "register"
  | "dashboard"
  | "staff-dashboard"
  | "user-dashboard"
  | "rescue-report"
  | "adoption-apply"
  | "my-applications"
  | "manage-adoption-applications";

type SiteHeaderProps = {
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  currentPage: string;
  onNavigate: (view: SiteHeaderView) => void;
};

// Shared public-site header. On screens narrower than 980px the nav links
// collapse into a hamburger-toggled dropdown anchored under the top-left menu
// button; the auth/account actions always stay pinned top-right.
export function SiteHeader({
  isLoaded,
  isSignedIn,
  currentPage,
  onNavigate,
}: SiteHeaderProps) {
  const { user } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  const userRole = user?.publicMetadata.role;
  const isAdmin = userRole === "manager" || userRole === "admin";
  // isDevBypassEnabled is OR'd in here only so the "Staff dashboard" nav
  // button appears locally without a real role - see src/utils/devBypass.ts.
  const isStaff = isDevBypassEnabled || userRole === "staff" || userRole === "veterinarian";

  function navigate(view: SiteHeaderView) {
    setMenuOpen(false);
    onNavigate(view);
  }

  return (
    <header className="site-header">
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

      <button
        type="button"
        className="brand-group brand-button"
        onClick={() => navigate("home")}
      >
        <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
      </button>

      <nav
        className={`main-nav${menuOpen ? " open" : ""}`}
        aria-label="Main navigation"
      >
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
          className="nav-link"
          onClick={() => navigate("rescue-report")}
        >
          Rescue Report
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
      </nav>

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
                    : isStaff
                      ? "staff-dashboard"
                      : "user-dashboard",
                )
              }
            >
              {isAdmin
                ? "Admin dashboard"
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