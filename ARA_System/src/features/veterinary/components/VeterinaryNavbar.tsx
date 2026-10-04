import { SignOutButton, UserButton, useUser } from "@clerk/react";
import spcaLogo from "../../../assets/spca-logo.png";
import type { VeterinaryView } from "../vetTypes";

type TabId = "medical-queue" | "appointments" | "medical-history";

type TabDef = {
  id: TabId;
  label: string;
  view: VeterinaryView;
};

const TABS: TabDef[] = [
  { id: "medical-queue", label: "Medical Queue", view: "veterinary-dashboard" },
  { id: "appointments", label: "Appointments", view: "vet-appointments" },
  { id: "medical-history", label: "Medical History", view: "veterinary-records" },
];

function tabForView(view: VeterinaryView): TabId {
  switch (view) {
    case "veterinary-record":
    case "veterinary-records":
      return "medical-history";
    case "vet-appointments":
    case "vet-appointment-details":
    case "vet-booking":
      return "appointments";
    default:
      return "medical-queue";
  }
}

type Props = {
  currentView: VeterinaryView;
  onNavigate: (view: VeterinaryView) => void;
};

export function VeterinaryNavbar({ currentView, onNavigate }: Props) {
  const activeTab = tabForView(currentView);
  const { isLoaded, isSignedIn } = useUser();
  return (
    <header className="vm-header">
      <div className="vm-header-inner">
        <button
          type="button"
          className="vm-brand"
          aria-label="SPCA Fiji Veterinary"
          onClick={() => onNavigate("veterinary-dashboard")}
        >
          <img src={spcaLogo} alt="SPCA Fiji logo" className="vm-brand-logo" />
        </button>

        <nav className="vm-navbar" aria-label="Veterinary module navigation">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                className={`vm-nav-link${active ? " is-active" : ""}`}
                onClick={() => onNavigate(tab.view)}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="vm-navbar-actions">
          <SignOutButton redirectUrl="/">
            <button type="button" className="vm-signout-button">Sign out</button>
          </SignOutButton>
          <div className="vm-avatar-circle">{isLoaded && isSignedIn ? <UserButton /> : null}</div>
        </div>
      </div>
    </header>
  );
}