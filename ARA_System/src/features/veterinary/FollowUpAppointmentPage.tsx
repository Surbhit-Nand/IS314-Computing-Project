import { useEffect, useRef, useState } from "react";
import { IconArrowLeft, IconCalendar, IconCheck, IconClock, IconNotes, IconUser } from "../../components/MedicalIcons";
import { VeterinaryNavbar } from "./components/VeterinaryNavbar";
import { completeAppointment, fetchMedicalRecord } from "../../services/veterinaryApi";
import type { MedicalRecord, VeterinaryAppointment } from "../../types/veterinary";
import type { VeterinaryView } from "./vetTypes";
import { AnimalMedicalHeader } from "./components/AnimalMedicalHeader";
import { CareSnapshot } from "./components/WorkflowShell";
import { Badge, Card, Field } from "./components/VetUi";
import { fmtDate, fmtDateTime, fmtTime, label } from "./components/vetHelpers";

type Props = {
  appointment: VeterinaryAppointment;
  getToken: () => Promise<string | null>;
  onNavigate: (view: VeterinaryView) => void;
  onRefresh: () => Promise<void>;
  parentView?: "veterinary-dashboard" | "vet-appointments";
};

export function FollowUpAppointmentPage({ appointment: entry, getToken, onNavigate, onRefresh, parentView = "veterinary-dashboard" }: Props) {
 const { appointment, animal, adopterName } = entry;
  const [record, setRecord] = useState<MedicalRecord | null>(null);
  const [status, setStatus] = useState(appointment.status);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [completing, setCompleting] = useState(false);
  const navigationVersion = useRef(0);


  
  useEffect(() => {
    const version = navigationVersion.current;
    void (async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const nextRecord = await fetchMedicalRecord(token, animal.id);
        if (version === navigationVersion.current) setRecord(nextRecord);
      } catch (value) {
        if (version !== navigationVersion.current) return;
        setError(value instanceof Error ? value.message : "Could not load the medical record.");
      }
    })();
    return () => { navigationVersion.current += 1; };
  }, [getToken, animal.id]);

  async function handleComplete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const version = navigationVersion.current;
    const data = new FormData(event.currentTarget);
    const token = await getToken();
    if (!token) return;
    setCompleting(true);
    try {
      await completeAppointment(token, appointment.id, {
        visitDetails: String(data.get("visitDetails") ?? "Follow-up visit completed"),
        treatmentPerformed: String(data.get("treatmentPerformed") ?? "Recorded in medical history"),
      });
      if (version !== navigationVersion.current) return;
      await onRefresh();
      if (version !== navigationVersion.current) return;
      setStatus("completed");
      setMessage("Visit marked as completed and saved to the medical history.");
    } catch (value) {
      if (version !== navigationVersion.current) return;
      setError(value instanceof Error ? value.message : "Could not complete the appointment.");
    } finally {
      setCompleting(false);
    }
  }

  const statusTone = status === "booked" ? "blue" : status === "completed" ? "green" : "slate";

  return (
    <main className="vm-page">
      <VeterinaryNavbar currentView="vet-appointment-details" onNavigate={onNavigate} />
      <div className="vm-container">
        <div className="vm-record-top" style={{ marginBottom: 14 }}>
          <button type="button" className="ghost-button compact-action" onClick={() => onNavigate(parentView)}><IconArrowLeft size={13} /> Back to {parentView === "vet-appointments" ? "appointments" : "dashboard"}</button>
        </div>

        <AnimalMedicalHeader
          name={animal.name}
          type={animal.type}
          breed={animal.breed}
          gender={animal.gender}
          vaccinationStatus={animal.vaccinationStatus}
          publicId={animal.publicId}
          photoUrl={animal.photoUrls?.[0]}
          veterinaryStatus={animal.veterinaryStatus}
          medicallyCleared={animal.medicallyCleared}
          rescueDate={animal.rescueDate}
          actions={<Badge tone={statusTone === "green" ? "green" : statusTone === "blue" ? "blue" : "slate"}>{label(status)}</Badge>}
        />

        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="vm-lock-hint" style={{ background: "var(--vm-green-tint)", borderColor: "rgba(31,157,85,0.3)", color: "var(--vm-green)" }}><IconCheck size={15} /> {message}</p> : null}

        <div className="vm-layout" style={{ marginTop: 20 }}>
          <div className="vm-main">
            <Card
              title="Appointment details"
              detail={appointment.source === "owner_booked"
                ? "Appointment booked by this animal's adopter."
                : "Follow-up veterinary visit booked for this animal."}
            >
              <div className="vm-detail-grid">
                <div className="vm-detail-item">
                  <span><IconCalendar size={12} /> Date</span>
                  <strong>{fmtDate(appointment.appointmentDate)}</strong>
                  <small>{fmtTime(appointment.appointmentDate)}</small>
                </div>
                <div className="vm-detail-item">
                  <span><IconNotes size={12} /> Purpose</span>
                  <strong>{appointment.purpose}</strong>
                </div>
                <div className="vm-detail-item">
                  <span>Status</span>
                  <strong>{label(status)}</strong>
                </div>
                <div className="vm-detail-item">
                  <span><IconUser size={12} /> Booked by</span>
                  <strong>{adopterName ?? (appointment.notes ? appointment.notes.replace(/^Booked by\s*/i, "") : "SPCA account holder")}</strong>
                </div>
              </div>
              {appointment.visitDetails ? <p className="vm-quote" style={{ marginTop: 14 }}>{appointment.visitDetails}</p> : null}
              {appointment.treatmentPerformed ? (
                <div className="vm-summary-line" style={{ marginTop: 14 }}>
                  <div className="vm-status-line"><strong>Treatment performed</strong><Badge tone="green">Recorded</Badge></div>
                  <p>{appointment.treatmentPerformed}</p>
                </div>
              ) : null}
            </Card>

            {status === "booked" ? (
              <form className="vm-form" onSubmit={handleComplete}>
                <Card title="Complete this visit" detail="Record what happened so it is saved to the medical history.">
                  <div className="vm-fields">
                    <Field labelText="Visit details" full>
                      <textarea className="vm-textarea" name="visitDetails" required placeholder="e.g. Re-checked wound, healing well. No concerns." />
                    </Field>
                    <Field labelText="Treatment performed" full>
                      <textarea className="vm-textarea" name="treatmentPerformed" placeholder="e.g. Dressing changed, next review in two weeks" />
                    </Field>
                  </div>
                </Card>
                <div className="vm-form-actions">
                  <button type="button" className="ghost-button" onClick={() => onNavigate(parentView)}>Back to {parentView === "vet-appointments" ? "appointments" : "dashboard"}</button>
                  <button type="submit" className="teal-button" disabled={completing}><IconCheck size={15} /> {completing ? "Saving…" : "Mark visit completed"}</button>
                </div>
              </form>
            ) : (
              <div className="vm-form-actions">
                <button type="button" className="ghost-button" onClick={() => onNavigate(parentView)}>Back to {parentView === "vet-appointments" ? "appointments" : "dashboard"}</button>
              </div>
            )}
          </div>

          <aside className="vm-side">
            <Card title="Appointment" detail="At a glance.">
              <dl className="vm-facts">
                <div className="vm-fact-row"><dt>When</dt><dd>{fmtDateTime(appointment.appointmentDate)}</dd></div>
                <div className="vm-fact-row"><dt>Purpose</dt><dd>{appointment.purpose}</dd></div>
                <div className="vm-fact-row"><dt>Status</dt><dd>{label(status)}</dd></div>
                <div className="vm-fact-row"><dt>Animal</dt><dd>{animal.name}</dd></div>
              </dl>
            </Card>
            {record ? (
              <Card title="Care snapshot"><CareSnapshot record={record} /></Card>
            ) : (
              <Card title="Care snapshot">
                <p className="vm-hint"><IconClock size={13} /> Loading the animal's medical record…</p>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
