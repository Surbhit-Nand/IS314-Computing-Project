import type { MedicalQueueAnimal, MedicalRecord, RapidTriageAssessment, RapidTriageAssessmentInput, VeterinaryAppointment, VeterinaryDashboard } from "../types/veterinary";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

async function request<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/api/veterinary${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  const result = (await response.json()) as T | { error?: string };
  if (!response.ok) throw new Error((result as { error?: string }).error ?? "Veterinary request failed");
  return result as T;
}

export const fetchVeterinaryDashboard = (token: string) => request<VeterinaryDashboard>("/dashboard", token);
export const fetchMedicalQueue = (token: string) => request<MedicalQueueAnimal[]>("/queue", token);
export const fetchMedicalRecords = (token: string) => request<MedicalQueueAnimal[]>("/records", token);
export const fetchAppointmentAnimals = (token: string) => request<MedicalQueueAnimal[]>("/booking-animals", token);
export const fetchMedicalRecord = (token: string, animalId: string) => request<MedicalRecord>(`/animals/${animalId}`, token);
export const fetchVeterinaryAppointments = (token: string) => request<VeterinaryAppointment[]>("/appointments", token);
export const fetchLatestRapidTriageAssessment = (token: string, animalId: string) =>
  request<RapidTriageAssessment | null>(`/animals/${animalId}/triage/latest`, token);
export const createRapidTriageAssessment = (token: string, animalId: string, input: RapidTriageAssessmentInput) =>
  request<RapidTriageAssessment>(`/animals/${animalId}/triage`, token, { method: "POST", body: JSON.stringify(input) });

export function createExamination(token: string, animalId: string, input: Record<string, unknown>) {
  return request(`/animals/${animalId}/examination`, token, { method: "POST", body: JSON.stringify(input) });
}
export function createFollowUpExamination(token: string, animalId: string, input: Record<string, unknown>) {
  return request(`/animals/${animalId}/examinations`, token, { method: "POST", body: JSON.stringify(input) });
}
export function updateExamination(token: string, id: string, input: Record<string, unknown>) {
  return request(`/examinations/${id}`, token, { method: "PATCH", body: JSON.stringify(input) });
}
export function createCarePlan(token: string, animalId: string, requirements: string[]) {
  return request(`/animals/${animalId}/care-plan`, token, { method: "POST", body: JSON.stringify({ requirements }) });
}
export function updateCarePlan(token: string, id: string, input: Record<string, unknown>) {
  return request(`/care-plan/${id}`, token, { method: "PATCH", body: JSON.stringify(input) });
}
export function createTreatment(token: string, animalId: string, input: Record<string, unknown>) {
  return request(`/animals/${animalId}/treatments`, token, { method: "POST", body: JSON.stringify(input) });
}
export function clearAnimal(token: string, animalId: string, notes?: string) {
  return request(`/animals/${animalId}/clearance`, token, { method: "POST", body: JSON.stringify({ notes }) });
}
export function completeAppointment(token: string, id: string, input: Record<string, unknown>) {
  return request(`/appointments/${id}`, token, { method: "PATCH", body: JSON.stringify(input) });
}
export function bookVeterinaryAppointment(token: string, input: Record<string, unknown>) {
  return request("/appointments", token, { method: "POST", body: JSON.stringify(input) });
}
