import { and, asc, desc, eq, exists, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
	adoptionApplications,
	animals,
	vetAppointments,
	veterinaryCarePlans,
	veterinaryExaminations,
	veterinaryTriageAssessments,
	veterinaryTreatmentHistory,
} from "../../db/schema.js";

export async function listDashboard() {
	const [awaitingExamination] = await db
		.select({ count: sql<number>`count(*)` })
		.from(animals)
		.where(and(isNull(animals.deletedAt), eq(animals.medicallyCleared, false), sql`not exists (select 1 from veterinary_examinations examination where examination.animal_id = ${animals.id})`));
	const [underTreatment] = await db
		.select({ count: sql<number>`count(distinct ${veterinaryCarePlans.animalId})` })
		.from(veterinaryCarePlans)
		.innerJoin(animals, eq(veterinaryCarePlans.animalId, animals.id))
		.where(and(inArray(veterinaryCarePlans.status, ["scheduled", "in_progress"]), isNull(animals.deletedAt), eq(animals.medicallyCleared, false)));
	const [upcomingAppointments] = await db
		.select({ count: sql<number>`count(*)` })
		.from(vetAppointments)
		.where(and(gte(vetAppointments.appointmentDate, new Date()), eq(vetAppointments.status, "booked")));
	const [readyForClearance] = await db
		.select({ count: sql<number>`count(distinct ${veterinaryCarePlans.animalId})` })
		.from(veterinaryCarePlans)
		.innerJoin(animals, eq(veterinaryCarePlans.animalId, animals.id))
		.where(and(isNull(animals.deletedAt), eq(animals.medicallyCleared, false), exists(db.select().from(veterinaryExaminations).where(eq(veterinaryExaminations.animalId, animals.id))), sql`not exists (select 1 from veterinary_care_plans outstanding_plan where outstanding_plan.animal_id = ${animals.id} and outstanding_plan.status in ('required', 'scheduled', 'in_progress'))`));
	return {
		awaitingExamination: Number(awaitingExamination?.count ?? 0),
		underTreatment: Number(underTreatment?.count ?? 0),
		upcomingAppointments: Number(upcomingAppointments?.count ?? 0),
		readyForClearance: Number(readyForClearance?.count ?? 0),
	};
}

export async function listMedicalQueue() {
	const careItemsTotal = sql<number>`(
		select count(*)::int
		from veterinary_care_plans plan
		where plan.animal_id = ${animals.id}
			and plan.requirement_type not in ('Initial Examination', 'Final Medical Clearance')
	)`;
	const careItemsDone = sql<number>`(
		select count(*)::int
		from veterinary_care_plans plan
		where plan.animal_id = ${animals.id}
			and plan.requirement_type not in ('Initial Examination', 'Final Medical Clearance')
			and plan.status in ('completed', 'not_required')
	)`;
	// Veterinary priority is chosen by staff when the animal is registered and
	// stored on the animal record itself, so the queue is triaged off that
	// (Critical -> High -> Moderate -> Routine; animals registered before the
	// field existed sort last).
	return db
		.select({
			id: animals.id,
			publicId: animals.publicId,
			name: animals.name,
			type: animals.type,
			breed: animals.breed,
			rescueDate: animals.rescueDate,
			status: animals.status,
			medicallyCleared: animals.medicallyCleared,
			veterinaryStatus: animals.veterinaryStatus,
			photoUrls: animals.photoUrls,
			gender: animals.gender,
			vaccinationStatus: animals.vaccinationStatus,
			veterinaryPriority: animals.veterinaryPriority,
			careTotal: careItemsTotal,
			careCompleted: careItemsDone,
		})
		.from(animals)
		.where(and(isNull(animals.deletedAt), ne(animals.status, "adopted"), eq(animals.medicallyCleared, false)))
		.orderBy(
			// Most urgent priority first (critical -> routine, unset last)...
			sql`case ${animals.veterinaryPriority}
				when 'critical' then 4
				when 'high' then 3
				when 'moderate' then 2
				when 'routine' then 1
				else 0 end desc`,
			// ...then the earliest medical stage, so neglected animals surface.
			sql`case ${animals.veterinaryStatus}
				when 'needs_initial_examination' then 0
				when 'treatment_required' then 1
				when 'treatment_ongoing' then 2
				when 'under_assessment' then 3
				when 'awaiting_medical_clearance' then 4
				when 'medically_cleared' then 5
				else 6 end asc`,
			asc(animals.createdAt),
		);
}

