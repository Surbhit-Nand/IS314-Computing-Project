import { useState, type FormEvent } from "react";
import { IconCalendar, IconCheck } from "../../../components/MedicalIcons";
import type { CarePlanItem, MedicalRecord } from "../../../types/veterinary";
import { Badge, StatusBadge } from "./VetUi";
import { DateTimePicker } from "./DateTimePicker";
import { fmtDateTime } from "./vetHelpers";
import { treatmentDescription, treatmentDisplayName, treatmentIcon, treatmentTone } from "../treatmentOptions";

type Plan = MedicalRecord["carePlan"][number];

// Selectable care option tile with its own coordinated accent colour.
export function TreatmentTile({ treatment, selected, onToggle }: { treatment: string; selected: boolean; onToggle: () => void }) {
  const tone = treatmentTone(treatment);
  return (
    <button
      type="button"
      className={`vm-tile tone-${tone}${selected ? " selected" : ""}`}
      aria-pressed={selected}
      onClick={onToggle}
    >
      <span className="vm-tile-icon">{treatmentIcon(treatment)}</span>
      <span className="vm-tile-text">
        <strong>{treatment}</strong>
        <small>{treatmentDescription(treatment)}</small>
      </span>
      <span className="vm-tile-check">{selected ? <IconCheck size={12} /> : null}</span>
    </button>
  );
}

// The next allowed transition for each open care-plan status, following the
// final workflow: Required -> Scheduled -> In Progress -> Completed, with
// Not Required available at any open stage. `dateField` marks the date the
// transition records on the care plan (scheduled date vs completed date).
const STATUS_TRANSITIONS: Record<string, { action: string; submit: string; next: CarePlanItem["status"]; dateField?: "scheduledDate" | "completedDate" }> = {
  required: { action: "Schedule", submit: "Schedule treatment", next: "scheduled", dateField: "scheduledDate" },
  scheduled: { action: "Start", submit: "Done", next: "in_progress" },
  in_progress: { action: "Complete", submit: "Mark complete", next: "completed" },
};

