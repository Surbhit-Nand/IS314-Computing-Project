import { useState, type FormEvent } from "react";
import { IconCheck, IconEdit, IconStethoscope } from "../../../components/MedicalIcons";
import type { VeterinaryExamination } from "../../../types/veterinary";
import { comboToIso, fmtDateTime, toDateInputParts } from "./vetHelpers";
import { Badge, Field } from "./VetUi";
import { SectionTitle } from "./WorkflowShell";
import { DateTimePicker } from "./DateTimePicker";

type Props = {
  examinations: VeterinaryExamination[];
  // Updates one examination in place. Expected to throw on failure so the
  // inline form can keep its error visible.
  onUpdateExamination: (id: string, input: Record<string, unknown>) => Promise<void>;
  // Reloads the medical record so the saved changes appear immediately.
  onRefresh: () => Promise<void>;
};

// Shows every examination recorded for an animal (initial + follow-ups).
// Each entry can be opened for inline editing via "Edit medical details" -
// the vet updates the existing `veterinary_examinations` row rather than
// creating a duplicate record.
export function ExaminationHistory({ examinations, onUpdateExamination, onRefresh }: Props) {
  if (examinations.length === 0) return null;
  // The initial assessment is the first examination recorded for the animal.
  // `createdAt` gives the reliable order - examinationDate can be back-dated.
  const initialId = [...examinations].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0]?.id;
  return (
    <section className="vm-section">
      <SectionTitle icon={<IconStethoscope size={16} />} title="Medical examinations" description="Every assessment and follow-up examination recorded for this animal." />
      <div className="vm-exams">
        {examinations.map((examination) => (
          <ExaminationItem
            key={examination.id}
            examination={examination}
            isInitial={examination.id === initialId}
            onUpdate={onUpdateExamination}
            onRefresh={onRefresh}
          />
        ))}
      </div>
    </section>
  );
}

function ExaminationItem({
  examination,
  isInitial,
  onUpdate,
  onRefresh,
}: {
  examination: VeterinaryExamination;
  isInitial: boolean;
  onUpdate: Props["onUpdateExamination"];
  onRefresh: Props["onRefresh"];
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const initialParts = toDateInputParts(examination.examinationDate);
  const [examDateTime, setExamDateTime] = useState(initialParts.date ? `${initialParts.date}T${initialParts.time}` : "");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!examDateTime) {
      setError("Choose the examination date and time.");
      return;
    }
    const data = new FormData(event.currentTarget);
    const weight = String(data.get("weight") ?? "").trim();
    const temperature = String(data.get("temperature") ?? "").trim();
    const [datePart, timePart] = examDateTime.split("T");
    const input: Record<string, unknown> = {
      examinationDate: comboToIso(datePart, timePart),
      generalCondition: data.get("generalCondition"),
      injuries: String(data.get("injuries") ?? "").trim(),
      observations: String(data.get("observations") ?? "").trim(),
      diagnosis: String(data.get("diagnosis") ?? "").trim(),
      notes: String(data.get("notes") ?? "").trim(),
    };
    if (weight) {
      const parsed = Number(weight);
      if (!Number.isNaN(parsed)) input.weightKg = parsed;
    }
    if (temperature) {
      const parsed = Number(temperature);
      if (!Number.isNaN(parsed)) input.temperatureC = parsed;
    }
    setSaving(true);
    setError("");
    try {
      await onUpdate(examination.id, input);
      await onRefresh();
      setEditing(false);
    } catch (value) {
      setError(value instanceof Error ? value.message : "The changes could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className={`vm-exam${editing ? " editing" : ""}`}>
      <div className="vm-exam-head">
        <span className="vm-exam-title">
          <strong>{fmtDateTime(examination.examinationDate)}</strong>
          <Badge tone={isInitial ? "blue" : "green"}>{isInitial ? "Initial assessment" : "Follow-up examination"}</Badge>
        </span>
        {!editing ? (
          <button type="button" className="ghost-button compact-action" onClick={() => setEditing(true)}>
            <IconEdit size={13} /> Edit medical details
          </button>
        ) : null}
      </div>

      <div className="vm-detail-grid">
        <div className="vm-detail-item"><span>Weight</span><strong>{examination.weightKg != null ? `${String(examination.weightKg)} kg` : "Not recorded"}</strong></div>
        <div className="vm-detail-item"><span>Temperature</span><strong>{examination.temperatureC != null ? `${String(examination.temperatureC)} °C` : "Not recorded"}</strong></div>
        <div className="vm-detail-item" style={{ gridColumn: "1 / -1" }}><span>General condition</span><strong>{examination.generalCondition}</strong></div>
      </div>

      {examination.injuries ? <DetailLine label="Injuries / symptoms" value={examination.injuries} /> : null}
      {examination.observations ? <DetailLine label="Observations" value={examination.observations} /> : null}
      {examination.diagnosis ? <p className="vm-quote">{examination.diagnosis}</p> : null}
      {examination.notes ? <DetailLine label="Veterinary notes" value={examination.notes} /> : null}

      {editing ? (
        <form className="vm-exam-form" onSubmit={handleSubmit}>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="vm-fields vm-fields-4">
            <Field labelText="Examination date & time" required>
              <DateTimePicker value={examDateTime} onChange={setExamDateTime} required disablePast />
            </Field>
            <Field labelText="Weight (kg)">
              <input className="vm-input" name="weight" type="number" min="0" step="0.1" defaultValue={examination.weightKg ?? ""} />
            </Field>
            <Field labelText="Temperature (°C)">
              <input className="vm-input" name="temperature" type="number" min="30" max="45" step="0.1" defaultValue={examination.temperatureC ?? ""} />
            </Field>
            <Field labelText="General condition" required>
              <input className="vm-input" name="generalCondition" defaultValue={examination.generalCondition} required />
            </Field>
          </div>
          <div className="vm-fields">
            <Field labelText="Injuries / symptoms" full>
              <textarea className="vm-textarea" name="injuries" defaultValue={examination.injuries ?? ""} placeholder="Describe any visible injuries or symptoms" />
            </Field>
            <Field labelText="Observations" full>
              <textarea className="vm-textarea" name="observations" defaultValue={examination.observations ?? ""} placeholder="Clinical observations from this examination" />
            </Field>
            <Field labelText="Assessment / diagnosis" full>
              <textarea className="vm-textarea" name="diagnosis" defaultValue={examination.diagnosis ?? ""} placeholder="Veterinary assessment and diagnosis" />
            </Field>
            <Field labelText="Veterinary notes" full>
              <textarea className="vm-textarea" name="notes" defaultValue={examination.notes ?? ""} placeholder="Additional notes for the medical history" />
            </Field>
          </div>
          <div className="vm-exam-form-actions">
            <button type="button" className="ghost-button" onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" className="teal-button" disabled={saving}><IconCheck size={15} /> {saving ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

function DetailLine({ label: labelText, value }: { label: string; value: string }) {
  return (
    <div className="vm-exam-line">
      <span>{labelText}</span>
      <strong>{value}</strong>
    </div>
  );
}
