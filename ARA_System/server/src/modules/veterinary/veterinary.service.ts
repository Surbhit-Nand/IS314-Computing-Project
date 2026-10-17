import { ensureMissingAnimalSearchEmbedding } from "../animals/animals.service.js";
import {
	clearAnimal,
	createAppointment,
	createCarePlanRequirements,
	createExamination,
	createTreatment,
	createTriageAssessment,
	findAppointment,
	findAnimalForTriage,
	findCarePlan,
	findCarePlanTreatment,
	findExamination,
	findLatestTriageAssessment,
	findMedicalRecord,
	listAppointmentAnimals,
	listDashboard,
	listMedicalQueue,
	listMedicalRecords,
	listTriageAssessments,
	updateAnimalVeterinaryStatus,
	updateAppointment,
	updateCarePlan,
	updateExamination as persistExaminationUpdate,
} from "./veterinary.repository.js";
import type { RapidTriageAssessmentInput } from "./veterinary.validation.js";

export const CARE_REQUIREMENTS = [
	"Initial Examination", "Core Vaccination", "Booster", "Deworming", "Flea/Tick Treatment",
	"Sterilization", "Wound Treatment", "Medication Course", "Follow-up Examination", "Final Medical Clearance",
] as const;
export const CARE_STATUSES = ["required", "scheduled", "in_progress", "completed", "not_required"] as const;

// Care-plan items that are workflow milestones, not treatments: completing them
// must not create a row in the treatment history.
const NON_CARE = ["Initial Examination", "Final Medical Clearance"];

export async function getDashboard() { return listDashboard(); }
export async function getQueue() { return listMedicalQueue(); }
export async function getAppointmentAnimals() { return listAppointmentAnimals(); }
export async function getRecords() { return listMedicalRecords(); }
export async function getRecord(animalId: string) { return findMedicalRecord(animalId); }

const triageDependencies = {
	findAnimal: findAnimalForTriage,
	createAssessment: createTriageAssessment,
	findLatestAssessment: findLatestTriageAssessment,
	listAssessments: listTriageAssessments,
};

export async function recordRapidTriageAssessment(
	animalId: string,
	input: RapidTriageAssessmentInput,
	clerkUserId: string,
	dependencies = triageDependencies,
) {
	if (!(await dependencies.findAnimal(animalId))) throw new Error("Animal not found");
	return dependencies.createAssessment({
		animalId,
		clinicalStability: input.clinicalStability,
		interventionUrgency: input.interventionUrgency,
		conditionTrend: input.conditionTrend,
		emergencyFindings: input.emergencyFindings,
		notes: input.notes,
		performedByClerkUserId: clerkUserId,
	});
}

export async function getLatestRapidTriageAssessment(animalId: string, dependencies = triageDependencies) {
	if (!(await dependencies.findAnimal(animalId))) throw new Error("Animal not found");
	return dependencies.findLatestAssessment(animalId);
}

export async function getRapidTriageHistory(animalId: string, dependencies = triageDependencies) {
	if (!(await dependencies.findAnimal(animalId))) throw new Error("Animal not found");
	return dependencies.listAssessments(animalId);
}

export async function recordInitialExamination(animalId: string, input: Omit<Parameters<typeof createExamination>[0], "animalId" | "performedByClerkUserId">, clerkUserId: string) {
	const record = await findMedicalRecord(animalId);
	if (!record) throw new Error("Animal not found");
	if (record.examinations.length > 0) throw new Error("Initial examination has already been completed");
	return createExamination({ ...input, animalId, performedByClerkUserId: clerkUserId });
}

export async function recordFollowUpExamination(animalId: string, input: Omit<Parameters<typeof createExamination>[0], "animalId" | "performedByClerkUserId">, clerkUserId: string) {
	const record = await findMedicalRecord(animalId);
	if (!record) throw new Error("Animal not found");
	if (record.examinations.length === 0) throw new Error("Complete the initial examination first");
	return createExamination({ ...input, animalId, performedByClerkUserId: clerkUserId });
}

// Fields an authorised veterinarian may correct on an existing examination.
// The animal linkage is deliberately NOT updatable so an examination can never
// be moved onto a different animal's record, and the original
// performed-by/veterinarian stamp is left untouched.
export const examinationUpdateFields = ["examinationDate", "weightKg", "temperatureC", "generalCondition", "injuries", "observations", "diagnosis", "notes"] as const;

export async function updateExamination(id: string, input: Record<string, unknown>) {
	const examination = await findExamination(id);
	if (!examination) throw new Error("Examination not found");
	const update: Record<string, unknown> = {};
	for (const field of examinationUpdateFields) {
		if (input[field] !== undefined) update[field] = input[field];
	}
	if (Object.keys(update).length === 0) throw new Error("Provide at least one medical detail to update");
	return persistExaminationUpdate(id, update);
}

