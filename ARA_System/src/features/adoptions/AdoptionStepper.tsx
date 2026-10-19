import {
  adoptionStatusShortLabel,
  ADOPTION_STATUS_STEPS,
  type AdoptionStatus,
  type AdoptionStatusHistoryEntry,
} from "../../types/adoption";
import { stepperState, stepperSummary } from "./adoptionSteps";
import "./AdoptionStepper.css";

type AdoptionStepperProps = {
  status: AdoptionStatus;
  history: AdoptionStatusHistoryEntry[];
};

// Forward-path phase rail: the four ADOPTION_STATUS_STEPS, with the current
// stage emphasized, everything before it marked done, and the stages still to
// come numbered. A rejected or withdrawn application stops the rail on the last
// stage it reached (see stepperState) and paints that marker red instead of
// inventing a stage for a state that is not one.
export function AdoptionStepper({ status, history }: AdoptionStepperProps) {
  const { reached, stopped } = stepperState(status, history);

  return (
    <div className="adoption-stepper-wrap">
      <ol className="adoption-stepper" aria-label="Adoption progress">
        {ADOPTION_STATUS_STEPS.map((stage, index) => (
          <li
            key={stage}
            className={[
              "adoption-stepper-stage",
              index < reached ? "passed" : "",
              index === reached ? "current" : "",
              index === reached && stopped ? "rejected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-current={index === reached ? "step" : undefined}
          >
            {/* A tick reads as "done"; a number says which stage is still to
                come, so the rail answers "what's next" without colour alone. */}
            <span className="adoption-stepper-dot" aria-hidden="true">
              {index < reached ? "✓" : index + 1}
            </span>
            <span className="adoption-stepper-label">{adoptionStatusShortLabel(stage)}</span>
          </li>
        ))}
      </ol>
      <p className="adoption-stepper-summary">{stepperSummary(status, history)}</p>
    </div>
  );
}
