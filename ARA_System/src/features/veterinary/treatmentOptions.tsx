import type { ReactNode } from "react";
import { IconBandage, IconMedical, IconPill, IconPawPrint, IconScissors, IconShieldCheck, IconStethoscope, IconSyringe, IconThermometer } from "../../components/MedicalIcons";

export const treatmentOptions = ["Vaccination", "Booster", "Deworming", "Flea / Tick Treatment", "Desexing", "Medication", "Surgery", "Wound Treatment", "Follow-up Examination", "Final Medical Clearance", "Other"];

// Maps the friendly UI treatment names to the exact strings the backend
// care-plan schema expects. Kept identical to the original module.
export function backendTreatmentName(value: string) {
  return (
    {
      Vaccination: "Core Vaccination",
      "Flea / Tick Treatment": "Flea/Tick Treatment",
      Desexing: "Sterilization",
      Medication: "Medication Course",
      Surgery: "Wound Treatment",
    }[value] ?? value
  );
}

export function treatmentIcon(treatment: string): ReactNode {
  switch (treatmentDisplayName(treatment)) {
    case "Vaccination":
      return <IconSyringe size={17} />;
    case "Booster":
      return <IconSyringe size={17} />;
    case "Deworming":
      return <IconPawPrint size={17} />;
    case "Flea / Tick Treatment":
      return <IconShieldCheck size={17} />;
    case "Desexing":
      return <IconScissors size={17} />;
    case "Medication":
      return <IconPill size={17} />;
    case "Surgery":
      return <IconThermometer size={17} />;
    case "Wound Treatment":
      return <IconBandage size={17} />;
    case "Follow-up Examination":
      return <IconStethoscope size={17} />;
    case "Final Medical Clearance":
      return <IconMedical size={17} />;
    default:
      return <IconMedical size={17} />;
  }
}

export type TreatmentTone = "blue" | "green" | "coral" | "purple" | "violet" | "amber" | "slate";

// Maps a care-plan requirement back to the friendly UI treatment name. The
// backend stores the mapped names ("Core Vaccination") while the UI selects
// the friendlier ones ("Vaccination"), so display code normalises first.
export function treatmentDisplayName(value: string): string {
  return (
    {
      "Core Vaccination": "Vaccination",
      "Flea/Tick Treatment": "Flea / Tick Treatment",
      Sterilization: "Desexing",
      "Medication Course": "Medication",
    }[value] ?? value
  );
}

// Coordinated soft accent per treatment so tiles/rows read as one system.
export function treatmentTone(treatment: string): TreatmentTone {
  switch (treatment) {
    case "Vaccination":
    case "Surgery":
    case "Booster":
    case "Follow-up Examination":
      return "blue";
    case "Deworming":
      return "green";
    case "Flea / Tick Treatment":
      return "coral";
    case "Desexing":
      return "purple";
    case "Medication":
      return "violet";
    case "Wound Treatment":
      return "amber";
    case "Final Medical Clearance":
      return "green";
    default:
      return "slate";
  }
}

export function treatmentDescription(treatment: string): string {
  switch (treatmentDisplayName(treatment)) {
    case "Vaccination":
      return "Core vaccine course";
    case "Booster":
      return "Repeat vaccine dose";
    case "Deworming":
      return "Internal parasite treatment";
    case "Flea / Tick Treatment":
      return "External parasite treatment";
    case "Desexing":
      return "Sterilization procedure";
    case "Medication":
      return "Prescribed medication course";
    case "Surgery":
      return "Surgical procedure";
    case "Wound Treatment":
      return "Wound care and dressing";
    case "Follow-up Examination":
      return "Scheduled re-examination";
    case "Final Medical Clearance":
      return "Final check before adoption";
    default:
      return "Other veterinary care";
  }
}