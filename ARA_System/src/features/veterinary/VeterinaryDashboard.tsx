import { SignInButton, useAuth, useUser } from "@clerk/react";
import { useCallback, useEffect, useState } from "react";
import { VeterinaryNavbar } from "./components/VeterinaryNavbar";
import type { Animal } from "../../types/animal";
import type { MedicalQueueAnimal, MedicalRecord, VeterinaryAppointment, VeterinaryDashboard as DashboardStats } from "../../types/veterinary";
import { isDevBypassEnabled } from "../../utils/devBypass";
import { fetchMedicalQueue, fetchMedicalRecord, fetchVeterinaryAppointments, fetchVeterinaryDashboard } from "../../services/veterinaryApi";
import type { VeterinaryView } from "./vetTypes";
import { VeterinaryDashboardPage } from "./pages/VeterinaryDashboardPage";
import { VeterinaryCarePage } from "./pages/VeterinaryCarePage";
import { FollowUpAppointmentPage } from "./FollowUpAppointmentPage";

type Props = {
  currentView: VeterinaryView;
  onNavigate: (view: VeterinaryView) => void;
  selectedAnimalId?: string | null;
  onSelectAnimal: (id: string) => void;
  selectedAppointment?: VeterinaryAppointment | null;
  onSelectAppointment: (appointment: VeterinaryAppointment) => void;
  onViewAnimalProfile?: (animal: Animal) => void;
};

export function VeterinaryDashboard({ currentView, onNavigate, selectedAnimalId, onSelectAnimal, selectedAppointment, onSelectAppointment, onViewAnimalProfile }: Props) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const allowed = isDevBypassEnabled || user?.publicMetadata.role === "veterinarian";
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [queue, setQueue] = useState<MedicalQueueAnimal[]>([]);
  const [appointments, setAppointments] = useState<VeterinaryAppointment[]>([]);
  const [record, setRecord] = useState<MedicalRecord | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const [nextStats, nextQueue, nextAppointments] = await Promise.all([
        fetchVeterinaryDashboard(token),
        fetchMedicalQueue(token),
        fetchVeterinaryAppointments(token),
      ]);
      setStats(nextStats);
      setQueue(nextQueue);
      setAppointments(nextAppointments);
      if (selectedAnimalId) setRecord(await fetchMedicalRecord(token, selectedAnimalId));
    } finally {
      setLoading(false);
    }
  }, [getToken, selectedAnimalId]);

  useEffect(() => {
    if (!isSignedIn || !allowed) return undefined;
    const timer = window.setTimeout(() => {
      void refresh().catch((value: unknown) => setError(value instanceof Error ? value.message : "Veterinary data could not be loaded."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [allowed, isSignedIn, refresh]);

  if (!isLoaded || !isSignedIn) return <LockedState signIn />;
  if (!allowed) return <LockedState onNavigate={() => onNavigate("home")} />;

  if (selectedAppointment) {
    return <FollowUpAppointmentPage appointment={selectedAppointment} getToken={getToken} onNavigate={onNavigate} onRefresh={refresh} />;
  }

  if (record) {
    return (
      <VeterinaryCarePage
        record={record}
        getToken={getToken}
        onBack={() => {
          setRecord(null);
          onSelectAnimal("");
        }}
        onRefresh={refresh}
        onViewProfile={onViewAnimalProfile}
      />
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
          onSelectAnimal={(id) => {
            setRecord(null);
            onSelectAnimal(id);
          }}
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