import { apiBaseUrl } from "./apiClient.js";

export type OwnedAnimal = {
  id: string;
  publicId: string;
  name: string;
  type: string;
  breed: string | null;
  estimatedAge: string | null;
  gender: string | null;
  colour: string | null;
  description: string | null;
  photoUrls: string[];
  vaccinationStatus: string;
  size: string | null;
  medicallyCleared: boolean;
  medicalClearanceDate: string | null;
};

export type OwnerAppointment = {
  id: string;
  animalId: string;
  appointmentDate: string;
  purpose: string;
  notes: string | null;
  status: string;
  createdAt: string;
};

export type MyAnimalRecord = {
  animal: OwnedAnimal;
  examinations: Array<{
    id: string;
    examinationDate: string;
    generalCondition: string;
    injuries: string | null;
    observations: string | null;
    diagnosis: string | null;
    notes: string | null;
  }>;
  carePlan: Array<{
    id: string;
    requirementType: string;
    status: string;
    scheduledDate: string | null;
    completedDate: string | null;
    details: string | null;
    medication: string | null;
    createdAt: string;
  }>;
  treatments: Array<{
    id: string;
    treatmentDate: string;
    details: string;
    medication: string | null;
    notes: string | null;
    createdAt: string;
  }>;
  appointments: OwnerAppointment[];
};

export type AppointmentSlot = {
  time: string;
  appointmentDate: string;
  available: boolean;
  status: "available" | "booked" | "past";
};

export type AppointmentAvailability = {
  date: string;
  slots: AppointmentSlot[];
};

async function request<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/api/my-animals${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  const result = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    throw new Error((result as { error?: string }).error ?? "My Animals request failed");
  }
  return result as T;
}

export const fetchMyAnimals = (token: string) => request<OwnedAnimal[]>("/", token);

export const fetchMyAnimalRecord = (token: string, animalId: string) =>
  request<MyAnimalRecord>(`/${animalId}`, token);

export const fetchMyAnimalAvailability = (token: string, animalId: string, date: string) =>
  request<AppointmentAvailability>(
    `/${animalId}/availability?date=${encodeURIComponent(date)}`,
    token,
  );

export const bookMyAnimalAppointment = (
  token: string,
  animalId: string,
  input: { date: string; time: string; reason: string; notes?: string },
) =>
  request<OwnerAppointment>(`/${animalId}/appointments`, token, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const cancelMyAnimalAppointment = (
  token: string,
  animalId: string,
  appointmentId: string,
) =>
  request<{ id: string; status: "cancelled" }>(
    `/${animalId}/appointments/${appointmentId}/cancel`,
    token,
    { method: "PATCH" },
  );
