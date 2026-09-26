import type { VeterinaryPriority } from "./animal";

export type VeterinaryDashboard = {
  awaitingExamination: number;
  underTreatment: number;
  upcomingAppointments: number;
  readyForClearance: number;
};

export type MedicalQueueAnimal = {
  id: string;
  publicId: string;
  name: string;
  type: string;
  breed: string | null;
  rescueDate: string | null;
  status: string;
  veterinaryStatus: string;
  medicallyCleared: boolean;
  photoUrls?: string[];
  gender?: string | null;
  vaccinationStatus?: string;
  careTotal?: number;
  careCompleted?: number;
  // Triage priority chosen by staff at registration, used to order the
  // medical queue. Null only for animals registered before this field
  // existed (they sort after prioritised animals).
  veterinaryPriority?: VeterinaryPriority | null;
};

// A veterinary examination (initial or follow-up) recorded on an animal's
// medical record. Mirrors the `veterinary_examinations` table returned by the
// `GET /api/veterinary/animals/:animalId` endpoint.
export type VeterinaryExamination = {
  id: string;
  animalId: string;
  examinationDate: string;
  weightKg: number | null;
  temperatureC: number | null;
  generalCondition: string;
  injuries: string | null;
  observations: string | null;
  diagnosis: string | null;
  notes: string | null;
  performedByClerkUserId: string;
  createdAt: string;
};

// One item of the Veterinary Care Plan — what the animal still needs vs what
// has been done. Kept separate from treatment history on purpose: the care
// plan represents what needs to happen, history records what was performed.
export type CarePlanItem = {
  id: string;
  animalId: string;
  requirementType: string;
  status: "required" | "scheduled" | "in_progress" | "completed" | "not_required" | string;
  scheduledDate: string | null;
  completedDate: string | null;
  details: string | null;
  medication: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

// One entry of the animal's treatment history — a treatment that was actually
// performed (medication given, procedure done, visit recorded).
export type TreatmentRecord = {
  id: string;
  animalId: string;
  carePlanId: string | null;
  appointmentId: string | null;
  treatmentDate: string;
  details: string;
  medication: string | null;
  notes: string | null;
  performedByClerkUserId: string;
  createdAt: string;
};

export type VeterinaryAppointmentRecord = {
  id: string;
  animalId: string;
  appointmentDate: string;
  purpose: string;
  notes: string | null;
  visitDetails: string | null;
  treatmentPerformed: string | null;
  bookedByClerkUserId: string;
  status: string;
  completedAt: string | null;
  completedByClerkUserId: string | null;
  source: string;
  createdAt: string;
};

export type MedicalRecord = {
  animal: MedicalQueueAnimal & {
    estimatedAge: string | null;
    gender: string | null;
    colour: string | null;
    veterinaryStatus: string;
    medicalClearanceDate?: string | null;
    medicalClearanceNotes?: string | null;
  };
  examinations: VeterinaryExamination[];
  carePlan: CarePlanItem[];
  treatments: TreatmentRecord[];
  appointments: VeterinaryAppointmentRecord[];
};

export type VeterinaryAppointment = {
  appointment: { id: string; appointmentDate: string; purpose: string; status: string; notes: string | null; visitDetails: string | null; treatmentPerformed: string | null; bookedByClerkUserId: string };
  animal: MedicalQueueAnimal;
};