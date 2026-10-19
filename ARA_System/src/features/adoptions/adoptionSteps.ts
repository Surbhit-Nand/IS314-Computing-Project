// Pure step-progress logic for the adoption phase rail, kept out of the
// component (the same split as adoptionQueue.ts) so mapping a status + its
// history onto a highlighted stage is unit-tested without React.
//
// The forward path is ADOPTION_STATUS_STEPS (submitted -> under_review ->
// approved -> completed). Rejected and withdrawn are branch/terminal states,
// not steps, so they never highlight a stage of their own: the rail instead
// stops on the furthest stage the history shows was actually visited, which is
// why a rejected application must never paint "Submitted" as its current stage.
import {
  adoptionStatusShortLabel,
  adoptionStepIndex,
  ADOPTION_STATUS_STEPS,
  type AdoptionStatus,
  type AdoptionStatusHistoryEntry,
} from "../../types/adoption";

export type StepperState = {
  // Index into ADOPTION_STATUS_STEPS the rail highlights, or -1 for none.
  reached: number;
  // True when the application ended (rejected/withdrawn) rather than advancing.
  stopped: boolean;
};

export function stepperState(
  status: AdoptionStatus,
  history: AdoptionStatusHistoryEntry[],
): StepperState {
  if (status !== "rejected" && status !== "withdrawn") {
    return { reached: adoptionStepIndex(status), stopped: false };
  }
  let reached = -1;
  for (const entry of history) {
    const index = ADOPTION_STATUS_STEPS.indexOf(entry.status);
    if (index > reached) reached = index;
  }
  return { reached, stopped: reached >= 0 };
}

// One line under the rail: how far along a live application is, or where a
// stopped one got to. "No progress recorded yet" is the neutral read for a
// terminal row whose history is empty (reached = -1), so the rail renders
// unhighlighted rather than implying a stage the applicant never reached.
export function stepperSummary(status: AdoptionStatus, history: AdoptionStatusHistoryEntry[]): string {
  const { reached, stopped } = stepperState(status, history);
  if (reached < 0) return "No progress recorded yet.";
  if (stopped) return `Stopped at ${adoptionStatusShortLabel(ADOPTION_STATUS_STEPS[reached])}`;
  return `Step ${reached + 1} of ${ADOPTION_STATUS_STEPS.length}`;
}
