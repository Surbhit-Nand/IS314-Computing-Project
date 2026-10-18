import type { ReactNode } from "react";
import { IconCalendar, IconSyringe } from "../../../components/MedicalIcons";
import { fmtDate, label, veterinaryStatusFor } from "./vetHelpers";

type AnimalHeaderProps = {
  name: string;
  type: string;
  breed: string | null;
  gender?: string | null;
  estimatedAge?: string | null;
  vaccinationStatus?: string;
  publicId?: string;
  photoUrl?: string;
  veterinaryStatus: string;
  medicallyCleared: boolean;
  rescueDate?: string | null;
  // Care-snapshot chips, folded into the header so no separate snapshot card
  // is needed on the care pages.
  assessmentDone?: boolean;
  careDone?: number;
  careTotal?: number;
  stageLabel?: string;
  onViewProfile?: () => void;
  viewingProfile?: boolean;
  actions?: ReactNode;
};

// ONE reusable animal header shown on every veterinary record page. Carries
// identity, profile meta and status/care chips.
export function AnimalMedicalHeader({
  name,
  type,
  breed,
  gender,
  estimatedAge,
  vaccinationStatus,
  publicId,
  photoUrl,
  veterinaryStatus,
  medicallyCleared,
  rescueDate,
  assessmentDone,
  careDone,
  careTotal,
  stageLabel,
  actions,
}: AnimalHeaderProps) {
  const status = veterinaryStatusFor({ veterinaryStatus, medicallyCleared });
  const statusChip = status.tone === "green" ? "c-green" : status.tone === "amber" ? "c-amber" : status.tone === "red" ? "c-red" : "c-blue";

  return (
    <header className="vm-animal-head">
      <div className="vm-animal-photo">
        {photoUrl ? <img src={photoUrl} alt="" /> : <span>{name.slice(0, 1)}</span>}
      </div>
      <div className="vm-animal-info">
        <div className="vm-animal-topline">
          <h1>{name}</h1>
          {publicId ? <span className="vm-animal-id">{publicId}</span> : null}
        </div>
        <p className="vm-animal-meta">
          {[label(type), breed, constructAge(gender, estimatedAge)].filter(Boolean).join(" · ") || "—"}
        </p>
        <div className="vm-animal-chips">
          <span className={`vm-chip ${statusChip}`}>{status.text}</span>
          {vaccinationStatus === "vaccinated" ? (
            <span className="vm-chip c-green">
              <IconSyringe size={12} /> Vaccinated
            </span>
          ) : null}
          {assessmentDone === false ? <span className="vm-chip c-amber">Assessment pending</span> : null}
          {assessmentDone && careTotal != null ? (
            careTotal === 0
              ? <span className="vm-chip c-green">No care required</span>
              : <span className={`vm-chip ${careDone === careTotal ? "c-green" : "c-blue"}`}>{careDone}/{careTotal} treatments</span>
          ) : null}
          {rescueDate ? (
            <span className="vm-chip">
              <IconCalendar size={12} /> Rescued {fmtDate(rescueDate)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="vm-animal-actions">
        {stageLabel ? <span className="vm-chip c-blue">{stageLabel}</span> : null}
        {actions}
      </div>
    </header>
  );
}

function constructAge(gender?: string | null, estimatedAge?: string | null): string {
  const parts = [];
  if (gender) parts.push(label(gender));
  if (estimatedAge) parts.push(`~${estimatedAge}`);
  return parts.join(" · ");
}
