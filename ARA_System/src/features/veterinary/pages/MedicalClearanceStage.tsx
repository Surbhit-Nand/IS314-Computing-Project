import { useState } from "react";
import { IconCheck, IconClipboard, IconLock, IconShieldCheck } from "../../../components/MedicalIcons";
import type { MedicalRecord } from "../../../types/veterinary";
import { Badge, Field } from "../components/VetUi";
import { SectionTitle, StageHeader, WorkflowNotice } from "../components/WorkflowShell";
import { computeCareStatus, fmtDateTime, fmtDate } from "../components/vetHelpers";
import { treatmentDisplayName } from "../treatmentOptions";

type Props = {
  record: MedicalRecord;
  completed: number;
  total: number;
  ready: boolean;
  onBack: () => void;
  onClear: (notes: string) => Promise<void>;
};

export function MedicalClearanceStage({ record, completed, total, ready, onBack, onClear }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const animal = record.animal;
  const { careItems } = computeCareStatus(record);
  const examination = record.examinations[0];

  const notice = animal.medicallyCleared
    ? { tone: "green" as const, icon: <IconShieldCheck size={15} />, title: "Medically cleared", detail: animal.medicalClearanceDate ? `Cleared on ${fmtDate(animal.medicalClearanceDate)}` : "This animal is now eligible for adoption." }
    : !ready
      ? { tone: "red" as const, icon: <IconLock size={15} />, title: "Clearance locked", detail: total > 0 ? `${total - completed} treatment${total - completed === 1 ? "" : "s"} remaining before clearance.` : "Complete the initial assessment first." }
      : { tone: "green" as const, icon: <IconCheck size={15} />, title: "Ready for medical clearance", detail: "All required treatment has been completed." };

  return (
    <>
      <StageHeader step="Stage 3 of 3" title="Medical Clearance" description="Review the completed care, then confirm this animal is fit for adoption." />
      <WorkflowNotice tone={notice.tone} icon={notice.icon} title={notice.title} detail={notice.detail} />

      {examination ? (
        <section className="vm-section">
          <SectionTitle icon={<IconClipboard size={16} />} title="Assessment summary" description="The recorded initial examination." />
          <div className="vm-detail-grid">
            <div className="vm-detail-item"><span>Examination date</span><strong>{fmtDateTime(examination.examinationDate)}</strong></div>
            <div className="vm-detail-item"><span>General condition</span><strong>{examination.generalCondition}</strong></div>
            <div className="vm-detail-item"><span>Weight</span><strong>{examination.weightKg != null ? `${String(examination.weightKg)} kg` : "Not recorded"}</strong></div>
            <div className="vm-detail-item"><span>Temperature</span><strong>{examination.temperatureC != null ? `${String(examination.temperatureC)} °C` : "Not recorded"}</strong></div>
          </div>
          {examination.diagnosis ? <p className="vm-quote" style={{ marginTop: 14 }}>{String(examination.diagnosis)}</p> : null}
        </section>
      ) : null}

      <section className="vm-section">
        <SectionTitle icon={<IconShieldCheck size={16} />} tone="green" title="Completed treatments" description={careItems.length > 0 ? `${careItems.length} care item${careItems.length === 1 ? "" : "s"} reviewed.` : "No treatments were required for this animal."} />
        {careItems.length === 0 ? (
          <p className="vm-hint">No treatments were required. This animal can be cleared directly.</p>
        ) : (
          <div className="vm-check-list">
            {careItems.map((plan) => (
              <div key={plan.id} className="vm-check-row">
                <span className={`vm-check ${plan.status === "completed" || plan.status === "not_required" ? "ok" : "notyet"}`}>
                  {plan.status === "completed" || plan.status === "not_required" ? <IconCheck size={13} /> : "•"}
                </span>
                <span className="vm-check-copy">
                  <strong>{treatmentDisplayName(plan.requirementType)}</strong>
                  <small>{plan.completedDate ? `Completed ${fmtDateTime(plan.completedDate)}` : "Not completed"}</small>
                </span>
                <Badge tone={plan.status === "completed" || plan.status === "not_required" ? "green" : "red"}>
                  {plan.status === "not_required" ? "Not required" : "Completed"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="vm-section">
        <SectionTitle icon={<IconShieldCheck size={16} />} tone="slate" title="Clearance details" description={animal.medicallyCleared ? "This animal has completed the full veterinary workflow and is eligible for adoption." : "This animal will become eligible for adoption after medical clearance. A staff member will prepare and publish the adoption listing."} />
        {animal.medicallyCleared ? (
          <div className="vm-detail-grid">
            <div className="vm-detail-item"><span>Clearance date</span><strong>{animal.medicalClearanceDate ? fmtDate(animal.medicalClearanceDate) : "Not recorded"}</strong></div>
            <div className="vm-detail-item"><span>Status</span><strong><Badge tone="green">Cleared</Badge></strong></div>
            {animal.medicalClearanceNotes ? (
              <div className="vm-detail-item" style={{ gridColumn: "1 / -1" }}><span>Clearance notes</span><strong>{animal.medicalClearanceNotes}</strong></div>
            ) : null}
          </div>
        ) : confirming ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSaving(true);
              void onClear(notes).finally(() => setSaving(false));
            }}
          >
            <div className="vm-fields">
              <Field labelText="Clearance date" full>
                <input className="vm-input" type="date" defaultValue={new Date().toISOString().slice(0, 10)} readOnly />
              </Field>
              <Field labelText="Clearance notes" full hint="Optional notes recorded with the clearance.">
                <textarea className="vm-textarea" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. Fit and healthy, vaccinations complete" />
              </Field>
            </div>
            <div className="vm-stage-foot">
              <button type="button" className="ghost-button" onClick={() => setConfirming(false)}>Cancel</button>
              <button type="submit" className="teal-button" disabled={saving}><IconShieldCheck size={15} /> {saving ? "Clearing…" : "Confirm medical clearance"}</button>
            </div>
          </form>
        ) : (
          <p className="vm-hint">Use the button below to record the clearance. This confirms the animal is healthy and ready for adoption.</p>
        )}
      </section>

      {!confirming ? (
        <div className="vm-stage-foot">
          <button type="button" className="ghost-button" onClick={onBack}>Back to treatments</button>
          {ready && !animal.medicallyCleared ? (
            <button type="button" className="teal-button" onClick={() => setConfirming(true)}><IconShieldCheck size={15} /> Issue medical clearance</button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
