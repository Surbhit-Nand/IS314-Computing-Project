import { useAuth, useUser } from "@clerk/react";
import { Suspense, lazy, useEffect, useState } from "react";
import spcaLogo from "./assets/spca-logo.png";
import "./App.css";
import "./features/veterinary/veterinary.css";
import { AboutUs } from "./components/AboutUs";
import { AnimalListings } from "./components/AnimalListings";
import { AnimalProfilePage } from "./components/AnimalProfilePage";
import { AuthPage } from "./components/AuthPage";
import { HomePage } from "./components/HomePage";
// Heavy / low-frequency views are lazy-loaded so the initial bundle stays
// small (first paint is Home / Listings / Auth). Each gets its own chunk;
// the staff-first landing below shows the shared loading card once, then the
// chunk is cached. Eager above: public first-paint pages only.
const ManagerDashboard = lazy(() =>
  import("./components/ManagerDashboard").then((m) => ({ default: m.ManagerDashboard })),
);
const MyProfilePage = lazy(() =>
  import("./components/MyProfilePage").then((m) => ({ default: m.MyProfilePage })),
);
const RescueOperationsPortal = lazy(() =>
  import("./components/RescueOperationsPortal").then((m) => ({
    default: m.RescueOperationsPortal,
  })),
);
const StaffDashboard = lazy(() =>
  import("./components/StaffDashboard").then((m) => ({ default: m.StaffDashboard })),
);
const UserDashboard = lazy(() =>
  import("./components/UserDashboard").then((m) => ({ default: m.UserDashboard })),
);
const ReportsPage = lazy(() =>
  import("./components/ReportsPage").then((m) => ({ default: m.ReportsPage })),
);
const AnimalRegistrationForm = lazy(() =>
  import("./features/animals/AnimalRegistrationForm").then((m) => ({
    default: m.AnimalRegistrationForm,
  })),
);
const EditAnimalProfile = lazy(() =>
  import("./features/animals/EditAnimalProfile").then((m) => ({
    default: m.EditAnimalProfile,
  })),
);
const ManageAnimalProfiles = lazy(() =>
  import("./features/animals/ManageAnimalProfiles").then((m) => ({
    default: m.ManageAnimalProfiles,
  })),
);
const AdoptionApplicationForm = lazy(() =>
  import("./features/adoptions/AdoptionApplicationForm").then((m) => ({
    default: m.AdoptionApplicationForm,
  })),
);
const ManageAdoptionApplications = lazy(() =>
  import("./features/adoptions/ManageAdoptionApplications").then((m) => ({
    default: m.ManageAdoptionApplications,
  })),
);
const MyApplications = lazy(() =>
  import("./features/adoptions/MyApplications").then((m) => ({ default: m.MyApplications })),
);
const ManageRescueReports = lazy(() =>
  import("./features/rescue/ManageRescueReports").then((m) => ({
    default: m.ManageRescueReports,
  })),
);
const MyReports = lazy(() =>
  import("./features/rescue/MyReports").then((m) => ({ default: m.MyReports })),
);
const RescueReportForm = lazy(() =>
  import("./features/rescue/RescueReportForm").then((m) => ({ default: m.RescueReportForm })),
);
const VeterinaryAppointmentBooking = lazy(() =>
  import("./features/veterinary/VeterinaryAppointmentBooking").then((m) => ({
    default: m.VeterinaryAppointmentBooking,
  })),
);
const VeterinaryDashboard = lazy(() =>
  import("./features/veterinary/VeterinaryDashboard").then((m) => ({
    default: m.VeterinaryDashboard,
  })),
);
const VeterinaryMedicalHistory = lazy(() =>
  import("./features/veterinary/VeterinaryMedicalHistory").then((m) => ({
    default: m.VeterinaryMedicalHistory,
  })),
);
const VeterinaryUpcomingAppointments = lazy(() =>
  import("./features/veterinary/VeterinaryUpcomingAppointments").then((m) => ({
    default: m.VeterinaryUpcomingAppointments,
  })),
);
const MyAnimals = lazy(() =>
  import("./features/veterinary/MyAnimals").then((m) => ({ default: m.MyAnimals })),
);
import type { VeterinaryAppointment } from "./types/veterinary";
import type { Animal } from "./types/animal";
import { isDispatcherRole } from "./utils/roles";
import { clearPendingAdoption, readPendingAdoption } from "./utils/pendingAdoption";
import { apiBaseUrl } from "./services/apiClient.js";

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
  | "my-animals"
  | "my-animal-record"
  | "my-animal-booking"
  | "my-profile"
  | "manage-adoption-applications"
  | "reports"
  | "veterinary-dashboard"
  | "veterinary-record"
  | "veterinary-records"
  | "vet-appointments"
  | "vet-booking"
  | "vet-appointment-details";

