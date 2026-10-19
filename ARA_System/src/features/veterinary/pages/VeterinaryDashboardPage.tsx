import { emergencyQueueFocusEvent, focusPendingVeterinaryEmergency } from "../../../utils/veterinaryEmergencyFocus";
import { useEffect } from "react";
import { EmergencyResponseActions } from "../components/EmergencyResponseActions";
import type { VeterinaryEmergencyResponse } from "../../../types/veterinary";
import { IconActivity, IconCalendar, IconCalendarPlus, IconCheck, IconClipboard, IconNotes, IconShieldCheck, IconSyringe, IconPawPrint, IconHeart } from "../../../components/MedicalIcons";
import type { MedicalQueueAnimal, VeterinaryAppointment, VeterinaryDashboard as DashboardStats } from "../../../types/veterinary";
import { AnimalThumb, Badge, Card, Chip, EmptyState, Stat } from "../components/VetUi";
import { fmtDate, fmtTime, label, priorityFor, priorityRank } from "../components/vetHelpers";

const stageMeta: Record<string, { tone: "blue" | "green" | "amber" | "red"; copy: string; action: string }> = {
  needs_initial_examination: { tone: "red", copy: "Needs assessment", action: "Run assessment" },
  awaiting_medical_clearance: { tone: "green", copy: "Ready for clearance", action: "Review clearance" },
  medically_cleared: { tone: "green", copy: "Medically cleared", action: "View care" },
  under_assessment: { tone: "blue", copy: "Assessment in progress", action: "Continue assessment" },
  treatment_required: { tone: "amber", copy: "Treatment required", action: "Advance treatment" },
  treatment_ongoing: { tone: "amber", copy: "Treatment in progress", action: "Complete treatment" },
};

function queueStage(animal: MedicalQueueAnimal) {
  return stageMeta[animal.veterinaryStatus] ?? { tone: "blue" as const, copy: label(animal.veterinaryStatus), action: "View care" };
}

type Props = {
  emergencyResponses?: VeterinaryEmergencyResponse[];
  coordinationUnavailable?: boolean;
  currentVetId?: string;
  onCoordinationChanged?: () => Promise<void>;
  stats: DashboardStats | null;
  queue: MedicalQueueAnimal[];
  appointments: VeterinaryAppointment[];
  loading: boolean;
  error: string;
  onSelectAnimal: (id: string) => void;
  onSelectAppointment: (appointment: VeterinaryAppointment) => void;
  onBookAppointment: () => void;
  getToken: () => Promise<string | null>;
};