// One rich treatment row used on the Required Treatments stage. The inline
// edit form spans the full row so the list never needs horizontal scrolling.
export function TreatmentRow({ plan, editing, onEdit, onCancel, onUpdate }: { plan: Plan; editing: boolean; onEdit: () => void; onCancel: () => void; onUpdate: (input: Record<string, unknown>) => Promise<void> }) {
  const display = treatmentDisplayName(plan.requirementType);
  const tone = treatmentTone(display);
  const isComplete = plan.status === "completed" || plan.status === "not_required";
  const transition = STATUS_TRANSITIONS[plan.status];
  const date = plan.completedDate ?? plan.scheduledDate;
  const [editDate, setEditDate] = useState(String(plan.scheduledDate ?? plan.completedDate ?? ""));
  const [editDetails, setEditDetails] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submitUpdate(input: Record<string, unknown>) {
    if (saving) return;
    setSaving(true);
    try { await onUpdate(input); }
    finally { setSaving(false); }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (editDetails) {
      void submitUpdate(Object.fromEntries(["details", "medication", "notes"].map((key) => [key, String(data.get(key) ?? "").trim()])));
      return;
    }
    const input: Record<string, unknown> = { status: transition.next };
    if (transition.dateField) {
      if (!editDate) return;
      input[transition.dateField] = new Date(editDate).toISOString();
    }
    for (const key of ["details", "medication", "notes"] as const) {
      const value = String(data.get(key) ?? "").trim();
      if (value) input[key] = value;
    }
    void submitUpdate(input);
  }

  return (
    <div className={`vm-trow tone-${tone}${editing ? " is-editing" : ""}`}>
      <span className="vm-trow-icon">{treatmentIcon(display)}</span>
      <span className="vm-trow-main">
        <strong>{display}</strong>
        <small>{plan.details ? String(plan.details) : plan.notes ? String(plan.notes) : treatmentDescription(display)}</small>
        {plan.medication ? <small><strong>Medication:</strong> {String(plan.medication)}</small> : null}
        {plan.notes ? <small><strong>Notes:</strong> {String(plan.notes)}</small> : null}
      </span>
      <span className="vm-trow-status"><StatusBadge status={plan.status} /></span>
      <span className="vm-trow-date">
        {date ? <><IconCalendar size={12} /> {fmtDateTime(String(date))}</> : <span className="muted">No date</span>}
      </span>
      <span className="vm-trow-action">
        {isComplete ? (
          <Badge tone="green"><IconCheck size={12} /> Done</Badge>
        ) : editing ? null : (
          <>
          <button type="button" className="mini-button vm-treatment-edit-action" disabled={saving} onClick={() => { setEditDetails(true); onEdit(); }} aria-label={`Edit ${display} details`}>Edit</button>
          <button
            type="button"
            className="mini-button vm-treatment-primary-action"
            disabled={saving}
            onClick={() => {
              if (transition.next === "completed") void submitUpdate({ status: "completed" });
              else { setEditDetails(false); onEdit(); }
            }}
          >{transition?.action ?? "Update"}</button>
          </>
        )}
      </span>
      {editing ? (
        <form
          className="vm-trow-form"
          onSubmit={handleSubmit}
        >
          <fieldset className="vm-treatment-edit-fields" disabled={saving}>
          {editDetails ? (
            <>
              <label>Treatment details<textarea className="vm-textarea" name="details" rows={2} defaultValue={plan.details ?? ""} /></label>
              <label>Medication<input className="vm-input" name="medication" defaultValue={plan.medication ?? ""} /></label>
              <label>Notes<textarea className="vm-textarea" name="notes" rows={2} defaultValue={plan.notes ?? ""} /></label>
              <p className="vm-hint">Saving these details keeps the current treatment status and scheduled date.</p>
            </>
          ) : transition.dateField === "scheduledDate" ? (
            <span className="vm-trow-form-instruction">
              <DateTimePicker value={editDate} onChange={setEditDate} required disablePast />
              <textarea className="vm-textarea" name="details" rows={2} placeholder="What the vet needs to do on the scheduled date, e.g. “Administer the core vaccination” or “Perform a wound dressing change”." required defaultValue={plan.details ?? ""} />
            </span>
          ) : transition.dateField ? (
            <DateTimePicker value={editDate} onChange={setEditDate} required disablePast />
          ) : (
            <span className="vm-trow-form-note">The treatment is being given now. Record what was given and any follow-up notes for this animal.</span>
          )}
          {editDetails || transition.dateField === "scheduledDate" ? null : transition.dateField ? (
            <>
              <input className="vm-input" name="details" placeholder="Treatment details (optional)" defaultValue={plan.details ?? ""} />
              <input className="vm-input" name="medication" placeholder="Medication (optional)" defaultValue={plan.medication ?? ""} />
              <input className="vm-input" name="notes" placeholder="Notes (optional)" defaultValue={plan.notes ?? ""} />
            </>
          ) : (
            <>
              <input className="vm-input" name="medication" placeholder="Vaccine or treatment given, e.g. Nobivac DHPPi" defaultValue={plan.medication ?? ""} />
              <input className="vm-input vm-input-wide" name="notes" placeholder="Follow-up notes, e.g. “Needs a booster in 4 weeks — book a follow-up visit for this animal.”" defaultValue={plan.notes ?? ""} />
            </>
          )}
          <span className="vm-trow-form-actions">
            <button type="button" className="ghost-button compact-action" onClick={onCancel}>Cancel</button>
            {!editDetails && <button type="button" className="ghost-button compact-action" onClick={() => void submitUpdate({ status: "not_required" })}>Not required</button>}
            <button type="submit" className="teal-button compact-primary">{saving ? "Saving…" : editDetails ? "Save changes" : transition?.submit ?? "Save"}</button>
          </span>
          </fieldset>
        </form>
      ) : null}
    </div>
  );
}
