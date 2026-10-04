import type { ReactNode } from "react";
import { IconCalendar, IconCheck } from "../../../components/MedicalIcons";
import type { MedicalRecord } from "../../../types/veterinary";
import { Badge, Progress } from "./VetUi";
import { computeCareStatus, fmtDate, fmtTime } from "./vetHelpers";

// The one care-page shell: animal header (passed in above), a slim progress
// rail, a single large stage workspace, and an optional compact strip below.
// Every stage page renders inside this so they look identical.
export function VeterinaryWorkflowLayout({ rail, notice, children, followUp }: { rail: ReactNode; notice?: ReactNode; children: ReactNode; followUp?: ReactNode }) {
  return (
    <div className="vm-workspace">
      <aside className="vm-rail">{rail}</aside>
      <div className="vm-stage-col">
        {notice}
        <section className="vm-workspace-card">{children}</section>
      </div>
      {followUp ? <div className="vm-workspace-foot">{followUp}</div> : null}
    </div>
  );
}

type NoticeTone = "blue" | "green" | "amber" | "red";

export function StageHeader({ step, title, description, action }: { step: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="vm-stage-head">
      <div>
        <span className="vm-stage-chip">{step}</span>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="vm-stage-head-action">{action}</div> : null}
    </header>
  );
}

export function SectionTitle({ icon, tone = "blue", title, description, action }: { icon?: ReactNode; tone?: NoticeTone | "slate"; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="vm-section-title">
      {icon ? <span className={`vm-section-icon tone-${tone}`}>{icon}</span> : null}
      <div className="vm-section-title-copy">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="vm-section-title-action">{action}</div> : null}
    </div>
  );
}

// Compact contextual guidance banner rendered at the top of a stage workspace
// instead of a whole "Next step" card.
export function WorkflowNotice({ tone, icon, title, detail }: { tone: NoticeTone; icon?: ReactNode; title: string; detail?: string }) {
  return (
    <div className={`vm-notice n-${tone}`}>
      {icon ? <span className="vm-notice-icon">{icon}</span> : null}
      <span className="vm-notice-copy">
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
    </div>
  );
}

// Small compact strip below the stage workspace. Optional and never dominates.
export function FollowUpStrip({ appointments, onSchedule }: { appointments: MedicalRecord["appointments"]; onSchedule?: () => void }) {
  const upcoming = appointments.filter((appointment) => appointment.status === "booked").slice(0, 3);
  return (
    <section className="vm-followup">
      <div className="vm-followup-head">
        <span className="vm-followup-title"><IconCalendar size={14} /> Follow-up appointments</span>
        {onSchedule ? <button type="button" className="ghost-button compact-action" onClick={onSchedule}>Schedule follow-up</button> : null}
      </div>
      {upcoming.length === 0 ? (
        <p className="vm-followup-empty">No follow-up appointments scheduled for this animal.</p>
      ) : (
        <ul className="vm-followup-list">
          {upcoming.map((appointment) => (
            <li key={appointment.id} className="vm-followup-item">
              <span className="vm-followup-when"><strong>{fmtDate(appointment.appointmentDate)}</strong><small>{fmtTime(appointment.appointmentDate)}</small></span>
              <span className="vm-followup-purpose">{appointment.purpose}</span>
              <Badge tone="blue">Booked</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Compact care-progress block (used on the follow-up appointment page).
export function CareSnapshot({ record }: { record: MedicalRecord }) {
  const { done, total } = computeCareStatus(record);
  const assessed = record.examinations.length > 0;
  return (
    <div className="vm-caresnap">
      <div className="vm-caresnap-top">
        <strong>{!assessed ? "Not assessed" : total === 0 ? "No treatments required" : done === total ? "All treatments complete" : `${done} of ${total} complete`}</strong>
        <Badge tone={!assessed ? "red" : total === 0 ? "amber" : done === total ? "green" : "blue"}>
          {!assessed ? "Pending" : done === total ? <><IconCheck size={12} /> Done</> : "In progress"}
        </Badge>
      </div>
      {assessed && total > 0 ? <Progress value={(done / total) * 100} labelText={`${done}/${total}`} green={done === total} /> : null}
    </div>
  );
}
