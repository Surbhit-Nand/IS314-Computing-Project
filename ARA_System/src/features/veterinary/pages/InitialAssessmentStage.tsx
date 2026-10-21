import { useState, type FormEvent } from "react";
import { IconArrowRight, IconCheck, IconInfo, IconMedical, IconNotes, IconStethoscope, IconThermometer } from "../../../components/MedicalIcons";
import type { MedicalRecord } from "../../../types/veterinary";
import { Field } from "../components/VetUi";
import { ExaminationHistory } from "../components/ExaminationHistory";
import { SectionTitle, StageHeader, WorkflowNotice } from "../components/WorkflowShell";
import { TreatmentTile } from "../components/TreatmentUi";
import { DateTimePicker } from "../components/DateTimePicker";
import { comboToIso, fmtDateTime } from "../components/vetHelpers";
import { backendTreatmentName, treatmentOptions } from "../treatmentOptions";

type Props = {
  record: MedicalRecord;
  animal: MedicalRecord["animal"];
  selected: string[];
  setSelected: (value: string[]) => void;
  customTreatment: string;
  setCustomTreatment: (value: string) => void;
  onNext?: () => void;
  onBack: () => void;
  onSave: (input: Record<string, unknown>, requirements: string[]) => Promise<void>;
  onUpdateExamination: (id: string, input: Record<string, unknown>) => Promise<void>;
  onRefresh: () => Promise<void>;
};

export function InitialAssessmentStage({ record, animal, selected, setSelected, customTreatment, setCustomTreatment, onNext, onBack, onSave, onUpdateExamination, onRefresh }: Props) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [examDateTime, setExamDateTime] = useState("");
  const examination = record.examinations[0];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const requirements = [
      ...selected.filter((item) => item !== "Other"),
      ...(selected.includes("Other") && customTreatment ? [customTreatment] : []),
    ].map(backendTreatmentName);
    if (requirements.length === 0) {
      setFormError("Select at least one required care to continue.");
      return;
    }
    if (!examDateTime) {
      setFormError("Choose the assessment date and time to continue.");
      return;
    }
    const [datePart, timePart] = examDateTime.split("T");
    setSaving(true);
    void onSave(
      {
        examinationDate: comboToIso(datePart, timePart),
        weightKg: Number(data.get("weight")) || undefined,
        temperatureC: Number(data.get("temperature")) || undefined,
        estimatedAge: data.get("age"),
        generalCondition: data.get("condition"),
        injuries: data.get("symptoms"),
        observations: data.get("symptoms"),
        diagnosis: data.get("diagnosis"),
        notes: data.get("notes"),
      },
      requirements,
    ).finally(() => setSaving(false));
  }

  if (examination) {
    return (
      <>
        <StageHeader step="Stage 1 of 3" title="Initial Assessment" description="The first veterinary examination is recorded in this animal's medical history." />
        <WorkflowNotice tone="green" icon={<IconCheck size={15} />} title="Assessment complete" detail={fmtDateTime(examination.examinationDate)} />
        <ExaminationHistory examinations={record.examinations} onUpdateExamination={onUpdateExamination} onRefresh={onRefresh} />
        <div className="vm-stage-foot">
          <button type="button" className="ghost-button" onClick={onBack}>Back to dashboard</button>
          {onNext ? <button type="button" className="teal-button" onClick={onNext}>Continue to treatments <IconArrowRight size={13} /></button> : null}
        </div>
      </>
    );
  }

  return (
    <form className="vm-form vm-stage-form" onSubmit={handleSubmit}>
      <StageHeader step="Stage 1 of 3" title="Initial Assessment" description="Assess the animal and select any required care before treatment." />
      <WorkflowNotice tone="blue" icon={<IconInfo size={15} />} title="Next step" detail="Complete the assessment to unlock Required Treatments." />

      <section className="vm-section">
        <SectionTitle icon={<IconStethoscope size={16} />} title="Basic examination" description="Record the core measurements from this visit." />
        <div className="vm-fields vm-fields-4 vm-examination-fields">
          <Field labelText="Assessment date & time" required>
            <DateTimePicker value={examDateTime} onChange={setExamDateTime} required disablePast />
          </Field>
          <Field labelText="Weight (kg)">
            <input className="vm-input" name="weight" type="number" min="0" step="0.1" placeholder="e.g. 4.2" />
          </Field>
          <Field labelText="Temperature (°C)">
            <input className="vm-input" name="temperature" type="number" min="30" max="45" step="0.1" placeholder="e.g. 38.5" />
          </Field>
          <Field labelText="Estimated age">
            <input className="vm-input" name="age" type="text" placeholder="e.g. 2 years" defaultValue={animal.estimatedAge ?? ""} />
          </Field>
        </div>
      </section>

      <section className="vm-section">
        <SectionTitle icon={<IconThermometer size={16} />} tone="green" title="General condition" />
        <div className="vm-fields">
          <Field labelText="General condition" required full>
            <input className="vm-input" name="condition" required placeholder="e.g. Alert, responsive, good body condition" />
          </Field>
        </div>
      </section>

      <section className="vm-section">
        <SectionTitle icon={<IconNotes size={16} />} tone="amber" title="Clinical observations" />
        <div className="vm-fields">
          <Field labelText="Injuries / symptoms" full>
            <textarea className="vm-textarea" name="symptoms" placeholder="Describe any visible injuries or symptoms" />
          </Field>
          <Field labelText="Assessment / diagnosis" full>
            <textarea className="vm-textarea" name="diagnosis" placeholder="Veterinary assessment and diagnosis" />
          </Field>
          <Field labelText="Veterinary notes" full>
            <textarea className="vm-textarea" name="notes" placeholder="Additional notes for the medical history" />
          </Field>
        </div>
      </section>

      <section className="vm-section">
        <SectionTitle icon={<IconMedical size={16} />} tone="red" title="Required care" />
        <div className="vm-tiles">
          {treatmentOptions.map((item) => (
            <TreatmentTile
              key={item}
              treatment={item}
              selected={selected.includes(item)}
              onToggle={() => setSelected(selected.includes(item) ? selected.filter((value) => value !== item) : [...selected, item])}
            />
          ))}
        </div>
        {selected.includes("Other") ? (
          <div style={{ marginTop: 14 }}>
            <Field labelText="Custom treatment name" required>
              <input className="vm-input" value={customTreatment} onChange={(event) => setCustomTreatment(event.target.value)} placeholder="Name of the treatment" />
            </Field>
          </div>
        ) : null}
        {formError ? <p className="form-error" style={{ marginTop: 12 }}>{formError}</p> : null}
      </section>

      <div className="vm-stage-foot">
        <button type="button" className="ghost-button" onClick={onBack}>Back to dashboard</button>
        <button type="submit" className="teal-button" disabled={saving}>{saving ? "Saving…" : "Save assessment & continue"} <IconArrowRight size={13} /></button>
      </div>
    </form>
  );
}
