import { IconArrowRight, IconCheck, IconClipboard, IconMedical, IconShieldCheck } from "../../../components/MedicalIcons";
import type { MedicalRecord } from "../../../types/veterinary";
import { Badge, EmptyState } from "../components/VetUi";
import { SectionTitle, StageHeader, WorkflowNotice } from "../components/WorkflowShell";
import { computeCareStatus, fmtDate } from "../components/vetHelpers";

type Props = {
  record: MedicalRecord;
  onOpenStage: (stage: "assessment" | "treatments" | "clearance") => void;
  onBack: () => void;
};

// The landing view for veterinary care. Where the vet reviews an animal's
// performed treatments and any clearance before diving into a specific
// workflow stage. This is what "View history" opens instead of dropping
// straight onto the current stage.
export function MedicalHistoryScene({ record, onOpenStage, onBack }: Props) {
  const animal = record.animal;
  const assessmentDone = record.examinations.length > 0;
  const { done, total } = computeCareStatus(record);
  const ready = assessmentDone && done === total;

  const notice = animal.medicallyCleared
    ? { tone: "green" as const, icon: <IconShieldCheck size={15} />, title: "Medically cleared", detail: animal.medicalClearanceDate ? `Cleared on ${fmtDate(animal.medicalClearanceDate)} and eligible for adoption.` : "This animal is medically cleared and eligible for adoption." }
    : !assessmentDone
      ? { tone: "red" as const, icon: <IconClipboard size={15} />, title: "Not assessed yet", detail: "No initial assessment has been recorded. Start the assessment to begin this animal's veterinary care." }
      : done === total
        ? { tone: "green" as const, icon: <IconCheck size={15} />, title: "Care complete", detail: "All required treatments are done. The animal is ready for final medical clearance." }
        : { tone: "amber" as const, icon: <IconMedical size={15} />, title: `${done} of ${total} treatments complete`, detail: `${total - done} care item${total - done === 1 ? "" : "s"} remaining before clearance.` };

  return (
    <>
      <StageHeader step="Veterinary care" title="Medical history" description="The treatments performed on this animal and its clearance detail." />

      <WorkflowNotice tone={notice.tone} icon={notice.icon} title={notice.title} detail={notice.detail} />

      {animal.medicallyCleared ? (
        <section className="vm-section">
          <SectionTitle icon={<IconShieldCheck size={16} />} tone="green" title="Medical clearance details" description="The animal is cleared for adoption." />
          <div className="vm-detail-grid">
            <div className="vm-detail-item"><span>Clearance date</span><strong>{animal.medicalClearanceDate ? fmtDate(animal.medicalClearanceDate) : "Not recorded"}</strong></div>
            <div className="vm-detail-item"><span>Status</span><strong><Badge tone="green">Cleared</Badge></strong></div>
            {animal.medicalClearanceNotes ? (
              <div className="vm-detail-item" style={{ gridColumn: "1 / -1" }}><span>Clearance notes</span><strong>{animal.medicalClearanceNotes}</strong></div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="vm-section">
        <SectionTitle icon={<IconClipboard size={16} />} tone="slate" title="Treatment history" description="Treatments that have actually been performed and saved to the record." />
        {record.treatments.length === 0 ? (
          <EmptyState icon={<IconMedical size={20} />} title="No treatments recorded yet" detail="Completed treatments from the plan and follow-up visits are saved here automatically." />
        ) : (
          <div className="vm-history">
            {record.treatments.map((treatment) => (
              <div key={treatment.id} className="vm-summary-line">
                <div className="vm-status-line"><strong>{fmtDate(treatment.treatmentDate)}</strong><Badge tone="green">Recorded</Badge></div>
                <p>{treatment.details}</p>
                {treatment.medication ? <small>Medication: {treatment.medication}</small> : null}
                {treatment.notes ? <small>Notes: {treatment.notes}</small> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="vm-stage-foot">
        <button type="button" className="ghost-button" onClick={onBack}>Back to medical history</button>
        {!assessmentDone || !ready ? (
          <button type="button" className="teal-button" onClick={() => onOpenStage(!assessmentDone ? "assessment" : "treatments")}>
            {!assessmentDone ? "Start initial assessment" : "Continue required treatments"} <IconArrowRight size={13} />
          </button>
        ) : null}
      </div>
    </>
  );
}