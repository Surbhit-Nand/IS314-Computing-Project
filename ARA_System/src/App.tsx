import { useAuth, useUser } from "@clerk/react";
import { useState } from "react";
import "./App.css";
import spcaLogo from "./assets/spca-logo.png";
import { AboutUs } from "./components/AboutUs";
import { AnimalListings } from "./components/AnimalListings";
import { AnimalProfilePage } from "./components/AnimalProfilePage";
import { AuthPage } from "./components/AuthPage";
import { HomePage } from "./components/HomePage";
import { ManagerDashboard } from "./components/ManagerDashboard";
import { RescueOperationsPortal } from "./components/RescueOperationsPortal";
import { StaffDashboard } from "./components/StaffDashboard";
import { UserDashboard } from "./components/UserDashboard";
import { ReportsPage } from "./components/ReportsPage";
import { AnimalRegistrationForm } from "./features/animals/AnimalRegistrationForm";
import { EditAnimalProfile } from "./features/animals/EditAnimalProfile";
import { ManageAnimalProfiles } from "./features/animals/ManageAnimalProfiles";
import { AdoptionApplicationForm } from "./features/adoptions/AdoptionApplicationForm";
import { ManageAdoptionApplications } from "./features/adoptions/ManageAdoptionApplications";
import { MyApplications } from "./features/adoptions/MyApplications";
import { ManageRescueReports } from "./features/rescue/ManageRescueReports";
import { MyReports } from "./features/rescue/MyReports";
import { RescueReportForm } from "./features/rescue/RescueReportForm";
import type { Animal } from "./types/animal";
import { isDispatcherRole } from "./utils/roles";

export type View =
  | "home"
  | "animal-listings"
  | "about"
  | "animal-profile"
  | "login"
  | "register"
  | "dashboard"
  | "staff-dashboard"
  | "dispatcher-dashboard"
  | "rescue-board"
  | "rescue-active"
  | "rescue-history"
  | "user-dashboard"
  | "register-animal"
  | "manage-animals"
  | "edit-animal"
  | "rescue-report"
  | "rescue-report-phone"
  | "my-reports"
  | "manage-rescue-reports"
  | "adoption-apply"
  | "my-applications"
  | "manage-adoption-applications"
  | "reports";

