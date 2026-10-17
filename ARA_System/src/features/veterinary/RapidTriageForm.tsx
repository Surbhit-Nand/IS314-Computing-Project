import { useEffect, useState, type FormEvent } from "react";
import { IconCheck } from "../../components/MedicalIcons";
import {
  createRapidTriageAssessment,
  fetchLatestRapidTriageAssessment,
} from "../../services/veterinaryApi";
import type {
  MedicalQueueAnimal,
  RapidTriageAssessment,
  RapidTriageAssessmentInput,
  RapidTriageConditionTrend,
  RapidTriageClinicalStability,
  RapidTriageEmergencyFinding,
  RapidTriageInterventionUrgency,
} from "../../types/veterinary";
import { Badge, Field } from "./components/VetUi";
import { fmtDateTime, label, priorityFor } from "./components/vetHelpers";

type Props = {
  animal: MedicalQueueAnimal;
  getToken: () => Promise<string | null>;
  onAssessmentSaved: (assessment: RapidTriageAssessment) => void;
  onClose: () => void;
};

const STABILITY_OPTIONS: { value: RapidTriageClinicalStability; label: string }[] = [
  { value: "unstable", label: "Unstable" },
  { value: "currently_stable", label: "Currently Stable" },
  { value: "not_yet_assessed", label: "Not Yet Assessed" },
];

const URGENCY_OPTIONS: { value: RapidTriageInterventionUrgency; label: string }[] = [
  { value: "immediate_intervention", label: "Immediate Intervention" },
  { value: "urgent_evaluation", label: "Urgent Evaluation" },
  { value: "stabilized_monitoring", label: "Stabilized / Monitoring" },
];

const TREND_OPTIONS: { value: RapidTriageConditionTrend; label: string }[] = [
  { value: "deteriorating", label: "Deteriorating" },
  { value: "unchanged", label: "Unchanged" },
  { value: "improving", label: "Improving" },
  { value: "unknown", label: "Unknown" },
];

const EMERGENCY_OPTIONS: { value: RapidTriageEmergencyFinding; label: string }[] = [
  { value: "severe_bleeding", label: "Severe Bleeding" },
  { value: "breathing_difficulty", label: "Breathing Difficulty" },
  { value: "circulatory_compromise", label: "Circulatory Compromise" },
  { value: "altered_consciousness", label: "Altered Consciousness" },
  { value: "other_emergency_concern", label: "Other Emergency Concern" },
];

type FormValues = {
  clinicalStability: RapidTriageClinicalStability | "";
  interventionUrgency: RapidTriageInterventionUrgency | "";
  conditionTrend: RapidTriageConditionTrend | "";
  emergencyFindings: RapidTriageEmergencyFinding[];
  notes: string;
};

const EMPTY_FORM: FormValues = {
  clinicalStability: "",
  interventionUrgency: "",
  conditionTrend: "",
  emergencyFindings: [],
  notes: "",
};

function stabilityTone(value: RapidTriageClinicalStability): "red" | "green" | "amber" {
  if (value === "unstable") return "red";
  if (value === "currently_stable") return "green";
  return "amber";
}

function urgencyTone(value: RapidTriageInterventionUrgency): "red" | "amber" | "green" {
  if (value === "immediate_intervention") return "red";
  if (value === "urgent_evaluation") return "amber";
  return "green";
}