export async function createCarePlan(animalId: string, requirements: string[]) {
	const record = await findMedicalRecord(animalId);
	if (!record) throw new Error("Animal not found");
	if (record.examinations.length === 0) throw new Error("Complete the initial examination before creating a care plan");
	if (record.carePlan.length > 0) throw new Error("A care plan already exists for this animal");
	return createCarePlanRequirements([
		{ animalId, requirementType: "Initial Examination", status: "completed", completedDate: new Date().toISOString() },
		...requirements.filter((requirementType) => requirementType !== "Initial Examination").map((requirementType) => ({ animalId, requirementType })),
	]).then(async (plans) => {
		await updateAnimalVeterinaryStatus(animalId, plans.some((plan) => plan.status !== "completed" && plan.status !== "not_required") ? "treatment_required" : "awaiting_medical_clearance");
		return plans;
	});
}

export async function changeCarePlan(id: string, input: Parameters<typeof updateCarePlan>[1], clerkUserId?: string) {
	const plan = await findCarePlan(id);
	if (!plan) throw new Error("Care-plan requirement not found");
	if (input.status === "completed" && !input.completedDate) input.completedDate = new Date().toISOString();
	const updated = await updateCarePlan(id, input);
	if (updated) {
		// A completed treatment is saved to the animal's treatment history
		// automatically, so staff never retype what was already planned. Skip
		// milestones (assessment/clearance) and guard against double-saves.
		if (input.status === "completed" && plan.status !== "completed" && clerkUserId && !NON_CARE.includes(updated.requirementType) && !(await findCarePlanTreatment(id))) {
			await createTreatment({
				animalId: updated.animalId,
				carePlanId: id,
				treatmentDate: updated.completedDate ? updated.completedDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
				details: updated.details?.trim() || `Treatment completed (${updated.requirementType})`,
				medication: updated.medication,
				notes: updated.notes,
				performedByClerkUserId: clerkUserId,
			});
		}
		const record = await findMedicalRecord(updated.animalId);
		const outstanding = record?.carePlan.some((plan) => plan.status !== "completed" && plan.status !== "not_required");
		await updateAnimalVeterinaryStatus(updated.animalId, outstanding ? "treatment_ongoing" : "awaiting_medical_clearance");
	}
	return updated;
}

export async function addTreatment(animalId: string, input: Omit<Parameters<typeof createTreatment>[0], "animalId" | "performedByClerkUserId">, clerkUserId: string) {
	const record = await findMedicalRecord(animalId);
	if (!record) throw new Error("Animal not found");
	return createTreatment({ ...input, animalId, performedByClerkUserId: clerkUserId });
}

export async function bookAppointment(input: Parameters<typeof createAppointment>[0]) {
	const record = await findMedicalRecord(input.animalId);
	if (!record) throw new Error("Animal not found");
	try { return await createAppointment(input); } catch (error) {
		if (error instanceof Error && error.message.includes("vet_appointment_slot_unique")) throw new Error("That appointment slot is already booked", { cause: error });
		throw error;
	}
}

export async function completeAppointment(id: string, input: { visitDetails?: string; treatmentPerformed?: string }, clerkUserId: string) {
	const appointment = await findAppointment(id);
	if (!appointment) throw new Error("Appointment not found");
	const completed = await updateAppointment(id, { ...input, status: "completed", completedAt: new Date(), completedByClerkUserId: clerkUserId });
	if (input.visitDetails || input.treatmentPerformed) {
		await createTreatment({ animalId: appointment.animalId, appointmentId: appointment.id, treatmentDate: appointment.appointmentDate.toISOString().slice(0, 10), details: input.treatmentPerformed ?? "Follow-up visit completed", notes: input.visitDetails, performedByClerkUserId: clerkUserId });
	}
	return completed;
}

const clearanceDependencies = { findMedicalRecord, changeCarePlan, clearAnimal, ensureMissingAnimalSearchEmbedding };

export async function medicallyClear(
	animalId: string,
	clerkUserId: string,
	notes?: string,
	dependencies = clearanceDependencies,
) {
	const record = await dependencies.findMedicalRecord(animalId);
	if (!record) throw new Error("Animal not found");
	if (record.examinations.length === 0) throw new Error("Initial examination is required before medical clearance");
	const outstanding = record.carePlan.filter((plan) => plan.requirementType !== "Final Medical Clearance" && plan.status !== "completed" && plan.status !== "not_required");
	if (outstanding.length > 0) throw new Error(`Complete or mark not required: ${outstanding.map((plan) => plan.requirementType).join(", ")}`);
	const finalClearance = record.carePlan.find((plan) => plan.requirementType === "Final Medical Clearance");
	if (finalClearance) await dependencies.changeCarePlan(finalClearance.id, { status: "completed", completedDate: new Date().toISOString() }, clerkUserId);
	const result = await dependencies.clearAnimal(animalId, clerkUserId, notes);
	if (result.animal) await dependencies.ensureMissingAnimalSearchEmbedding(animalId);
	return result;
}