export function VeterinaryDashboardPage({ emergencyResponses = [], coordinationUnavailable = true, currentVetId, onCoordinationChanged, stats, queue, appointments, loading, error, onSelectAnimal, onSelectAppointment, onBookAppointment, getToken }: Props) {
  useEffect(() => {
    if (loading) return;
    focusPendingVeterinaryEmergency();
    const focus = () => focusPendingVeterinaryEmergency(true);
    window.addEventListener(emergencyQueueFocusEvent, focus);
    return () => window.removeEventListener(emergencyQueueFocusEvent, focus);
  }, [loading, queue]);
  const needsAssessment = queue.filter((animal) => animal.veterinaryStatus === "needs_initial_examination").length;
  const underTreatment = queue.filter((animal) => !animal.medicallyCleared && animal.veterinaryStatus !== "needs_initial_examination" && animal.veterinaryStatus !== "awaiting_medical_clearance").length;
  const readyForClearance = queue.filter((animal) => !animal.medicallyCleared && animal.veterinaryStatus === "awaiting_medical_clearance").length;
  // Highest-veterinary-priority animals first so the vet sees the most urgent
  // case at the top; animals without a priority sort last.
  const focus = queue
    .filter((animal) => !animal.medicallyCleared)
    .sort((a, b) => priorityRank(a.veterinaryPriority) - priorityRank(b.veterinaryPriority))
    .slice(0, 5);
  const orderedQueue = [...queue].sort((a, b) => priorityRank(a.veterinaryPriority) - priorityRank(b.veterinaryPriority));

  return (
    <div className="vm-content">
      <header className="vm-page-head">
        <div>
          <p className="vm-eyebrow">Clinical operations <span aria-hidden="true">/</span> Overview</p>
          <h1>Veterinary care, <span>all in one place.</span></h1>
          <p className="vm-subtitle">Assess, treat and clear registered animals on their journey to adoption.</p>
        </div>
        <div className="vm-page-head-actions">
          <button type="button" className="teal-button" onClick={onBookAppointment}><IconCalendarPlus size={15} /> Book follow-up</button>

        </div>
        <div className="workspace-hero-art" aria-hidden="true"><IconPawPrint size={44} /><IconHeart size={22} /></div>
      </header>

      <div className="workspace-journey" aria-label="Veterinary care journey"><strong>The care journey</strong><span>01 · Initial assessment</span><span aria-hidden="true">→</span><span>02 · Required treatments</span><span aria-hidden="true">→</span><span>03 · Medical clearance</span></div>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="vm-stats">
        <Stat icon={<IconClipboard size={20} />} value={needsAssessment} labelText="Needs assessment" detail="Awaiting first examination" tone="amber" />
        <Stat icon={<IconSyringe size={20} />} value={underTreatment} labelText="Under treatment" detail="Care plans in progress" tone="blue" />
        <Stat icon={<IconShieldCheck size={20} />} value={readyForClearance} labelText="Ready for clearance" detail="Treatments completed" tone="green" />
        <Stat icon={<IconCalendar size={20} />} value={stats?.upcomingAppointments ?? appointments.filter(({ appointment }) => appointment.status === "booked").length} labelText="Follow-up appointments" detail="Booked visits pending" tone="blue" />
      </section>

      <div className="vm-layout">
        <div className="vm-main">
          <Card title="Medical queue" detail="All animals in need of veterinary care, prioritised by veterinary priority.">
            {loading ? (
              <QueueSkeleton />
            ) : queue.length === 0 ? (
              <EmptyState icon={<IconCheck size={20} />} title="No animals in the queue" detail="Every registered animal is either adopted or has completed its medical journey." />
            ) : (
              <>
                <div id="veterinary-medical-queue" className="vm-table-wrap" tabIndex={-1}>
                  <div className="vm-table vm-queue-table">
                    <div className="vm-table-head vm-table-row">
                      <span className="vm-th">Animal</span>
                      <span className="vm-th">Priority</span>
                      <span className="vm-th">Care Stage</span>
                      <span className="vm-th">Actions</span>
                    </div>
                    {orderedQueue.map((animal) => (
                      <QueueRow key={animal.id} animal={animal} onSelect={onSelectAnimal} response={emergencyResponses.find((entry) => entry.animalId === animal.id)} currentVetId={currentVetId} unavailable={coordinationUnavailable} getToken={getToken} onChanged={onCoordinationChanged ?? (async () => undefined)} />
                    ))}
                  </div>
                </div>
              </>
            )}
          </Card>

          <Card title="Upcoming appointments" detail="Follow-up visits and adopter bookings across the shelter." action={appointments.length ? <button type="button" className="ghost-button" onClick={onBookAppointment}>Book follow-up</button> : undefined}>
            {loading ? (
              <ApptSkeleton />
            ) : appointments.length === 0 ? (
              <EmptyState icon={<IconCalendar size={20} />} title="No appointments scheduled" detail="Book a follow-up visit to keep each animal on track after care." action={<button type="button" className="teal-button compact-primary" onClick={onBookAppointment}>Book follow-up</button>} />
            ) : (
              <div className="vm-table-wrap">
                <div className="vm-table vm-appt-table">
                  <div className="vm-table-head vm-table-row">
                    <span className="vm-th">Animal</span>
                    <span className="vm-th">Appointment</span>
                    <span className="vm-th">When</span>
                    <span className="vm-th">Action</span>
                  </div>
                  {appointments.map(({ appointment, animal, adopterName }) => (
                    <AppointmentRow key={appointment.id} appointment={appointment} animal={animal} adopterName={adopterName} onSelect={() => onSelectAppointment({ appointment, animal, adopterName })} />
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        <aside className="vm-side">
          <Card title="Today's focus" detail="The next action for each animal still in care.">
            {focus.length === 0 ? (
              <EmptyState icon={<IconCheck size={18} />} title="Queue is clear" detail="Every animal is already medically cleared." />
            ) : (
              <div className="vm-list-stack">
                {focus.map((animal, index) => {
                  const meta = queueStage(animal);
                  return (
                    <div key={animal.id} className="vm-focus-row">
                      <span className={`vm-focus-num tone-${meta.tone}`}>{index + 1}</span>
                      <span className="vm-focus-copy">
                        <strong>{animal.name}</strong>
                        {meta.action}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
          <Card title="Shelter overview" detail="Live breakdown of the medical queue.">
            <div className="vm-list-stack">
              <div className="vm-list-row"><span className="vm-list-copy"><strong>Needs assessment</strong><small>Awaiting first examination</small></span><Badge tone="amber">{queue.filter((a) => a.veterinaryStatus === "needs_initial_examination").length}</Badge></div>
              <div className="vm-list-row"><span className="vm-list-copy"><strong>Under treatment</strong><small>Care plan in progress</small></span><Badge tone="blue">{underTreatment}</Badge></div>
              <div className="vm-list-row"><span className="vm-list-copy"><strong>Ready for clearance</strong><small>All treatments done</small></span><Badge tone="green">{readyForClearance}</Badge></div>
            </div>
          </Card>
          <Card title="Care focus" detail="Animals past initial assessment, still in treatment or ready for clearance.">
            <VaccinationList queue={queue} onSelect={onSelectAnimal} />
          </Card>
        </aside>
      </div>
    </div>
  );
}

function QueueRow({ animal, onSelect, response, currentVetId, unavailable, getToken, onChanged }: {
  animal: MedicalQueueAnimal; onSelect: (id: string) => void; response?: VeterinaryEmergencyResponse;
  currentVetId?: string; unavailable: boolean; getToken: () => Promise<string | null>; onChanged: () => Promise<void>;
}) {
  const meta = queueStage(animal);
  const priority = priorityFor(animal.veterinaryPriority);
  const attending = response?.attendingVeterinarianClerkUserId;
  const medicalAction = <button type="button" className="vm-queue-action vm-medical-action" onClick={() => onSelect(animal.id)}>{meta.action}</button>;
  return (
    <div className={`vm-table-row${animal.veterinaryPriority === "critical" && !unavailable && !attending ? " vm-awaiting-critical" : ""}`}>
      <div className="vm-td vm-animal-cell" data-label="Animal">
        <AnimalThumb photoUrl={animal.photoUrls?.[0]} name={animal.name} />
        <span className="vm-copy">
          <strong>{animal.name}</strong>
          <small className="vm-queue-attendance">{unavailable ? "Attendance unavailable" : attending ? `Attending: ${response?.attendingVeterinarianName || "Veterinarian (name unavailable)"}` : "Awaiting veterinarian"}</small>
          <small>{animal.publicId} ? {label(animal.type)}{animal.breed ? ` ? ${animal.breed}` : ""}{animal.gender ? ` ? ${label(animal.gender)}` : ""}</small>
        </span>
      </div>
      <div className="vm-td vm-priority-cell" data-label="Priority"><Badge tone={priority.tone}>{priority.text}</Badge></div>
      <div className="vm-td" data-label="Care Stage"><Badge tone={meta.tone}>{meta.copy}</Badge></div>
      <div className="vm-td vm-td-actions" data-label="Actions">
        {animal.veterinaryPriority === "critical" ? <EmergencyResponseActions animal={animal} response={response} currentVetId={currentVetId} unavailable={unavailable} getToken={getToken} onChanged={onChanged} medicalActionLabel={meta.action} onBeginCare={() => onSelect(animal.id)} /> : <div className="vm-response-standalone">{medicalAction}</div>}
      </div>
    </div>
  );
}

function AppointmentRow({ appointment, animal, adopterName, onSelect }: { appointment: VeterinaryAppointment["appointment"]; animal: MedicalQueueAnimal; adopterName?: string | null; onSelect: () => void }) {
  return (
    <div className="vm-table-row">
      <div className="vm-td vm-animal-cell">
        <AnimalThumb photoUrl={animal.photoUrls?.[0]} name={animal.name} />
        <span className="vm-copy">
          <strong>{animal.name}</strong>
          <small>{animal.publicId}</small>
        </span>
      </div>
      <div className="vm-td">
        <strong>{appointment.purpose}</strong>
        <small><IconNotes size={11} /> {appointment.source === "owner_booked" ? `Owner booking · ${adopterName ?? "Adopter"}` : appointment.notes ?? "Follow-up visit"}</small>
        {appointment.notes && appointment.source === "owner_booked" ? <small>{appointment.notes}</small> : null}
      </div>
      <div className="vm-td">
        <strong>{fmtDate(appointment.appointmentDate)}</strong>
        <small>{fmtTime(appointment.appointmentDate)}</small>
        <Badge tone={appointment.status === "booked" ? "blue" : appointment.status === "completed" ? "green" : "slate"}>{label(appointment.status)}</Badge>
      </div>
      <div className="vm-td vm-td-actions">
        {appointment.status === "booked" ? <button type="button" className="vm-queue-action is-primary" onClick={onSelect}>View</button> : <button type="button" className="vm-queue-action" onClick={onSelect}>Details</button>}
      </div>
    </div>
  );
}

// The stages a rescued animal moves through once it has its first veterinary
// assessment: treatment (stage 2) then medical clearance (stage 3).
const ACTIVE_STAGES = ["treatment_required", "treatment_ongoing", "awaiting_medical_clearance"];

function VaccinationList({ queue, onSelect }: { queue: MedicalQueueAnimal[]; onSelect: (id: string) => void }) {
  const inCare = queue.filter((animal) => ACTIVE_STAGES.includes(animal.veterinaryStatus));
  if (inCare.length === 0) {
    return <EmptyState icon={<IconActivity size={18} />} title="No animals in active care" detail="Animals past initial assessment move through treatment and clearance here." />;
  }
  return (
    <div className="vm-list-stack">
      {inCare.slice(0, 5).map((animal) => {
        const stage = queueStage(animal);
        return (
          <div key={animal.id} className="vm-care-focus">
            <span className="vm-care-focus-name">
              <strong>{animal.name}</strong>
              <small>{animal.publicId}</small>
            </span>
            <span className="vm-care-focus-foot">
              <Chip tone={stage.tone}>{stage.copy}</Chip>
              <button type="button" className="vm-queue-action is-primary compact" onClick={() => onSelect(animal.id)}>View care</button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

const SKELETON_ROWS = ["row-a", "row-b", "row-c", "row-d", "row-e"];

function QueueSkeleton() {
  return (
    <div className="vm-table-wrap">
      <div className="vm-table vm-queue-table">
        <div className="vm-table-head vm-table-row">
          <span className="vm-th">Animal</span>
          <span className="vm-th">Priority</span>
          <span className="vm-th">Care Stage</span>
          <span className="vm-th">Actions</span>
        </div>
        {SKELETON_ROWS.map((row) => (
          <div className="vm-table-row" key={row}>
            <div className="vm-td vm-animal-cell">
              <span className="vm-skeleton vm-skeleton-thumb" />
              <span className="vm-skeleton-stack">
                <span className="vm-skeleton vm-skeleton-line" />
                <span className="vm-skeleton vm-skeleton-line short" />
              </span>
            </div>
            <div className="vm-td"><span className="vm-skeleton vm-skeleton-badge" /></div>
            <div className="vm-td"><span className="vm-skeleton vm-skeleton-badge" /></div>
            <div className="vm-td vm-td-actions"><span className="vm-skeleton vm-skeleton-button" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApptSkeleton() {
  return (
    <div className="vm-table-wrap">
      <div className="vm-table vm-appt-table">
        <div className="vm-table-head vm-table-row">
          <span className="vm-th">Animal</span>
          <span className="vm-th">Appointment</span>
          <span className="vm-th">When</span>
          <span className="vm-th">Action</span>
        </div>
        {SKELETON_ROWS.slice(0, 3).map((row) => (
          <div className="vm-table-row" key={row}>
            <div className="vm-td vm-animal-cell">
              <span className="vm-skeleton vm-skeleton-thumb" />
              <span className="vm-skeleton-stack">
                <span className="vm-skeleton vm-skeleton-line" />
                <span className="vm-skeleton vm-skeleton-line short" />
              </span>
            </div>
            <div className="vm-td"><span className="vm-skeleton-stack"><span className="vm-skeleton vm-skeleton-line" /><span className="vm-skeleton vm-skeleton-line short" /></span></div>
            <div className="vm-td"><span className="vm-skeleton-stack"><span className="vm-skeleton vm-skeleton-line" /><span className="vm-skeleton vm-skeleton-badge" /></span></div>
            <div className="vm-td vm-td-actions"><span className="vm-skeleton vm-skeleton-button" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
