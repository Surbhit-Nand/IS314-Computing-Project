// The shape of an animal profile as returned by the API. Mirrors the
// `animals` table in server/src/db/schema.ts.
export type AnimalType = "dog" | "cat" | "rabbit" | "other";

export type VaccinationStatus = "not_vaccinated" | "vaccinated";

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
  medicallyCleared: boolean;
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
  rescueDate: string;
  behaviour: string;
  rescueHistory: string;
  photoUrls: string[];
  vaccinationStatus: VaccinationStatus;
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
