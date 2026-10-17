import { SignInButton, useAuth } from "@clerk/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconCalendar, IconCalendarPlus, IconNotes, IconUser } from "../../components/MedicalIcons";
import { fetchVeterinaryAppointments } from "../../services/veterinaryApi";
import type { VeterinaryAppointment } from "../../types/veterinary";
import type { VeterinaryView } from "./vetTypes";
import { VeterinaryNavbar } from "./components/VeterinaryNavbar";
import { AnimalThumb, Badge, Card, EmptyState } from "./components/VetUi";
import { fmtDate, fmtTime, label } from "./components/vetHelpers";
import { FollowUpAppointmentPage } from "./FollowUpAppointmentPage";

type Props = {
  currentView: VeterinaryView;
  selectedAppointmentId?: string;
  onSelectAppointment: (appointment: VeterinaryAppointment) => void;
  onInvalidContext: () => void;
  onNavigate: (view: VeterinaryView) => void;
};

export function VeterinaryUpcomingAppointments({ currentView, onNavigate, selectedAppointmentId, onSelectAppointment, onInvalidContext }: Props) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [appointments, setAppointments] = useState<VeterinaryAppointment[]>([]);
  const requestVersion = useRef(0);
  const selected = appointments.find((entry) => entry.appointment.id === selectedAppointmentId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token || version !== requestVersion.current) return;
      const entries = await fetchVeterinaryAppointments(token);
      if (version !== requestVersion.current) return;
      if (selectedAppointmentId && !entries.some((entry) => entry.appointment.id === selectedAppointmentId)) {
        onInvalidContext();
        return;
      }
      setAppointments(entries);
      setError("");
    } catch (value) {
      if (version !== requestVersion.current) return;
      setError(value instanceof Error ? value.message : "Could not load upcoming appointments.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [getToken, selectedAppointmentId, onInvalidContext]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => { window.clearTimeout(timer); requestVersion.current += 1; };
  }, [load]);

  if (!isLoaded || !isSignedIn) {
    return (
      <main className="dashboard-locked">
        <div className="dashboard-locked-card">
          <p className="eyebrow">Veterinary care</p>
          <h1>Sign in to see appointments</h1>
          <p>Upcoming veterinary appointments require an authenticated account.</p>
          <SignInButton mode="modal">
            <button type="button" className="teal-button">Log in</button>
          </SignInButton>
        </div>
      </main>
    );
  }

  if (selected) {
    return <FollowUpAppointmentPage key={selected.appointment.id} appointment={selected} parentView="vet-appointments" getToken={getToken} onNavigate={onNavigate} onRefresh={load} />;
  }

  if (selectedAppointmentId) {
    return (
      <main className="vm-page">
        <div className="vm-container">
          <p className={error ? "form-error" : "vm-hint"}>{error || "Loading appointment..."}</p>
          <button type="button" className="ghost-button" onClick={() => onNavigate("vet-appointments")}>Back to appointments</button>
        </div>
      </main>
    );
  }

  return (
    <main className="vm-page">
      <VeterinaryNavbar currentView={currentView} onNavigate={onNavigate} />
      <div className="vm-container">
        <header className="vm-page-head">
          <div>
            <p className="vm-eyebrow">Appointments</p>
            <h1>Upcoming appointments</h1>
            <p className="vm-subtitle">Upcoming follow-up visits and owner-booked appointments, nearest first.</p>
          </div>
          <div className="vm-page-head-actions">
            <button type="button" className="teal-button" onClick={() => onNavigate("vet-booking")}><IconCalendarPlus size={15} /> Book follow-up</button>
          </div>
        </header>

        {error ? <p className="form-error">{error}</p> : null}

        <Card title="Upcoming appointments" detail={appointments.length > 0 ? `${appointments.length} visit${appointments.length === 1 ? "" : "s"} scheduled.` : undefined}>
          {loading ? (
            <p className="vm-hint"><IconCalendar size={13} /> Loading upcoming appointments…</p>
          ) : appointments.length === 0 ? (
            <EmptyState
              icon={<IconCalendar size={20} />}
              title="No upcoming appointments"
              detail="There are no upcoming follow-ups or owner bookings on the clinic schedule."
              action={<button type="button" className="teal-button compact-primary" onClick={() => onNavigate("vet-booking")}>Book follow-up</button>}
            />
          ) : (
            <div className="vm-table-wrap">
              <div className="vm-table vm-appt-table vm-appt-even">
                <div className="vm-table-head vm-table-row">
                  <span className="vm-th">Animal</span>
                  <span className="vm-th">Purpose</span>
                  <span className="vm-th">When</span>
                  <span className="vm-th">Action</span>
                </div>
                {appointments.map(({ appointment, animal, adopterName }) => (
                  <div className="vm-table-row" key={appointment.id}>
                    <div className="vm-td vm-animal-cell">
                      <AnimalThumb photoUrl={animal.photoUrls?.[0]} name={animal.name} />
                      <span className="vm-copy">
                        <strong>{animal.name}</strong>
                        <small>{animal.publicId} · {label(animal.type)}</small>
                      </span>
                    </div>
                    <div className="vm-td">
                      <strong>{appointment.purpose}</strong>
                      {appointment.source === "owner_booked" ? (
                        <small><IconUser size={11} /> Owner booking · {adopterName ?? "Adopter"}</small>
                      ) : (
                        <small><IconNotes size={11} /> {appointment.notes?.replace(/^Booked by\s*/i, "") ?? "Follow-up visit"}</small>
                      )}
                      {appointment.notes && appointment.source === "owner_booked" ? (
                        <small><IconNotes size={11} /> {appointment.notes}</small>
                      ) : null}
                      <Badge tone={appointment.status === "completed" ? "green" : "blue"}>{label(appointment.status)}</Badge>
                    </div>
                    <div className="vm-td">
                      <strong>{fmtDate(appointment.appointmentDate)}</strong>
                      <small><IconUser size={11} /> {fmtTime(appointment.appointmentDate)}</small>
                    </div>
                    <div className="vm-td vm-td-actions">
                      <button type="button" className="vm-queue-action is-primary" onClick={() => onSelectAppointment({ appointment, animal, adopterName })}>View</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
