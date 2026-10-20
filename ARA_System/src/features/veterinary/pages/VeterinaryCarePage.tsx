import { useEffect, useRef, useState } from "react";
import { IconArrowLeft, IconLock } from "../../../components/MedicalIcons";
import type { MedicalRecord } from "../../../types/veterinary";
import type { Animal } from "../../../types/animal";
import { fetchAnimalById, updateAnimal } from "../../../services/animalsApi";
import { clearAnimal, createCarePlan, createExamination, updateCarePlan, updateExamination } from "../../../services/veterinaryApi";
import type { CareScene } from "../vetTypes";
import { AnimalMedicalHeader } from "../components/AnimalMedicalHeader";
import { VeterinaryStepper } from "../components/VeterinaryStepper";
import { VeterinaryWorkflowLayout, WorkflowNotice } from "../components/WorkflowShell";
import { buildWorkflowStages } from "../components/vetHelpers";
import { MedicalHistoryScene } from "./MedicalHistoryScene";
import { InitialAssessmentStage } from "./InitialAssessmentStage";
import { RequiredTreatmentsStage } from "./RequiredTreatmentsStage";
import { MedicalClearanceStage } from "./MedicalClearanceStage";
import { VeterinaryNavbar } from "../components/VeterinaryNavbar";
import type { VeterinaryView } from "../vetTypes";

const NON_CARE = ["Initial Examination", "Final Medical Clearance"];

type Props = {
  onNavigate: (view: VeterinaryView) => void;
  record: MedicalRecord;
  getToken: () => Promise<string | null>;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onViewProfile?: (animal: Animal) => void;
  scene: CareScene;
  workflowEntry?: boolean;
  onChangeScene: (scene: CareScene, replace?: boolean) => void;
};