function App() {
  const [view, setView] = useState<View>("home");
  // Tracks which animal is being edited so EditAnimalProfile knows which
  // profile to load - there is no router/URL param for this, so it rides
  // alongside `view` in local state.
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);
  // The animal a visitor clicked "View full profile" on. Holds the whole
  // object (not just an id) since the public listing fetch that got us here
  // already returned every field - no second request needed to render the
  // profile page.
  const [viewedAnimal, setViewedAnimal] = useState<Animal | null>(null);
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  // Staff-first landing: a staff-type account that lands on the public Home
  // page (fresh sign-in, or any reload since view resets to "home") is shown
  // its own dashboard instead. This is a pure derivation during render - the
  // first navigation the staff member makes records them as actively browsing
  // (landedForUserId), so afterwards they can freely visit the public site.
  const [landedForUserId, setLandedForUserId] = useState<string | null>(null);

  const role = user?.publicMetadata.role;
  const staffLanding =
    !isLoaded || !isSignedIn || !user || view !== "home" || landedForUserId === user.id
      ? null
      : role === "manager" || role === "admin"
        ? "dashboard"
        : isDispatcherRole(role)
          ? "dispatcher-dashboard"
          : role === "staff" || role === "veterinarian"
            ? "staff-dashboard"
            : null;
  const activeView = staffLanding ?? view;

  // Keep the public Home page from flashing before auth resolves. Signed-in
  // sessions briefly lag on the Clerk user profile hydration, so both
  // `isLoaded` and the `user` object must be ready before any page paints.
  // Anonymous visitors hit `isLoaded=true` -> `isSignedIn=false` and see Home.
  if (!isLoaded || (isSignedIn && !user)) {
    return (
      <main className="dashboard-locked loading-screen">
        <div className="dashboard-locked-card loading-card">
          <div className="loading-brand">
            <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
            <strong>SPCA Fiji</strong>
          </div>
          <div className="loading-spinner" aria-hidden="true" />
          <div className="loading-skeleton" aria-hidden="true">
            <span className="skeleton-bar" />
            <span className="skeleton-bar skeleton-width-2" />
            <span className="skeleton-bar skeleton-width-3" />
          </div>
        </div>
      </main>
    );
  }

  // Marks the current user as on a session that chose its own view, so the
  // staff-first landing above only applies once per sign-in session.
  function navigate(nextView: View) {
    if (user) setLandedForUserId(user.id);
    setView(nextView);
  }

  function handleViewAnimal(animal: Animal) {
    setViewedAnimal(animal);
    setView("animal-profile");
  }

  function openMyReports() {
    setView("my-reports");
  }

  function openMyApplications() {
    setView("my-applications");
  }

  if (activeView === "dashboard") {
    return <ManagerDashboard onNavigate={navigate} />;
  }

  if (activeView === "reports") {
    return <ReportsPage onNavigate={navigate} />;
  }

  if (activeView === "staff-dashboard") {
    return <StaffDashboard onNavigate={navigate} />;
  }

  if (activeView === "dispatcher-dashboard") {
    return <RescueOperationsPortal page="rescue-board" onNavigate={navigate} />;
  }

  if (activeView === "user-dashboard") {
    return <UserDashboard onNavigate={navigate} />;
  }

  if (activeView === "animal-listings") {
    return (
      <AnimalListings
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage="animal-listings"
        onNavigate={navigate}
        onViewAnimal={handleViewAnimal}
      />
    );
  }

  if (activeView === "about") {
    return (
      <AboutUs
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage="about"
        onNavigate={navigate}
      />
    );
  }

  if (activeView === "animal-profile" && viewedAnimal) {
    return (
      <AnimalProfilePage
        animal={viewedAnimal}
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage="animal-listings"
        onNavigate={navigate}
      />
    );
  }

  if (activeView === "register-animal") {
    return <AnimalRegistrationForm onNavigate={navigate} />;
  }

  if (activeView === "manage-animals") {
    return (
      <ManageAnimalProfiles
        onNavigate={navigate}
        onSelectAnimal={(animalId) => {
          setSelectedAnimalId(animalId);
          navigate("edit-animal");
        }}
      />
    );
  }

  if (activeView === "edit-animal" && selectedAnimalId) {
    return (
      <EditAnimalProfile animalId={selectedAnimalId} onNavigate={navigate} />
    );
  }

  if (activeView === "rescue-report") {
    return (
      <RescueReportForm
        variant="public"
        source="online"
        isLoaded={isLoaded}
        onNavigate={navigate}
        onShowMyReports={openMyReports}
      />
    );
  }

  if (activeView === "rescue-report-phone") {
    return (
      <RescueReportForm
        variant="staff"
        source="phone"
        isLoaded={isLoaded}
        onNavigate={navigate}
        onShowMyReports={openMyReports}
      />
    );
  }

  if (activeView === "my-reports") {
    return (
      <MyReports
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        onNavigate={navigate}
      />
    );
  }

  if (activeView === "manage-rescue-reports") {
    return <ManageRescueReports onNavigate={navigate} />;
  }

  if (activeView === "rescue-board" || activeView === "rescue-active" || activeView === "rescue-history") {
    return <RescueOperationsPortal page={activeView} onNavigate={navigate} />;
  }

  if (activeView === "adoption-apply") {
    return (
      <AdoptionApplicationForm
        animal={viewedAnimal}
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        onShowMyApplications={openMyApplications}
        onNavigate={navigate}
      />
    );
  }

  if (activeView === "my-applications") {
    return (
      <MyApplications
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        onNavigate={navigate}
      />
    );
  }

  if (activeView === "manage-adoption-applications") {
    return <ManageAdoptionApplications onNavigate={navigate} />;
  }

  if (activeView === "login" || activeView === "register") {
    return <AuthPage mode={activeView} onNavigate={navigate} />;
  }

  return (
    <HomePage
      isLoaded={isLoaded}
      isSignedIn={isSignedIn}
      currentPage="home"
      onNavigate={navigate}
      onViewAnimal={handleViewAnimal}
    />
  );
}

export default App;
