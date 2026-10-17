import { and, asc, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
	adoptionApplications,
	animals,
	vetAppointments,
	veterinaryCarePlans,
	veterinaryExaminations,
	veterinaryTreatmentHistory,
} from "../../db/schema.js";

const ownedAnimalFields = {
	id: animals.id,
	publicId: animals.publicId,
	name: animals.name,
	type: animals.type,
	breed: animals.breed,
	estimatedAge: animals.estimatedAge,
	gender: animals.gender,
	colour: animals.colour,
	description: animals.description,
	photoUrls: animals.photoUrls,
	vaccinationStatus: animals.vaccinationStatus,
	size: animals.size,
	medicallyCleared: animals.medicallyCleared,
	medicalClearanceDate: animals.medicalClearanceDate,
};

const ownedAnimalWhere = (animalId: string | undefined, clerkUserId: string) =>
	and(
		eq(adoptionApplications.applicantClerkUserId, clerkUserId),
		inArray(adoptionApplications.status, ["approved", "completed"]),
		isNull(animals.deletedAt),
		...(animalId ? [eq(animals.id, animalId)] : []),
	);

export async function listOwnedAnimals(clerkUserId: string) {
	return db
		.select(ownedAnimalFields)
		.from(adoptionApplications)
		.innerJoin(animals, eq(adoptionApplications.animalId, animals.id))
		.where(ownedAnimalWhere(undefined, clerkUserId))
		.orderBy(desc(adoptionApplications.updatedAt));
}

export async function findOwnedAnimal(animalId: string, clerkUserId: string) {
	const [animal] = await db
		.select(ownedAnimalFields)
		.from(adoptionApplications)
		.innerJoin(animals, eq(adoptionApplications.animalId, animals.id))
		.where(ownedAnimalWhere(animalId, clerkUserId))
		.limit(1);
	return animal;
}

export async function listOwnerMedicalRecords(animalId: string) {
	const [examinations, carePlan, treatments] = await Promise.all([
		db
			.select({
				id: veterinaryExaminations.id,
				examinationDate: veterinaryExaminations.examinationDate,
				generalCondition: veterinaryExaminations.generalCondition,
				injuries: veterinaryExaminations.injuries,
				observations: veterinaryExaminations.observations,
				diagnosis: veterinaryExaminations.diagnosis,
				notes: veterinaryExaminations.notes,
			})
			.from(veterinaryExaminations)
			.where(eq(veterinaryExaminations.animalId, animalId))
			.orderBy(desc(veterinaryExaminations.examinationDate)),
		db
			.select({
				id: veterinaryCarePlans.id,
				requirementType: veterinaryCarePlans.requirementType,
				status: veterinaryCarePlans.status,
				scheduledDate: veterinaryCarePlans.scheduledDate,
				completedDate: veterinaryCarePlans.completedDate,
				details: veterinaryCarePlans.details,
				medication: veterinaryCarePlans.medication,
				createdAt: veterinaryCarePlans.createdAt,
			})
			.from(veterinaryCarePlans)
			.where(eq(veterinaryCarePlans.animalId, animalId))
			.orderBy(desc(veterinaryCarePlans.createdAt)),
		db
			.select({
				id: veterinaryTreatmentHistory.id,
				treatmentDate: veterinaryTreatmentHistory.treatmentDate,
				details: veterinaryTreatmentHistory.details,
				medication: veterinaryTreatmentHistory.medication,
				notes: veterinaryTreatmentHistory.notes,
				createdAt: veterinaryTreatmentHistory.createdAt,
			})
			.from(veterinaryTreatmentHistory)
			.where(eq(veterinaryTreatmentHistory.animalId, animalId))
			.orderBy(desc(veterinaryTreatmentHistory.treatmentDate)),
	]);
	return { examinations, carePlan, treatments };
}

export async function listOwnedAppointments(animalId: string, clerkUserId: string) {
	return db
		.select({
			id: vetAppointments.id,
			animalId: vetAppointments.animalId,
			appointmentDate: vetAppointments.appointmentDate,
			purpose: vetAppointments.purpose,
			notes: vetAppointments.notes,
			status: vetAppointments.status,
			createdAt: vetAppointments.createdAt,
		})
		.from(vetAppointments)
		.where(
			and(
				eq(vetAppointments.animalId, animalId),
				eq(vetAppointments.bookedByClerkUserId, clerkUserId),
			),
		)
		.orderBy(asc(vetAppointments.appointmentDate));
}

export async function listBookedAppointments(from: Date, to: Date) {
	return db
		.select({ appointmentDate: vetAppointments.appointmentDate })
		.from(vetAppointments)
		.where(
			and(
				eq(vetAppointments.status, "booked"),
				gte(vetAppointments.appointmentDate, from),
				lt(vetAppointments.appointmentDate, to),
			),
		);
}

export async function createOwnerAppointment(input: {
	animalId: string;
	bookedByClerkUserId: string;
	appointmentDate: Date;
	purpose: string;
	notes: string | null;
}) {
	const [appointment] = await db
		.insert(vetAppointments)
		.values({ ...input, source: "owner_booked", status: "booked" })
		.returning({
			id: vetAppointments.id,
			animalId: vetAppointments.animalId,
			appointmentDate: vetAppointments.appointmentDate,
			purpose: vetAppointments.purpose,
			notes: vetAppointments.notes,
			status: vetAppointments.status,
			createdAt: vetAppointments.createdAt,
		});
	return appointment;
}

export async function cancelOwnedAppointment(
	appointmentId: string,
	animalId: string,
	clerkUserId: string,
	now: Date,
) {
	const [appointment] = await db
		.update(vetAppointments)
		.set({ status: "cancelled" })
		.where(
			and(
				eq(vetAppointments.id, appointmentId),
				eq(vetAppointments.animalId, animalId),
				eq(vetAppointments.bookedByClerkUserId, clerkUserId),
				eq(vetAppointments.status, "booked"),
				gte(vetAppointments.appointmentDate, now),
			),
		)
		.returning({ id: vetAppointments.id });
	return appointment;
}