export async function findMedicalRecord(animalId: string) {
	const [animal] = await db.select().from(animals).where(eq(animals.id, animalId));
	const examinations = await db.select().from(veterinaryExaminations).where(eq(veterinaryExaminations.animalId, animalId)).orderBy(desc(veterinaryExaminations.examinationDate));
	const carePlan = await db.select().from(veterinaryCarePlans).where(eq(veterinaryCarePlans.animalId, animalId)).orderBy(asc(veterinaryCarePlans.createdAt));
	const treatments = await db.select().from(veterinaryTreatmentHistory).where(eq(veterinaryTreatmentHistory.animalId, animalId)).orderBy(desc(veterinaryTreatmentHistory.treatmentDate));
	const appointments = await db.select().from(vetAppointments).where(eq(vetAppointments.animalId, animalId)).orderBy(desc(vetAppointments.appointmentDate));
	return animal ? { animal, examinations, carePlan, treatments, appointments } : null;
}

export async function findAnimalForTriage(animalId: string): Promise<{ id: string } | undefined> {
	const [animal] = await db.select({ id: animals.id }).from(animals).where(eq(animals.id, animalId));
	return animal;
}

export async function createTriageAssessment(input: typeof veterinaryTriageAssessments.$inferInsert) {
	const [assessment] = await db.insert(veterinaryTriageAssessments).values(input).returning();
	return assessment;
}

export async function findLatestTriageAssessment(animalId: string) {
	const [assessment] = await db
		.select()
		.from(veterinaryTriageAssessments)
		.where(eq(veterinaryTriageAssessments.animalId, animalId))
		.orderBy(desc(veterinaryTriageAssessments.assessedAt), desc(veterinaryTriageAssessments.id))
		.limit(1);
	return assessment;
}

export async function listTriageAssessments(animalId: string) {
	return db
		.select()
		.from(veterinaryTriageAssessments)
		.where(eq(veterinaryTriageAssessments.animalId, animalId))
		.orderBy(asc(veterinaryTriageAssessments.assessedAt), asc(veterinaryTriageAssessments.id));
}

export async function listAppointmentAnimals() {
	return db
		.select({ id: animals.id, publicId: animals.publicId, name: animals.name, type: animals.type, breed: animals.breed, rescueDate: animals.rescueDate, status: animals.status, medicallyCleared: animals.medicallyCleared })
		.from(animals)
		.where(and(isNull(animals.deletedAt), ne(animals.status, "adopted")))
		.orderBy(asc(animals.name));
}

// Animals that have any medical record activity in the system — at least one
// examination, care-plan item, treatment, or appointment. Deleted/adopted
// animals and animals that have never seen the vet are excluded.
export async function listMedicalRecords() {
	return db
		.select({
			id: animals.id,
			publicId: animals.publicId,
			name: animals.name,
			type: animals.type,
			breed: animals.breed,
			rescueDate: animals.rescueDate,
			status: animals.status,
			veterinaryStatus: animals.veterinaryStatus,
			medicallyCleared: animals.medicallyCleared,
			vaccinationStatus: animals.vaccinationStatus,
			photoUrls: animals.photoUrls,
			gender: animals.gender,
		})
		.from(animals)
		.where(
			and(
				isNull(animals.deletedAt),
				ne(animals.status, "adopted"),
				sql`exists (
					select 1 from veterinary_examinations examination where examination.animal_id = ${animals.id}
					union
					select 1 from veterinary_care_plans plan where plan.animal_id = ${animals.id}
					union
					select 1 from veterinary_treatment_history treatment where treatment.animal_id = ${animals.id}
					union
					select 1 from vet_appointments appointment where appointment.animal_id = ${animals.id}
				)`,
			),
		)
		.orderBy(asc(animals.name));
}

