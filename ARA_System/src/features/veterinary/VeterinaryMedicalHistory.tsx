import { SignInButton, useAuth } from "@clerk/react";
import { useCallback, useEffect, useState } from "react";
import { IconNotes, IconPaw } from "../../components/MedicalIcons";
import { fetchMedicalRecord, fetchMedicalRecords } from "../../services/veterinaryApi";
import type { MedicalQueueAnimal, MedicalRecord } from "../../types/veterinary";
import type { VeterinaryView } from "./vetTypes";
import { VeterinaryNavbar } from "./components/VeterinaryNavbar";
import { AnimalThumb, Badge, Card, EmptyState } from "./components/VetUi";
import { fmtDate, label, veterinaryStatusFor } from "./components/vetHelpers";
import { VeterinaryCarePage } from "./pages/VeterinaryCarePage";

type Props = {
  currentView: VeterinaryView;
  onNavigate: (view: VeterinaryView) => void;
};

export function VeterinaryMedicalHistory({ currentView, onNavigate }: Props) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [animals, setAnimals] = useState<MedicalQueueAnimal[]>([]);
  const [selected, setSelected] = useState<MedicalRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      setAnimals(await fetchMedicalRecords(token));
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Medical history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const refreshSelected = useCallback(async () => {
    const token = await getToken();
    if (!token || !selected) return;
    setSelected(await fetchMedicalRecord(token, selected.animal.id));
  }, [getToken, selected]);

  if (!isLoaded || !isSignedIn) {
    return (
      <main className="dashboard-locked">
        <div className="dashboard-locked-card">
          <p className="eyebrow">Veterinary care</p>
          <h1>Sign in to see medical history</h1>
          <p>Medical history requires an authenticated veterinary account.</p>
          <SignInButton mode="modal">
            <button type="button" className="teal-button">Log in</button>
          </SignInButton>
        </div>
      </main>
    );
  }

  if (selected) {
    return (
      <VeterinaryCarePage
        record={selected}
        getToken={getToken}
        onBack={() => setSelected(null)}
        onRefresh={refreshSelected}
      />
    );
  }

  return (
    <main className="vm-page">
      <VeterinaryNavbar currentView={currentView} onNavigate={onNavigate} />
      <div className="vm-container">
        <header className="vm-page-head">
          <div>
            <p className="vm-eyebrow">Medical History</p>
            <h1>All animals in care</h1>
            <p className="vm-subtitle">Every animal with a recorded veterinary history in the system. Select one to view its medical history.</p>
          </div>
        </header>

        {error ? <p className="form-error">{error}</p> : null}

        <Card title="Medical history" detail={animals.length > 0 ? `${animals.length} animal${animals.length === 1 ? "" : "s"} with recorded history.` : undefined}>
          {loading ? (
            <p className="vm-hint"><IconPaw size={13} /> Loading medical history…</p>
          ) : animals.length === 0 ? (
            <EmptyState
              icon={<IconPaw size={20} />}
              title="No medical history yet"
              detail="Animals appear here once they have been examined, treated, or booked for a veterinary visit."
              action={
                <button type="button" className="teal-button compact-primary" onClick={() => onNavigate("veterinary-dashboard")}>
                  Go to medical queue
                </button>
              }
            />
          ) : (
            <div className="vm-table-wrap">
              <div className="vm-table vm-appt-table vm-records-table">
                <div className="vm-table-head vm-table-row">
                  <span className="vm-th">Animal</span>
                  <span className="vm-th">Species</span>
                  <span className="vm-th">Status</span>
                  <span className="vm-th">Action</span>
                </div>
                {animals.map((animal) => {
                  const status = veterinaryStatusFor(animal);
                  return (
                    <div className="vm-table-row" key={animal.id}>
                      <div className="vm-td vm-animal-cell">
                        <AnimalThumb photoUrl={animal.photoUrls?.[0]} name={animal.name} />
                        <span className="vm-copy">
                          <strong>{animal.name}</strong>
                          <small>{animal.publicId}</small>
                        </span>
                      </div>
                      <div className="vm-td">
                        <strong>{label(animal.type)}</strong>
                        <small>{animal.breed ?? "Mixed breed"}</small>
                      </div>
                      <div className="vm-td">
                        <Badge tone={status.tone}>{status.text}</Badge>
                        <small><IconNotes size={11} /> Rescued {fmtDate(animal.rescueDate)}</small>
                      </div>
                      <div className="vm-td vm-td-actions">
                        <button
                          type="button"
                          className="vm-queue-action is-primary"
                          onClick={() => {
                            void (async () => {
                              const token = await getToken();
                              if (!token) return;
                              try {
                                setSelected(await fetchMedicalRecord(token, animal.id));
                              } catch (value) {
                                setError(value instanceof Error ? value.message : "The medical history could not be loaded.");
                              }
                            })();
                          }}
                        >
                          View history
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}