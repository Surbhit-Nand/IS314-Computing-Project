import { NotificationBell } from "../../../components/NotificationBell";
import { openVeterinaryEmergencyQueue } from "../../../utils/veterinaryEmergencyFocus";
import { SignOutButton, UserButton, useAuth, useUser } from "@clerk/react";
import spcaLogo from "../../../assets/spca-logo.png";
import type { VeterinaryView } from "../vetTypes";
import { IconCalendar, IconClipboard, IconMedical, IconPawPrint, IconHeart } from "../../../components/MedicalIcons";

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
  const { getToken } = useAuth();
  const { isLoaded, isSignedIn, user } = useUser();
  return (
    <header className="vm-header workspace-sidebar vet-workspace-sidebar">
      <div className="vm-header-inner">
        <button
          type="button"
          className="vm-brand"
          aria-label="SPCA Fiji Veterinary"
          onClick={() => onNavigate("veterinary-dashboard")}
        >
          <img src={spcaLogo} alt="SPCA Fiji logo" className="vm-brand-logo" />
          <span className="workspace-brand-copy"><strong>SPCA Fiji</strong><small>Veterinary care</small></span>
        </button>
        <p className="workspace-nav-label">Workspace</p>
        <nav className="vm-navbar" aria-label="Veterinary module navigation">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                className={`vm-nav-link${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => onNavigate(tab.view)}
              >
                {tab.id === "medical-queue" ? <IconClipboard size={17} /> : tab.id === "appointments" ? <IconCalendar size={17} /> : <IconMedical size={17} />}
                <span>{tab.label}<small>{tab.id === "medical-queue" ? "Overview & cases" : tab.id === "appointments" ? "Visits & follow-ups" : "Patient records"}</small></span>
              </button>
            );
          })}
        </nav>
        <div className="workspace-sidebar-note"><IconPawPrint size={44} className="workspace-note-paw" /><span className="workspace-note-icon"><IconHeart size={18} /></span><strong>Better care, every day.</strong><p>Keep every animal’s recovery moving forward.</p><button type="button" onClick={() => onNavigate("vet-booking")}>Schedule a visit ↗</button></div>
        <div className="vm-navbar-actions">
          <NotificationBell key={user?.id} isLoaded={isLoaded} isSignedIn={isSignedIn} getToken={getToken} isVeterinarian={user?.publicMetadata.role === "veterinarian"} onOpen={(entityType) => { if (entityType === "veterinary_emergency_alert") openVeterinaryEmergencyQueue(onNavigate); else if (entityType === "adoption_application") onNavigate("manage-adoption-applications"); }} />
          <div className="workspace-user-row"><div className="vm-avatar-circle">{isLoaded && isSignedIn ? <UserButton /> : null}</div><span className="workspace-user-name">{user?.firstName || "Veterinarian"}<small>Clinical workspace</small></span></div>
          <SignOutButton redirectUrl="/">
            <button type="button" className="vm-signout-button">Sign out</button>
          </SignOutButton>
        </div>
      </div>
    </header>
  );
}
