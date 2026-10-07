import { SignInButton, useAuth, useUser } from "@clerk/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { VeterinaryNavbar } from "./components/VeterinaryNavbar";
import type { Animal } from "../../types/animal";
import type { MedicalQueueAnimal, MedicalRecord, VeterinaryAppointment, VeterinaryDashboard as DashboardStats } from "../../types/veterinary";
import { isDevBypassEnabled } from "../../utils/devBypass";
import { fetchMedicalQueue, fetchMedicalRecord, fetchVeterinaryAppointments, fetchVeterinaryDashboard } from "../../services/veterinaryApi";
import type { VeterinaryView } from "./vetTypes";
import { VeterinaryDashboardPage } from "./pages/VeterinaryDashboardPage";
import { VeterinaryCarePage } from "./pages/VeterinaryCarePage";
import { FollowUpAppointmentPage } from "./FollowUpAppointmentPage";
import type { CareScene } from "../../navigation/araNavigation";

type Props = {
  currentView: VeterinaryView;
  onNavigate: (view: VeterinaryView) => void;
  selectedAnimalId?: string | null;
  onSelectAnimal: (id: string) => void;
  selectedAppointmentId?: string;
  careScene: CareScene;
  onChangeCareScene: (scene: CareScene, replace?: boolean) => void;
  onInvalidContext: () => void;
  onSelectAppointment: (appointment: VeterinaryAppointment) => void;
  onViewAnimalProfile?: (animal: Animal) => void;
};

export function VeterinaryDashboard({ currentView, onNavigate, selectedAnimalId, onSelectAnimal, selectedAppointmentId, onSelectAppointment, onViewAnimalProfile, careScene, onChangeCareScene, onInvalidContext }: Props) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const allowed = isDevBypassEnabled || user?.publicMetadata.role === "veterinarian";
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [queue, setQueue] = useState<MedicalQueueAnimal[]>([]);
  const [appointments, setAppointments] = useState<VeterinaryAppointment[]>([]);
  const [record, setRecord] = useState<MedicalRecord | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const [nextStats, nextQueue, nextAppointments] = await Promise.all([
        fetchVeterinaryDashboard(token),
        fetchMedicalQueue(token),
        fetchVeterinaryAppointments(token),
      ]);
      if (version !== requestVersion.current) return;
      setStats(nextStats);
      setQueue(nextQueue);
      setAppointments(nextAppointments);
      if (currentView === "vet-appointment-details" && !nextAppointments.some((entry) => entry.appointment.id === selectedAppointmentId)) {
        onInvalidContext();
        return;
      }
      if (currentView === "veterinary-record" && selectedAnimalId) {
        const nextRecord = await fetchMedicalRecord(token, selectedAnimalId);
        if (version !== requestVersion.current) return;
        setRecord(nextRecord);
      }
      setError("");
    } catch (value) {
      if (version !== requestVersion.current) return;
      if (value instanceof Error && /animal not found/i.test(value.message)) onInvalidContext();
      else setError(value instanceof Error ? value.message : "Veterinary data could not be loaded.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [getToken, selectedAnimalId, selectedAppointmentId, currentView, onInvalidContext]);

  useEffect(() => {
    if (!isSignedIn || !allowed) return undefined;
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => { window.clearTimeout(timer); requestVersion.current += 1; };
  }, [allowed, isSignedIn, refresh]);

  if (!isLoaded || !isSignedIn) return <LockedState signIn />;
  if (!allowed) return <LockedState onNavigate={() => onNavigate("home")} />;

  const selectedAppointment = appointments.find((entry) => entry.appointment.id === selectedAppointmentId);
  if (currentView === "vet-appointment-details" && selectedAppointment) {
    return <FollowUpAppointmentPage key={selectedAppointment.appointment.id} appointment={selectedAppointment} getToken={getToken} onNavigate={onNavigate} onRefresh={refresh} />;
  }

  if (currentView === "veterinary-record" && record && record.animal.id === selectedAnimalId) {
    return (
      <VeterinaryCarePage
        record={record}
        scene={careScene}
        onChangeScene={onChangeCareScene}
        getToken={getToken}
        onBack={() => onNavigate("veterinary-dashboard")}
        onRefresh={refresh}
        onViewProfile={onViewAnimalProfile}
      />
    );
  }

  if (currentView === "veterinary-record" || currentView === "vet-appointment-details") {
    return (
      <main className="vm-page">
        <div className="vm-container">
          <p className={error ? "form-error" : "vm-hint"}>{error || "Loading veterinary details..."}</p>
          <button type="button" className="ghost-button" onClick={() => onNavigate("veterinary-dashboard")}>Back to dashboard</button>
        </div>
      </main>
    );
  }

  return (
    <main className="vm-page">
      <VeterinaryNavbar currentView={currentView} onNavigate={onNavigate} />
      <div className="vm-container">
        <VeterinaryDashboardPage
          stats={stats}
          queue={queue}
          appointments={appointments}
          loading={loading}
          error={error}
          onSelectAnimal={onSelectAnimal}
          onSelectAppointment={onSelectAppointment}
          onBookAppointment={() => onNavigate("vet-booking")}
        />
      </div>
    </main>
  );
}

function LockedState({ signIn, onNavigate }: { signIn?: boolean; onNavigate?: () => void }) {
  return (
    <main className="dashboard-locked">
      <div className="dashboard-locked-card">
        <p className="eyebrow">Veterinary care</p>
        <h1>{signIn ? "Sign in to continue" : "Access restricted"}</h1>
        <p>{signIn ? "Veterinary care is available to authorised staff." : "Your account does not have veterinary permissions."}</p>
        {signIn ? (
          <SignInButton mode="modal">
            <button type="button" className="teal-button">Log in</button>
          </SignInButton>
        ) : (
          <button type="button" className="teal-button" onClick={onNavigate}>Return home</button>
        )}
      </div>
    </main>
  );
}
