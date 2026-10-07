import type { ReactNode } from "react";
import { PRIORITY_OPTIONS, type VeterinaryPriority } from "../../types/animal";

// Staff set the animal's veterinary priority (triage criticality) on the
// Register/Edit forms so it reaches the vet queue, sorted most urgent first.
//
// Kept self-contained ON PURPOSE - the group hasn't settled who owns priority
// (staff vs vet). To remove it from the forms later: delete this file, its
// one usage in AnimalProfileFields.tsx, `veterinaryPriority` +
// DEFAULT_VETERINARY_PRIORITY in types/animal.ts, the check in
// validateAnimalForm.ts, the two form pages, and the `veterinaryPriority`
// field + default in animals.routes.ts.

type VeterinaryPriorityFieldProps = {
  value: VeterinaryPriority | "";
  onChange: (next: VeterinaryPriority | "") => void;
  label: ReactNode;
  error: ReactNode;
  inputProps: Record<string, unknown>;
};

export function VeterinaryPriorityField({ value, onChange, label, error, inputProps }: VeterinaryPriorityFieldProps) {
  return (
    <label>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as VeterinaryPriority | "")}
        required
        {...inputProps}
      >
        <option value="">Select priority</option>
        {PRIORITY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} - {option.description}
          </option>
        ))}
      </select>
      {error}
    </label>
  );
}
