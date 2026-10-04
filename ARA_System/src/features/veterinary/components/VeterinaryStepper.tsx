import { IconCheck } from "../../../components/MedicalIcons";
import type { WorkflowState, WorkflowStepData } from "./vetHelpers";

type Props = {
  stages: WorkflowStepData[];
  onSelect?: (number: number) => void;
};

// The single vertical progress rail shared by every veterinary care page.
// Deliberately airy: a thin connector line with circular nodes, not boxes.
export function VeterinaryStepper({ stages, onSelect }: Props) {
  return (
    <nav className="vm-stepper" aria-label="Veterinary care workflow">
      <p className="vm-rail-title">Care workflow</p>
      <ol className="vm-step-list">
        {stages.map((stage) => {
          const clickable = Boolean(onSelect) && stage.state !== "locked";
          const body = (
            <>
              <span className="vm-step-node">
                {stage.state === "completed" ? <IconCheck size={14} /> : <span className="vm-step-num">{stage.number}</span>}
              </span>
              <span className="vm-step-body">
                <strong>{stage.title}</strong>
                <em>{statusLabel(stage.state, stage.meta)}</em>
              </span>
            </>
          );
          const className = `vm-step ${stage.state}`;
          if (clickable) {
            return (
              <li key={stage.number} className={className}>
                <button type="button" className="vm-step-hit" onClick={() => onSelect?.(stage.number)}>
                  {body}
                </button>
              </li>
            );
          }
          return (
            <li key={stage.number} className={className}>
              <span className="vm-step-hit">{body}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function statusLabel(state: WorkflowState, meta?: string): string {
  if (meta) return meta;
  switch (state) {
    case "completed":
      return "Completed";
    case "current":
      return "Current stage";
    case "locked":
      return "Locked";
    default:
      return "Up next";
  }
}