export function RapidTriageForm({ animal, getToken, onAssessmentSaved, onClose }: Props) {
  const [latest, setLatest] = useState<RapidTriageAssessment | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [latestError, setLatestError] = useState("");
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [validationError, setValidationError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const priority = priorityFor(animal.veterinaryPriority);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Your session has expired. Sign in again to load triage details.");
        const assessment = await fetchLatestRapidTriageAssessment(token, animal.id);
        if (active) setLatest(assessment);
      } catch (value) {
        if (active) setLatestError(value instanceof Error ? value.message : "Could not load the latest triage assessment.");
      } finally {
        if (active) setLoadingLatest(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [animal.id, getToken]);

  function updateValues(patch: Partial<FormValues>) {
    setValues((current) => ({ ...current, ...patch }));
    setValidationError("");
    setError("");
    setSuccess("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!values.clinicalStability || !values.interventionUrgency || !values.conditionTrend) {
      setValidationError("Choose clinical stability, intervention urgency, and condition trend before saving.");
      return;
    }
    setValidationError("");
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your session has expired. Sign in again before submitting.");
      const input: RapidTriageAssessmentInput = {
        clinicalStability: values.clinicalStability,
        interventionUrgency: values.interventionUrgency,
        conditionTrend: values.conditionTrend,
        emergencyFindings: values.emergencyFindings,
        ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
      };
      const saved = await createRapidTriageAssessment(token, animal.id, input);
      setLatest(saved);
      setLatestError("");
      onAssessmentSaved(saved);
      setValues(EMPTY_FORM);
      setSuccess("Rapid Triage assessment saved. Previous assessments remain in the record.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not save the Rapid Triage assessment. Your entries are still here; try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rapid-triage-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section
        aria-labelledby="rapid-triage-title"
        aria-modal="true"
        className="rapid-triage-dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !saving) onClose();
        }}
        role="dialog"
      >
        <header className="rapid-triage-header">
          <div>
            <p className="vm-eyebrow">Veterinary assessment</p>
            <h2 id="rapid-triage-title">Rapid Triage</h2>
          </div>
          <button type="button" className="rapid-triage-close" aria-label="Close Rapid Triage" disabled={saving} onClick={onClose}>
            Close
          </button>
        </header>

        <div className="rapid-triage-animal">
          <div>
            <span className="rapid-triage-animal-name">{animal.name}</span>
            <span className="rapid-triage-animal-detail">{animal.publicId} · {label(animal.type)}</span>
          </div>
          <div className="rapid-triage-priority">
            <span>Existing priority</span>
            <Badge tone={priority.tone}>{priority.text}</Badge>
          </div>
        </div>

        <section className="rapid-triage-latest" aria-label="Latest triage assessment">
          <div className="rapid-triage-section-heading">
            <h3>Latest assessment</h3>
            {latest ? <time dateTime={latest.assessedAt}>{fmtDateTime(latest.assessedAt)}</time> : null}
          </div>
          {loadingLatest ? (
            <p className="rapid-triage-muted">Loading the latest assessment…</p>
          ) : latest ? (
            <div className="rapid-triage-latest-values">
              <div><span>Clinical stability</span><Badge tone={stabilityTone(latest.clinicalStability)}>{label(latest.clinicalStability)}</Badge></div>
              <div><span>Intervention urgency</span><Badge tone={urgencyTone(latest.interventionUrgency)}>{label(latest.interventionUrgency)}</Badge></div>
              <div><span>Condition trend</span><strong>{label(latest.conditionTrend)}</strong></div>
            </div>
          ) : latestError ? (
            <p className="rapid-triage-muted">Latest assessment could not be confirmed.</p>
          ) : (
            <p className="rapid-triage-muted">Not Yet Assessed</p>
          )}
          {latestError ? <p className="rapid-triage-inline-error" role="alert">{latestError} You can still enter an assessment and retry.</p> : null}
        </section>

        <form className="rapid-triage-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <div className="rapid-triage-form-heading">
            <h3>Record current condition</h3>
            <p>Record your clinical judgment. This will not change the animal’s existing priority.</p>
          </div>

          <div className="rapid-triage-select-grid">
            <Field labelText="Clinical stability" required>
              <select
                aria-invalid={Boolean(validationError && !values.clinicalStability)}
                value={values.clinicalStability}
                onChange={(event) => updateValues({ clinicalStability: event.target.value as FormValues["clinicalStability"] })}
              >
                <option value="">Select stability</option>
                {STABILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field labelText="Intervention urgency" required>
              <select
                aria-invalid={Boolean(validationError && !values.interventionUrgency)}
                value={values.interventionUrgency}
                onChange={(event) => updateValues({ interventionUrgency: event.target.value as FormValues["interventionUrgency"] })}
              >
                <option value="">Select urgency</option>
                {URGENCY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field labelText="Condition trend" required>
              <select
                aria-invalid={Boolean(validationError && !values.conditionTrend)}
                value={values.conditionTrend}
                onChange={(event) => updateValues({ conditionTrend: event.target.value as FormValues["conditionTrend"] })}
              >
                <option value="">Select trend</option>
                {TREND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
          </div>

          <fieldset className="rapid-triage-emergency">
            <legend>Emergency findings <span>(select all that apply)</span></legend>
            <div className="rapid-triage-check-grid">
              {EMERGENCY_OPTIONS.map((option) => (
                <label key={option.value} className="rapid-triage-check">
                  <input
                    type="checkbox"
                    checked={values.emergencyFindings.includes(option.value)}
                    onChange={(event) => updateValues({
                      emergencyFindings: event.target.checked
                        ? [...values.emergencyFindings, option.value]
                        : values.emergencyFindings.filter((finding) => finding !== option.value),
                    })}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <Field labelText="Veterinary notes" hint="Optional · maximum 2,000 characters" full>
            <textarea
              maxLength={2000}
              rows={3}
              value={values.notes}
              onChange={(event) => updateValues({ notes: event.target.value })}
              placeholder="Describe relevant observations or context"
            />
          </Field>

          {validationError ? <p className="rapid-triage-inline-error" role="alert">{validationError}</p> : null}
          {error ? <p className="rapid-triage-inline-error" role="alert">{error}</p> : null}
          {success ? <p className="rapid-triage-success" role="status"><IconCheck size={16} /> {success}</p> : null}

          <footer className="rapid-triage-actions">
            <button type="button" className="ghost-button" disabled={saving} onClick={onClose}>Cancel</button>
            <button type="submit" className="teal-button" disabled={saving}>
              {saving ? "Saving assessment…" : "Save assessment"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