export async function createExamination(input: typeof veterinaryExaminations.$inferInsert) {
	const [examination] = await db.insert(veterinaryExaminations).values(input).returning();
	await db.update(animals).set({ veterinaryStatus: "under_assessment", updatedAt: new Date() }).where(eq(animals.id, input.animalId));
	return examination;
}

export async function findExamination(id: string) {
	const [examination] = await db.select().from(veterinaryExaminations).where(eq(veterinaryExaminations.id, id));
	return examination;
}

// Updates an existing examination in place (never replaces it or moves it to
// a different animal). Only the caller-supplied fields are touched, so the
// animal linkage and the original performed-by stamp are always preserved.
export async function updateExamination(id: string, input: Partial<typeof veterinaryExaminations.$inferInsert>) {
	const [examination] = await db.update(veterinaryExaminations).set(input).where(eq(veterinaryExaminations.id, id)).returning();
	return examination;
}

export async function createCarePlanRequirements(values: Array<typeof veterinaryCarePlans.$inferInsert>) {
	return db.insert(veterinaryCarePlans).values(values).returning();
}

export async function updateCarePlan(id: string, input: Partial<typeof veterinaryCarePlans.$inferInsert>) {
	const [plan] = await db.update(veterinaryCarePlans).set({ ...input, updatedAt: new Date() }).where(eq(veterinaryCarePlans.id, id)).returning();
	return plan;
}

export async function updateAnimalVeterinaryStatus(animalId: string, veterinaryStatus: string) {
	await db.update(animals).set({ veterinaryStatus, updatedAt: new Date() }).where(eq(animals.id, animalId));
}

export async function findCarePlan(id: string) {
	const [plan] = await db.select().from(veterinaryCarePlans).where(eq(veterinaryCarePlans.id, id));
	return plan;
}

export async function findCarePlanTreatment(carePlanId: string) {
	const [treatment] = await db.select().from(veterinaryTreatmentHistory).where(eq(veterinaryTreatmentHistory.carePlanId, carePlanId));
	return treatment;
}

export async function createTreatment(input: typeof veterinaryTreatmentHistory.$inferInsert) {
	const [treatment] = await db.insert(veterinaryTreatmentHistory).values(input).returning();
	return treatment;
}

export async function listAppointments() {
	return db
		.select({
			appointment: vetAppointments,
			animal: animals,
			adopterName: adoptionApplications.fullName,
		})
		.from(vetAppointments)
		.innerJoin(animals, eq(vetAppointments.animalId, animals.id))
		.leftJoin(
			adoptionApplications,
			and(
				eq(adoptionApplications.animalId, animals.id),
				eq(adoptionApplications.applicantClerkUserId, vetAppointments.bookedByClerkUserId),
				inArray(adoptionApplications.status, ["approved", "completed"]),
			),
		)
		.where(and(eq(vetAppointments.status, "booked"), gte(vetAppointments.appointmentDate, new Date())))
		.orderBy(asc(vetAppointments.appointmentDate));
}

export async function createAppointment(input: typeof vetAppointments.$inferInsert) {
	const [appointment] = await db.insert(vetAppointments).values(input).returning();
	return appointment;
}

export async function findAppointment(id: string) {
	const [appointment] = await db.select().from(vetAppointments).where(eq(vetAppointments.id, id));
	return appointment;
}

export async function updateAppointment(id: string, input: Partial<typeof vetAppointments.$inferInsert>) {
	const [appointment] = await db.update(vetAppointments).set(input).where(eq(vetAppointments.id, id)).returning();
	return appointment;
}

export async function clearAnimal(animalId: string, clerkUserId: string, notes?: string) {
	const clearedAt = new Date();
	const [animal] = await db.update(animals).set({ medicallyCleared: true, veterinaryStatus: "medically_cleared", medicalClearanceDate: clearedAt, medicalClearedByClerkUserId: clerkUserId, medicalClearanceNotes: notes, updatedAt: clearedAt }).where(eq(animals.id, animalId)).returning();
	return { animal, clearedBy: clerkUserId, clearedAt };
}
