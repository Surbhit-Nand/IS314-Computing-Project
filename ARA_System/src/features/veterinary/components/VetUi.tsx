import type { ReactNode } from "react";
import { label, toneClass, type Tone } from "./vetHelpers";

export function Badge({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`vm-badge ${toneClass[tone]}`}>{children}</span>;
}

// Shared treatment/appointment/care status pill. Maps a raw backend status to
// one coordinated colour + friendly label so every list reads the same.
const STATUS_META: Record<string, { tone: Tone; text: string }> = {
  completed: { tone: "green", text: "Completed" },
  not_required: { tone: "green", text: "Not required" },
  in_progress: { tone: "amber", text: "In progress" },
  scheduled: { tone: "blue", text: "Scheduled" },
  required: { tone: "red", text: "Required" },
  cancelled: { tone: "slate", text: "Cancelled" },
  booked: { tone: "blue", text: "Booked" },
  pending: { tone: "amber", text: "Pending" },
};

export function StatusBadge({ status, fallbackTone = "slate" }: { status: string; fallbackTone?: Tone }) {
  const meta = STATUS_META[status] ?? { tone: fallbackTone, text: label(status) };
  return <Badge tone={meta.tone}>{meta.text}</Badge>;
}

export function Chip({ tone, children }: { tone?: "blue" | "green" | "amber" | "red"; children: ReactNode }) {
  const klass = tone ? `c-${tone}` : "";
  return <span className={`vm-chip ${klass}`}>{children}</span>;
}

export function Stat({
  icon,
  value,
  labelText,
  detail,
  tone = "blue",
}: {
  icon: ReactNode;
  value: number;
  labelText: string;
  detail: string;
  tone?: "blue" | "green" | "amber" | "red";
}) {
  return (
    <div className={`vm-stat tone-${tone}`}>
      <span className={`vm-stat-icon tone-${tone}`}>{icon}</span>
      <span className="vm-stat-body">
        <span className="vm-stat-value">{value}</span>
        <span className="vm-stat-label">{labelText}</span>
        <span className="vm-stat-detail">{detail}</span>
      </span>
    </div>
  );
}

export function Progress({
  value,
  labelText,
  detail,
  green = false,
}: {
  value: number;
  labelText?: string;
  detail?: string;
  green?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="vm-progress">
      <span className="vm-progress-bar">
        <span className={`vm-progress-fill${green ? " is-green" : ""}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="vm-progress-meta">
        <strong>{labelText ?? `${pct}%`}</strong>
        {detail ? <span>{detail}</span> : null}
      </span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  detail,
  action,
}: {
  icon?: ReactNode;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="vm-empty">
      {icon ? <span className="vm-empty-icon">{icon}</span> : null}
      <h3>{title}</h3>
      {detail ? <p>{detail}</p> : null}
      {action ? <span className="vm-empty-action">{action}</span> : null}
    </div>
  );
}

export function SectionHeading({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="vm-section-head">
      <div>
        <h2>{title}</h2>
        {detail ? <p>{detail}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function Card({ title, detail, action, children, className }: { title?: string; detail?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`vm-card${className ? ` ${className}` : ""}`}>
      {title ? (
        <div className="vm-card-head">
          <div>
            <h3 className="vm-card-title">{title}</h3>
            {detail ? <p className="vm-card-desc">{detail}</p> : null}
          </div>
          {action ? <div>{action}</div> : null}
        </div>
      ) : null}
      <div className="vm-card-body">{children}</div>
    </div>
  );
}

export function SideCard({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`vm-card vm-side-card${className ? ` ${className}` : ""}`}>
      {title ? (
        <div className="vm-card-head">
          <h3 className="vm-card-title">{title}</h3>
          {action ? <div>{action}</div> : null}
        </div>
      ) : null}
      <div className="vm-card-body">{children}</div>
    </div>
  );
}

export function Field({ labelText, required, hint, children, full }: { labelText: string; required?: boolean; hint?: string; children: ReactNode; full?: boolean }) {
  return (
    <label className={`vm-field${full ? " full" : ""}`}>
      <span className="vm-label">
        {labelText}
        {required ? <span className="vm-req"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="vm-hint">{hint}</span> : null}
    </label>
  );
}

export function FactRow({ labelText, children }: { labelText: string; children: ReactNode }) {
  return (
    <div className="vm-fact-row">
      <dt>{labelText}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function AnimalThumb({ photoUrl, name }: { photoUrl?: string; name: string }) {
  if (photoUrl) {
    return <img className="vm-animal-thumb" src={photoUrl} alt="" />;
  }
  return <span className="vm-animal-thumb-ph">{name.slice(0, 1)}</span>;
}