function PageLoadingFallback() {
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

function App() {
  const [view, setView] = useState<View>("home");
  // Tracks which animal is being edited so EditAnimalProfile knows which
  // profile to load - there is no router/URL param for this, so it rides
  // alongside `view` in local state.
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);
  // The follow-up appointment a vet clicked "View" on. Like selectedAnimalId,
  // there is no router param, so it rides in local state alongside `view`.
  const [selectedAppointment, setSelectedAppointment] = useState<VeterinaryAppointment | null>(null);
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
  //
  // Veterinarians get the veterinary dashboard rather than the generic staff
  // one, because the vet pages ship with a hidden site navbar (see SiteHeader
  // `hideSiteNav`). Deriving it here rather than redirecting from an effect
  // keeps a single source of truth: an effect calling setView would race this
  // derivation, which would win and strand them on the staff dashboard.
  const [landedForUserId, setLandedForUserId] = useState<string | null>(null);

  const role = user?.publicMetadata.role;
  const staffLanding =
    !isLoaded || !isSignedIn || !user || view !== "home" || landedForUserId === user.id
      ? null
      : role === "manager" || role === "admin"
        ? "dashboard"
        : isDispatcherRole(role)
          ? "dispatcher-dashboard"
          : role === "veterinarian"
            ? "veterinary-dashboard"
            : role === "staff"
              ? "staff-dashboard"
              : null;
  const activeView = staffLanding ?? view;

  // Resumes a pending adoption across the sign-in/register round trip: if an
  // anonymous visitor clicked Adopt, the animal id was stashed in
  // localStorage (see AnimalProfilePage). Once a session exists and no animal
  // is in memory, reload that animal from the public listing so the form
  // survives auth and reloads. Staff-first landing wins - staff accounts keep
  // their dashboard instead of being pulled into the form.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user || viewedAnimal || staffLanding) return;
    const pendingAnimalId = readPendingAdoption();
    if (!pendingAnimalId) return;
    let cancelled = false;
    void fetch(`${apiBaseUrl}/api/animals`)
      .then((response) => (response.ok ? (response.json() as Promise<Animal[]>) : []))
      .then((list) => {
        if (cancelled || !Array.isArray(list)) return;
        const found = list.find((item) => item.id === pendingAnimalId);
        if (found) {
          setViewedAnimal(found);
          setView("adoption-apply");
        } else {
          // Adopted, removed, or otherwise gone: drop the stash so it can
          // never resurface, and leave the visitor where they are.
          clearPendingAdoption();
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, user, viewedAnimal, staffLanding]);

  // Keep the public Home page from flashing before auth resolves. Signed-in
  // sessions briefly lag on the Clerk user profile hydration, so both
  // `isLoaded` and the `user` object must be ready before any page paints.
  // Anonymous visitors hit `isLoaded=true` -> `isSignedIn=false` and see Home.
  if (!isLoaded || (isSignedIn && !user)) {
    return <PageLoadingFallback />;
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
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <ManagerDashboard onNavigate={navigate} />
      </Suspense>
    );
  }

  if (activeView === "reports") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <ReportsPage onNavigate={navigate} />
      </Suspense>
    );
  }

  if (activeView === "staff-dashboard") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <StaffDashboard onNavigate={navigate} />
      </Suspense>
    );
  }

  // Veterinary views read activeView (not view) and are handed navigate (not
  // setView) for the same reason as the landing derivation above: staffLanding
  // wins over view until the session is marked as browsing, so reading `view`
  // would never show the vet dashboard, and a raw setView would leave the vet
  // pinned to it with no way to reach the medical history.
  if (
    activeView === "veterinary-dashboard" ||
    activeView === "veterinary-record" ||
    activeView === "vet-appointment-details"
  ) {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <VeterinaryDashboard
          currentView={activeView}
          onNavigate={navigate}
          onSelectAnimal={(animalId) => {
            setSelectedAnimalId(animalId);
            navigate("veterinary-record");
          }}
          selectedAnimalId={selectedAnimalId}
          selectedAppointment={activeView === "vet-appointment-details" ? selectedAppointment : null}
          onSelectAppointment={(appointment) => {
            setSelectedAppointment(appointment);
            navigate("vet-appointment-details");
          }}
          onViewAnimalProfile={handleViewAnimal}
        />
      </Suspense>
    );
  }

  if (activeView === "vet-appointments") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <VeterinaryUpcomingAppointments currentView={activeView} onNavigate={navigate} />
      </Suspense>
    );
  }

  if (activeView === "vet-booking") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <VeterinaryAppointmentBooking currentView={activeView} onNavigate={navigate} />
      </Suspense>
    );
  }

  if (activeView === "veterinary-records") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <VeterinaryMedicalHistory currentView={activeView} onNavigate={navigate} />
      </Suspense>
    );
  }

  if (activeView === "dispatcher-dashboard") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <RescueOperationsPortal page="rescue-board" onNavigate={navigate} />
      </Suspense>
    );
  }

  if (activeView === "user-dashboard") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <UserDashboard onNavigate={navigate} />
      </Suspense>
    );
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
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <AnimalRegistrationForm onNavigate={navigate} />
      </Suspense>
    );
  }

  if (activeView === "manage-animals") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <ManageAnimalProfiles
          onNavigate={navigate}
          onSelectAnimal={(animalId) => {
            setSelectedAnimalId(animalId);
            navigate("edit-animal");
          }}
        />
      </Suspense>
    );
  }

  if (activeView === "edit-animal" && selectedAnimalId) {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <EditAnimalProfile animalId={selectedAnimalId} onNavigate={navigate} />
      </Suspense>
    );
  }

  if (activeView === "rescue-report") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <RescueReportForm
          variant="public"
          source="online"
          isLoaded={isLoaded}
          onNavigate={navigate}
          onShowMyReports={openMyReports}
        />
      </Suspense>
    );
  }

  if (activeView === "rescue-report-phone") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <RescueReportForm
          variant="staff"
          source="phone"
          isLoaded={isLoaded}
          onNavigate={navigate}
          onShowMyReports={openMyReports}
        />
      </Suspense>
    );
  }

  if (activeView === "my-reports") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <MyReports
          isLoaded={isLoaded}
          isSignedIn={isSignedIn}
          onNavigate={navigate}
        />
      </Suspense>
    );
  }

  if (activeView === "manage-rescue-reports") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <ManageRescueReports onNavigate={navigate} />
      </Suspense>
    );
  }

  if (activeView === "rescue-board" || activeView === "rescue-active" || activeView === "rescue-history") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <RescueOperationsPortal page={activeView} onNavigate={navigate} />
      </Suspense>
    );
  }

  if (activeView === "adoption-apply") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <AdoptionApplicationForm
          animal={viewedAnimal}
          isLoaded={isLoaded}
          isSignedIn={isSignedIn}
          onShowMyApplications={openMyApplications}
          onNavigate={navigate}
        />
      </Suspense>
    );
  }

  if (activeView === "my-applications") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <MyApplications
          isLoaded={isLoaded}
          isSignedIn={isSignedIn}
          onNavigate={navigate}
        />
      </Suspense>
    );
  }

  if (
    activeView === "my-animals" ||
    activeView === "my-animal-record" ||
    activeView === "my-animal-booking"
  ) {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <MyAnimals
          currentView={activeView}
          animalId={selectedAnimalId}
          onNavigate={navigate}
          onSelectAnimal={setSelectedAnimalId}
        />
      </Suspense>
    );
  }

  if (activeView === "my-profile") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <MyProfilePage onNavigate={navigate} />
      </Suspense>
    );
  }

  if (activeView === "manage-adoption-applications") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <ManageAdoptionApplications onNavigate={navigate} />
      </Suspense>
    );
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