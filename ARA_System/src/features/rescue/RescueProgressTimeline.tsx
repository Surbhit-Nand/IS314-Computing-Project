import type { RescueProgressEntry, RescueReportStatus, RescueReport } from "../../types/rescue";
import {
  RESCUE_OUTCOME_LABELS,
  rescueProgressPhaseLabel,
  rescueStatusClass,
} from "../../types/rescue";

type RescueProgressTimelineProps = {
  report: RescueReport;
  // When true (the reporter's My Reports modal), the timeline is simplified to
  // the four major milestones - alert submitted, dispatcher accepted, rescue
  // started, rescue resolved - without the dispatcher's notes, evidence photos,
  // or debrief detail. Staff and dispatchers keep the full detail by default.
  userFacing?: boolean;
  compact?: boolean;
};

const USER_FACING_PHASE_LABEL: Partial<Record<RescueReportStatus, string>> = {
  assigned: "Dispatcher accepted this mission",
  in_progress: "Rescue started",
  resolved: "Rescue resolved",
};

const STATUS_BADGE_LABEL: Record<RescueReportStatus, string> = {
  submitted: "Under Review",
  assigned: "Assigned",
  in_progress: "In Progress",
  awaiting_reassignment: "Needs Dispatcher",
  resolved: "Resolved",
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Shared, read-only Rescue Progress timeline. Rendered inside the expanded
// dispatch case details (available to dispatchers and staff) and inside the
// reporter's My Reports modal. It always starts with the reporter's
// submission, then lists every processed milestone from the report's status
// history - claim, rescue started, and the final outcome - each with the
// dispatcher's notes, images, outcome, and timestamp (unless `userFacing` or
// `compact`, which show only the milestone events and timestamps).
export function RescueProgressTimeline({ report, userFacing = false, compact = false }: RescueProgressTimelineProps) {
  // Reporter-facing: collapse the raw status history down to the milestone
  // moments (first claim, first start, final outcome), skipping reassignment
  // churn so a handed-over mission never repeats an event.
  const milestones = userFacing || compact ? majorMilestones(report.progress) : report.progress;

  return (
    <div className={`rescue-progress-block${compact ? " rescue-progress-compact" : ""}`}>
      <h4 className="rescue-card-subtitle">Rescue progress</h4>
      <ol className="rescue-activity-timeline">
        <li className="rescue-activity-entry">
          <span className={`rescue-activity-marker ${report.status === "submitted" ? "current" : "passed"}`} aria-hidden="true" />
          <div className="rescue-activity-body">
            <div className="rescue-activity-head">
              <strong className="rescue-activity-phase">Alert submitted</strong>
              <span className={`rescue-status-badge submitted`}>Under Review</span>
            </div>
            <p className="rescue-activity-meta">
              by {report.reporterName} · {formatDateTime(report.createdAt)}
            </p>
          </div>
        </li>

        {milestones.map((entry) => (
          <TimelineEntry key={entry.id} entry={entry} userFacing={userFacing} compact={compact} />
        ))}
      </ol>
    </div>
  );
}

function majorMilestones(entries: RescueProgressEntry[]): RescueProgressEntry[] {
  const seen = new Set<RescueReportStatus>();
  return entries.filter((entry) => {
    if (entry.toStatus !== "assigned" && entry.toStatus !== "in_progress" && entry.toStatus !== "resolved") {
      return false;
    }
    if (seen.has(entry.toStatus)) return false;
    seen.add(entry.toStatus);
    return true;
  });
}

function TimelineEntry({
  entry,
  userFacing,
  compact,
}: {
  entry: RescueProgressEntry;
  userFacing: boolean;
  compact: boolean;
}) {
  return (
    <li className="rescue-activity-entry">
      <span className={`rescue-activity-marker ${entry.toStatus === "resolved" ? "final" : ""}`} aria-hidden="true" />
      <div className="rescue-activity-body">
        <div className="rescue-activity-head">
          <strong className="rescue-activity-phase">
            {userFacing
              ? (USER_FACING_PHASE_LABEL[entry.toStatus] ?? rescueProgressPhaseLabel(entry.toStatus, entry.fromStatus))
              : rescueProgressPhaseLabel(entry.toStatus, entry.fromStatus)}
          </strong>
          <span className={`rescue-status-badge ${rescueStatusClass(entry.toStatus)}`}>
            {STATUS_BADGE_LABEL[entry.toStatus]}
          </span>
        </div>

        {!compact && !userFacing && entry.notes && <p className="rescue-activity-note">{entry.notes}</p>}

        {!compact && entry.outcome && (
          <p className="rescue-activity-outcome">
            Outcome: {RESCUE_OUTCOME_LABELS[entry.outcome] ?? entry.outcome}
          </p>
        )}

        {!compact && !userFacing && entry.additionalRemarks && entry.outcome === "other" && (
          <p className="rescue-activity-note">Reason: {entry.additionalRemarks}</p>
        )}

        {!compact && !userFacing && entry.imageUrls.length > 0 && (
          <div className="rescue-activity-photos">
            {entry.imageUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt="Rescue progress photo" />
              </a>
            ))}
          </div>
        )}

        <p className="rescue-activity-meta">
          {entry.dispatcherName ?? "SPCA team"} · {formatDateTime(entry.createdAt)}
        </p>

        {!compact &&
          !userFacing &&
          !entry.notes &&
          !entry.outcome &&
          !entry.additionalRemarks &&
          entry.imageUrls.length === 0 && (
            <p className="rescue-activity-note">No additional details recorded for this update.</p>
          )}
      </div>
    </li>
  );
}