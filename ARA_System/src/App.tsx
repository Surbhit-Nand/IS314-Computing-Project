import { useAuth, useUser } from "@clerk/react";
import { Suspense, lazy, useCallback, useEffect, useRef } from "react";
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
import type { VeterinaryAppointment } from "./types/veterinary";
import type { Animal } from "./types/animal";
import { clearPendingAdoption, readPendingAdoption } from "./utils/pendingAdoption";
import { apiBaseUrl, authHeaders } from "./services/apiClient.js";
import { getFreshClerkToken } from "./utils/clerkToken";
import { isDevBypassEnabled } from "./utils/devBypass";
import { useAraNavigation } from "./navigation/useAraNavigation";
import type { View, VeterinaryParent, CareScene } from "./navigation/araNavigation";
export type { View } from "./navigation/araNavigation";

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
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const authReady = isLoaded && (!isSignedIn || !!user);
  const { navigation, navigateTo, historyReady } = useAraNavigation(authReady, {
    userId: isSignedIn ? user?.id ?? null : null,
    role: isSignedIn ? user?.publicMetadata.role : undefined,
    devBypass: isDevBypassEnabled,
  });
  const { view: activeView, selectedAnimalId, viewedAnimal } = navigation;
  const veterinaryParent = navigation.veterinaryParent ?? "veterinary-dashboard";
  const invalidVeterinaryContext = useCallback(() => {
    navigateTo({ view: veterinaryParent }, true);
  }, [navigateTo, veterinaryParent]);
  const invalidEditContext = useCallback(() => {
    navigateTo({ view: "manage-animals" }, true);
  }, [navigateTo]);

  // Resumes a pending adoption across the sign-in/register round trip: if an
  // anonymous visitor clicked Adopt, the animal id was stashed in
  // localStorage (see AnimalProfilePage). Once a session exists and no animal
  // is in memory, reload that animal from the public listing so the form
  // survives auth and reloads. Staff-first landing wins - staff accounts keep
  // their dashboard instead of being pulled into the form.
  useEffect(() => {
    if (!authReady || !historyReady || !isSignedIn || !user || viewedAnimal) return;
    if (activeView !== "home") return;
    // Any staff-type role lands on its dashboard, never the adoption form.
    if (user.publicMetadata.role) return;
    const pendingAnimalId = readPendingAdoption();
    if (!pendingAnimalId) return;
    let cancelled = false;
    void fetch(`${apiBaseUrl}/api/animals`)
      .then((response) => (response.ok ? (response.json() as Promise<Animal[]>) : []))
      .then((list) => {
        if (cancelled || !Array.isArray(list)) return;
        // Single-use stash: consume it as soon as the listing (the evidence we
        // need) comes back, so it can never be replayed. The animal then lives
        // in the navigation state, and a reload/back-forward still lands on the
        // form without it. A failed fetch keeps the stash for a later retry.
        clearPendingAdoption();
        const found = list.find((item) => item.id === pendingAnimalId);
        if (found) {
          navigateTo({ view: "adoption-apply", viewedAnimal: found });
        }
        // Not found (adopted, removed, or otherwise gone): the stash is already
        // dropped above, so leave the visitor where they are.
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authReady, historyReady, isSignedIn, user, viewedAnimal, activeView, navigateTo]);

  // Invitation role reconcile: the Clerk user.created webhook normally stamps
  // publicMetadata.role from the staff invitation, but in local dev Clerk can't
  // POST to localhost (no public URL), and an EXISTING account accepting an
  // invitation only fires user.updated - which may also never arrive. Without
  // a role the invitee is 403'd everywhere, so on session load ask our own
  // API to self-reconcile: if a pending/accepted invitation matches this
  // user's email and they have no role yet, it stamps one. Runs once per
  // user per page load and only for role-less accounts; a successful stamp
  // reloads the Clerk user so the navigation session below picks the new
  // role up (landingView routes them to their dashboard) without a refresh.
  const reconcileAttemptedForUserId = useRef<string | null>(null);
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;
    if (user.publicMetadata.role) return;
    if (reconcileAttemptedForUserId.current === user.id) return;
    reconcileAttemptedForUserId.current = user.id;

    let cancelled = false;
    void (async () => {
      try {
        const token = await getFreshClerkToken(getToken);
        if (!token || cancelled) return;
        const response = await fetch(`${apiBaseUrl}/api/admin/invitations/reconcile`, {
          method: "POST",
          headers: authHeaders(token),
        });
        if (!response.ok || cancelled) return;
        const result = (await response.json()) as { role: string | null; stamped: boolean };
        if (result.stamped && !cancelled) {
          await user.reload();
        }
      } catch {
        // Best-effort fallback only - the webhook path still applies where
        // it works (e.g. production), so a failure here must not block the UI.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, user, getToken]);

  if (!authReady || !historyReady) return <PageLoadingFallback />;

  function navigate(nextView: View) {
    // Profile <-> application carries this entry's animal, never a global last selection.
    navigateTo(nextView === "animal-profile" || nextView === "adoption-apply"
      ? { view: nextView, viewedAnimal }
      : { view: nextView });
  }

  function handleViewAnimal(animal: Animal) {
    navigateTo({ view: "animal-profile", viewedAnimal: animal });
  }

  function openMyReports() { navigate("my-reports"); }
  function openMyApplications() { navigate("my-applications"); }
  function selectVeterinaryAnimal(animalId: string, parent: VeterinaryParent) {
    navigateTo({ view: "veterinary-record", selectedAnimalId: animalId, veterinaryParent: parent, careScene: "history" });
  }
  function selectAppointment(appointment: VeterinaryAppointment, parent: VeterinaryParent) {
    navigateTo({ view: "vet-appointment-details", selectedAppointmentId: appointment.appointment.id, veterinaryParent: parent });
  }
  function changeCareScene(careScene: CareScene, replace = false) {
    navigateTo({ ...navigation, careScene }, replace);
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

  if (
    activeView === "veterinary-dashboard" ||
    (activeView === "veterinary-record" && navigation.veterinaryParent === "veterinary-dashboard") ||
    (activeView === "vet-appointment-details" && navigation.veterinaryParent === "veterinary-dashboard")
  ) {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <VeterinaryDashboard
          key={activeView + ":" + (selectedAnimalId ?? navigation.selectedAppointmentId ?? "")}
          currentView={activeView}
          onNavigate={navigate}
          onSelectAnimal={(id) => selectVeterinaryAnimal(id, "veterinary-dashboard")}
          selectedAnimalId={selectedAnimalId}
          selectedAppointmentId={navigation.selectedAppointmentId}
          onSelectAppointment={(appointment) => selectAppointment(appointment, "veterinary-dashboard")}
          careScene={navigation.careScene ?? "history"}
          onChangeCareScene={changeCareScene}
          onInvalidContext={invalidVeterinaryContext}
          onViewAnimalProfile={handleViewAnimal}
        />
      </Suspense>
    );
  }

  if (activeView === "vet-appointments" || (activeView === "vet-appointment-details" && navigation.veterinaryParent === "vet-appointments")) {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <VeterinaryUpcomingAppointments
          key={navigation.selectedAppointmentId ?? "appointments"}
          currentView={activeView} onNavigate={navigate}
          selectedAppointmentId={navigation.selectedAppointmentId}
          onSelectAppointment={(appointment) => selectAppointment(appointment, "vet-appointments")}
          onInvalidContext={invalidVeterinaryContext}
        />
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

  if (activeView === "veterinary-records" || (activeView === "veterinary-record" && navigation.veterinaryParent === "veterinary-records")) {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <VeterinaryMedicalHistory
          key={selectedAnimalId ?? "records"}
          currentView={activeView} onNavigate={navigate}
          selectedAnimalId={selectedAnimalId}
          onSelectAnimal={(id) => selectVeterinaryAnimal(id, "veterinary-records")}
          careScene={navigation.careScene ?? "history"}
          onChangeCareScene={changeCareScene}
          onInvalidContext={invalidVeterinaryContext}
        />
      </Suspense>
    );
  }

  if (activeView === "dispatcher-dashboard") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <RescueOperationsPortal page="rescue-board" onNavigate={navigate} onNavigateDestination={navigateTo} />
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
        key={viewedAnimal.id}
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
          onSelectAnimal={(animalId) => navigateTo({ view: "edit-animal", selectedAnimalId: animalId })}
        />
      </Suspense>
    );
  }

  if (activeView === "edit-animal" && selectedAnimalId) {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <EditAnimalProfile key={selectedAnimalId} animalId={selectedAnimalId} onNavigate={navigate} onInvalidContext={invalidEditContext} />
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
        <RescueOperationsPortal
          page={activeView} onNavigate={navigate} onNavigateDestination={navigateTo}
          detailMissionId={navigation.rescueMissionId ?? null}
          detailSource={navigation.detailSource ?? null}
        />
      </Suspense>
    );
  }

  if (activeView === "adoption-apply") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <AdoptionApplicationForm
          key={viewedAnimal?.id}
          animal={viewedAnimal ?? null}
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