export function VeterinaryCarePage({ record, getToken, onBack, onRefresh, onViewProfile, scene, onChangeScene, onNavigate, workflowEntry = false }: Props) {
  const animal = record.animal;
  const assessmentDone = record.examinations.length > 0;
  const treatments = record.carePlan.filter((plan) => !NON_CARE.includes(plan.requirementType));
  const completed = treatments.filter((plan) => plan.status === "completed" || plan.status === "not_required").length;
  const ready = assessmentDone && completed === treatments.length;
  const stageNumber = !assessmentDone ? 1 : ready ? 3 : 2;

  const [selected, setSelected] = useState<string[]>([]);
  const [customTreatment, setCustomTreatment] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [viewingProfile, setViewingProfile] = useState(false);
  const navigationVersion = useRef(0);
  useEffect(() => {
    return () => { navigationVersion.current += 1; };
  }, [animal.id, scene]);

  // A restored scene still obeys the live medical workflow gates.
  const lockedScene = !assessmentDone && (scene === "treatments" || scene === "clearance");
  useEffect(() => {
    if (lockedScene) onChangeScene("history", true);
  }, [lockedScene, onChangeScene]);
  const activeScene = lockedScene ? "history" : scene;
  // Queue entries open the next actionable stage; the history list keeps its
  // read-only overview. Do not insert an extra overview between care stages.
  const workflowScene: CareScene = !assessmentDone ? "assessment" : animal.medicallyCleared ? "history" : ready ? "clearance" : "treatments";
  const displayedScene = workflowEntry && activeScene === "history" && !animal.medicallyCleared ? workflowScene : activeScene;
  useEffect(() => {
    if (workflowEntry && scene === "history" && !animal.medicallyCleared) onChangeScene(workflowScene, true);
  }, [workflowEntry, scene, animal.medicallyCleared, workflowScene, onChangeScene]);

  async function save(action: () => Promise<unknown>, nextScene?: CareScene) {
    const version = navigationVersion.current;
    try {
      await action();
      if (version !== navigationVersion.current) return;
      await onRefresh();
      if (version !== navigationVersion.current) return;
      if (nextScene) onChangeScene(nextScene);
      setError("");
      setEditingId(null);
    } catch (value) {
      if (version !== navigationVersion.current) return;
      setError(value instanceof Error ? value.message : "Veterinary update failed.");
    }
  }

  function goToScene(next: CareScene) {
    if (next === "history" || next === "assessment" || assessmentDone) {
      onChangeScene(next);
      setHint("");
    } else {
      setHint(next === "clearance" ? "Medical Clearance is locked until the Initial Assessment has been saved." : "Required Treatments are locked until the Initial Assessment has been saved.");
    }
  }

  async function handleViewProfile() {
    if (!onViewProfile) return;
    const version = navigationVersion.current;
    try {
      setViewingProfile(true);
      const token = await getToken();
      if (!token) return;
      const profile = await fetchAnimalById(token, animal.id);
      if (version === navigationVersion.current) onViewProfile(profile);
    } catch (value) {
      if (version !== navigationVersion.current) return;
      setError(value instanceof Error ? value.message : "The animal profile could not be opened.");
    } finally {
      setViewingProfile(false);
    }
  }

  const stages = buildWorkflowStages({ stage: stageNumber as 1 | 2 | 3, assessmentDone, treatmentsComplete: completed === treatments.length, medicallyCleared: animal.medicallyCleared });

  return (
    <main className="vm-page">
      <VeterinaryNavbar currentView={displayedScene === "history" ? "veterinary-records" : "veterinary-dashboard"} onNavigate={onNavigate} />
      <div className="vm-container">
        <div className="vm-record-top">
          <button type="button" className="ghost-button compact-action" onClick={onBack}><IconArrowLeft size={13} /> Veterinary dashboard</button>
        </div>

        <AnimalMedicalHeader
          name={animal.name}
          type={animal.type}
          breed={animal.breed}
          gender={animal.gender}
          estimatedAge={animal.estimatedAge}
          vaccinationStatus={animal.vaccinationStatus}
          publicId={animal.publicId}
          photoUrl={animal.photoUrls?.[0]}
          veterinaryStatus={animal.veterinaryStatus}
          medicallyCleared={animal.medicallyCleared}
          rescueDate={animal.rescueDate}
          assessmentDone={assessmentDone}
          careDone={completed}
          careTotal={treatments.length}
          stageLabel={`Stage ${stageNumber} of 3`}
          onViewProfile={onViewProfile ? handleViewProfile : undefined}
          viewingProfile={viewingProfile}
        />

        {error ? <p className="form-error">{error}</p> : null}

        <VeterinaryWorkflowLayout
          rail={<VeterinaryStepper stages={stages} onSelect={(number) => goToScene(number === 1 ? "assessment" : number === 2 ? "treatments" : "clearance")} />}
          notice={hint ? <WorkflowNotice tone="red" icon={<IconLock size={15} />} title="Stage locked" detail={hint} /> : undefined}
        >
          {displayedScene === "history" && (
            <MedicalHistoryScene
              record={record}
              onOpenStage={(stage) => goToScene(stage)}
              onBack={onBack}
            />
          )}
          {displayedScene === "assessment" && (
            <InitialAssessmentStage
              record={record}
              animal={animal}
              selected={selected}
              setSelected={setSelected}
              customTreatment={customTreatment}
              setCustomTreatment={setCustomTreatment}
              onNext={() => goToScene("treatments")}
              onBack={onBack}
              onRefresh={onRefresh}
              onUpdateExamination={async (id, input) => {
                const token = await getToken();
                if (!token) return;
                await updateExamination(token, id, input);
              }}
              onSave={(input, requirements) =>
                save(async () => {
                  const token = await getToken();
                  if (!token) throw new Error("Your session has expired. Sign in again before saving the assessment.");
                  const { estimatedAge: age, ...rest } = input;
                  if (typeof age === "string" && age.trim()) await updateAnimal(token, animal.id, { estimatedAge: age.trim() });
                  await createExamination(token, animal.id, rest);
                  await createCarePlan(token, animal.id, requirements);
                }, "treatments")
              }
            />
          )}
          {displayedScene === "treatments" && (
            <RequiredTreatmentsStage
              record={record}
              editingId={editingId}
              setEditingId={setEditingId}
              onBack={() => goToScene("assessment")}
              onNext={() => goToScene("clearance")}
              onUpdate={(id, input) =>
                save(async () => {
                  const token = await getToken();
                  if (token) await updateCarePlan(token, id, input);
                })
              }
            />
          )}
          {displayedScene === "clearance" && (
            <MedicalClearanceStage
              record={record}
              completed={completed}
              total={treatments.length}
              ready={ready}
              onBack={() => goToScene("treatments")}
              onClear={(notes) =>
                save(async () => {
                  const token = await getToken();
                  if (token) await clearAnimal(token, animal.id, notes);
                })
              }
            />
          )}
        </VeterinaryWorkflowLayout>
      </div>
    </main>
  );
}
