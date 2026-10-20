import { IconActivity, IconArrowRight, IconCheck, IconInfo, IconMedical } from "../../../components/MedicalIcons";
import type { MedicalRecord } from "../../../types/veterinary";
import { Badge, EmptyState, Progress } from "../components/VetUi";
import { SectionTitle, StageHeader, WorkflowNotice } from "../components/WorkflowShell";
import { TreatmentRow } from "../components/TreatmentUi";
import { computeCareStatus, fmtDate } from "../components/vetHelpers";

const NON_CARE = ["Initial Examination", "Final Medical Clearance"];

type Props = {
  record: MedicalRecord;
  editingId: string | null;
  setEditingId: (value: string | null) => void;
  onBack: () => void;
  onNext: () => void;
  onUpdate: (id: string, input: Record<string, unknown>) => Promise<void>;
};

export function RequiredTreatmentsStage({ record, editingId, setEditingId, onBack, onNext, onUpdate }: Props) {
  const plans = record.carePlan.filter((plan) => !NON_CARE.includes(plan.requirementType));
  const { done, total } = computeCareStatus(record);

  return (
    <>
      <StageHeader step="Stage 2 of 3" title="Required Treatments" description="Manage all required care before medical clearance." />

      {total === 0 ? (
        <WorkflowNotice tone="amber" icon={<IconInfo size={15} />} title="No treatments were required" detail="Continue to medical clearance to complete the workflow." />
      ) : done === total ? (
        <WorkflowNotice tone="green" icon={<IconCheck size={15} />} title="All required care is complete" detail="Continue to medical clearance to finish the workflow." />
      ) : (
        <WorkflowNotice tone="blue" icon={<IconInfo size={15} />} title={`${total - done} treatment${total - done === 1 ? "" : "s"} remaining`} detail="Complete every required treatment to unlock Medical Clearance." />
      )}

      <section className="vm-section">
        <SectionTitle
          icon={<IconActivity size={16} />}
          title="Treatment progress"
          description={total > 0 ? `${done} of ${total} treatments completed` : "No treatments required for this animal"}
        />
        <Progress
          value={total > 0 ? (done / total) * 100 : 100}
          labelText={total > 0 ? `${done} of ${total} complete` : "No treatments required"}
          detail={total > 0 ? `${total - done} remaining` : undefined}
          green={done === total}
        />
      </section>

      <section className="vm-section">
        <SectionTitle icon={<IconMedical size={16} />} tone="amber" title="Treatment plan" description="Schedule, start, then complete each care item." />
        {plans.length === 0 ? (
          <EmptyState icon={<IconMedical size={20} />} title="No treatments required" detail="No care items were selected for this animal. Continue to medical clearance to complete the workflow." />
        ) : (
          <div className="vm-trows">
            {plans.map((plan) => (
              <TreatmentRow
                key={plan.id}
                plan={plan}
                editing={editingId === plan.id}
                onEdit={() => setEditingId(plan.id)}
                onCancel={() => setEditingId(null)}
                onUpdate={(input) => onUpdate(plan.id, input)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="vm-section">
        <SectionTitle
          icon={<IconMedical size={16} />}
          tone="slate"
          title="Treatment history"
          description="Treatments are saved here automatically when they are marked completed in the treatment plan."
        />

        {record.treatments.length === 0 ? (
          <EmptyState icon={<IconMedical size={20} />} title="No treatments recorded yet" detail="Completed treatments from the plan and follow-up visits are saved here automatically." />
        ) : (
          <div className="vm-history">
            {record.treatments.map((treatment) => (
              <div key={treatment.id} className="vm-summary-line">
                <div className="vm-status-line">
                  <strong>{fmtDate(treatment.treatmentDate)}</strong>
                  <Badge tone="green">Recorded</Badge>
                </div>
                <p>{treatment.details}</p>
                {treatment.medication ? <small>Medication: {treatment.medication}</small> : null}
                {treatment.notes ? <small>Notes: {treatment.notes}</small> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="vm-stage-foot">
        <button type="button" className="ghost-button" onClick={onBack}>Back to initial assessment</button>
        <button type="button" className="teal-button" onClick={onNext}>Continue to medical clearance <IconArrowRight size={13} /></button>
      </div>
    </>
  );
}
