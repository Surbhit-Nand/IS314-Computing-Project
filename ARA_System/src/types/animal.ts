// The shape of an animal profile as returned by the API. Mirrors the
// `animals` table in server/src/db/schema.ts.
export type AnimalType = "dog" | "cat" | "rabbit" | "other";

export type VaccinationStatus = "not_vaccinated" | "vaccinated";

// Weight-based size bucket. These specific ranges (per kg) were given as
// requirements and are dog-centric - most cats and rabbits will fall in
// "small" no matter their actual build, since a 10kg+ cat is unusual. Kept
// as specified rather than redesigned, since the brief gave exact numbers;
// flagging the skew here rather than silently changing them.
export type AnimalSize = "small" | "medium" | "large" | "extra_large";

// Triage priority assigned by staff at registration time. Stored on the
// animal record (not derived from rescue-report urgency, which stays on the
// rescue module). Null only for animals registered before this field existed.
export type VeterinaryPriority = "critical" | "high" | "moderate" | "routine";

// Priority meanings shown to staff under the form select, per the brief.
export const PRIORITY_OPTIONS: { value: VeterinaryPriority; label: string; description: string }[] = [
  { value: "critical", label: "Critical", description: "Life-threatening condition or severe injury requiring immediate veterinary attention" },
  { value: "high", label: "High", description: "Serious medical condition that should be seen quickly" },
  { value: "moderate", label: "Moderate", description: "Stable condition that still requires veterinary assessment" },
  { value: "routine", label: "Routine", description: "No urgent medical concern; normal assessment/follow-up" },
];

const PRIORITY_LABELS: Record<VeterinaryPriority, string> = {
  critical: "Critical",
  high: "High",
  moderate: "Moderate",
  routine: "Routine",
};

export function priorityLabel(priority: VeterinaryPriority): string {
  return PRIORITY_LABELS[priority];
}

const SIZE_INFO: Record<AnimalSize, { label: string; range: string }> = {
  small: { label: "Small", range: "Up to 10 kg" },
  medium: { label: "Medium", range: "10-25 kg" },
  large: { label: "Large", range: "25-45 kg" },
  extra_large: { label: "Extra Large (Giant)", range: "Over 45 kg" },
};

// Dropdown option text, e.g. "Small (Up to 10 kg)".
export function sizeOptionLabel(size: AnimalSize): string {
  const info = SIZE_INFO[size];
  return `${info.label} (${info.range})`;
}

// Profile-page display text, e.g. "Large (25-45 kg)". Handles animals
// registered before this field existed, whose `size` is null.
export function sizeDisplayLabel(size: AnimalSize | null): string {
  if (!size) return "Not recorded";
  const info = SIZE_INFO[size];
  return `${info.label} (${info.range})`;
}

export type AnimalLifecycleStatus =
  | "intake"
  | "in_treatment"
  | "medically_cleared"
  | "adopted"
  | "closed";

export type Animal = {
  id: string;
  publicId: string;
  name: string;
  type: AnimalType;
  breed: string | null;
  estimatedAge: string | null;
  gender: string | null;
  colour: string | null;
  description: string | null;
  rescueDate: string | null;
  behaviour: string | null;
  rescueHistory: string | null;
  photoUrls: string[];
  vaccinationStatus: VaccinationStatus;
  size: AnimalSize | null;
  veterinaryPriority: VeterinaryPriority | null;
  medicallyCleared: boolean;
  veterinaryStatus?: string;
  status: AnimalLifecycleStatus;
  createdAt: string;
  updatedAt: string;
};

// The fields a staff member fills in on the registration/edit form. `name`
// doubles as the animal's display name (the schema requires it even though
// the brief calls the identifier "Animal ID" - that is the separate,
// server-generated `publicId`).
export type AnimalFormInput = {
  name: string;
  type: AnimalType;
  breed: string;
  estimatedAge: string;
  gender: string;
  colour: string;
  description: string;
  // No rescueDate here on purpose - staff never enter it. The server sets it
  // automatically to "today" the moment a new animal is registered (see
  // registerAnimal in animals.service.ts), and it's never touched again on
  // edits, since it's not part of this form at all.
  behaviour: string;
  rescueHistory: string;
  photoUrls: string[];
  vaccinationStatus: VaccinationStatus;
  // "" until staff actively pick one - same required-select pattern as
  // `gender` - validated in validateAnimalForm.ts before submission.
  size: AnimalSize | "";
  // Required on registration; legacy animals may edit-in a value later.
  veterinaryPriority: VeterinaryPriority | "";
};

// Turns "Available for Adoption" / "Adopted" into the simple two-value label
// the brief asks for, derived from the richer lifecycle `status` enum rather
// than storing a second, possibly-conflicting status field.
export function adoptionStatusLabel(status: AnimalLifecycleStatus): "Available for Adoption" | "Adopted" {
  return status === "adopted" ? "Adopted" : "Available for Adoption";
}

export function vaccinationStatusLabel(status: VaccinationStatus): "Not yet vaccinated - open" | "Vaccinated" {
  return status === "vaccinated" ? "Vaccinated" : "Not yet vaccinated - open";
}
