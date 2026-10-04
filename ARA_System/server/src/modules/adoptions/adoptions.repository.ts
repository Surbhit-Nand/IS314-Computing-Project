import { and, asc, desc, eq, inArray, ne, notInArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { adoptionApplications, adoptionStatusHistory, animals } from "../../db/schema.js";

// Adoptions are always shown next to the animal they are for, so the list
// queries join the animal's display fields (name, public id, photo) directly
// instead of making the frontend run a second lookup per row.
const adoptionWithAnimal = {
	id: adoptionApplications.id,
	animalId: adoptionApplications.animalId,
	applicantClerkUserId: adoptionApplications.applicantClerkUserId,
	homeDetails: adoptionApplications.homeDetails,
	familyDetails: adoptionApplications.familyDetails,
	existingPets: adoptionApplications.existingPets,
	animalExperience: adoptionApplications.animalExperience,
	status: adoptionApplications.status,
	reviewNotes: adoptionApplications.reviewNotes,
	createdAt: adoptionApplications.createdAt,
	updatedAt: adoptionApplications.updatedAt,
	animal: {
		id: animals.id,
		publicId: animals.publicId,
		name: animals.name,
		type: animals.type,
		breed: animals.breed,
		photoUrls: animals.photoUrls,
		// Joined so the staff review queue can show medical status up front
		// instead of the reviewer only discovering it by trying to approve an
		// animal the veterinary module hasn't cleared yet.
		medicallyCleared: animals.medicallyCleared,
	},
};

// Everything, newest first, for the staff review queue. The animal is
// soft-deleted rather than hard-deleted (NOT-ACTION foreign key), so the join
// always finds its row.
export async function findAllAdoptionApplications() {
	return db
		.select(adoptionWithAnimal)
		.from(adoptionApplications)
		.leftJoin(animals, eq(adoptionApplications.animalId, animals.id))
		.orderBy(desc(adoptionApplications.createdAt));
}

// Every application belonging to one signed-in applicant, for "My applications".
export async function findAdoptionApplicationsByApplicant(clerkUserId: string) {
	return db
		.select(adoptionWithAnimal)
		.from(adoptionApplications)
		.leftJoin(animals, eq(adoptionApplications.animalId, animals.id))
		.where(eq(adoptionApplications.applicantClerkUserId, clerkUserId))
		.orderBy(desc(adoptionApplications.createdAt));
}

// An application that is still "in play" (not rejected/completed) for one
// animal + applicant, used to stop a user submitting twice for the same pet.
export async function findActiveAdoptionApplication(animalId: string, applicantClerkUserId: string) {
	const [application] = await db
		.select()
		.from(adoptionApplications)
		.where(
			and(
				eq(adoptionApplications.animalId, animalId),
				eq(adoptionApplications.applicantClerkUserId, applicantClerkUserId),
				notInArray(adoptionApplications.status, ["rejected", "completed"]),
			),
		)
		.limit(1);
	return application;
}

// The friendly pre-check behind the race guard: another application for the
// same animal (different from this one) that is already approved or completed.
// The partial unique index in schema.ts is the real guarantee - the two-step
// check here only produces a clearer error message than a raw 23505.
export async function findAdoptionConflict(animalId: string, excludeApplicationId: string) {
	const [application] = await db
		.select()
		.from(adoptionApplications)
		.where(
			and(
				eq(adoptionApplications.animalId, animalId),
				ne(adoptionApplications.id, excludeApplicationId),
				inArray(adoptionApplications.status, ["approved", "completed"]),
			),
		)
		.limit(1);
	return application;
}

export async function findAdoptionApplicationById(id: string) {
	const [application] = await db
		.select(adoptionWithAnimal)
		.from(adoptionApplications)
		.leftJoin(animals, eq(adoptionApplications.animalId, animals.id))
		.where(eq(adoptionApplications.id, id));
	return application;
}

export async function createAdoptionApplication(input: typeof adoptionApplications.$inferInsert) {
	const [application] = await db.insert(adoptionApplications).values(input).returning();
	return application;
}

// Moves an application to a new status, always refreshing updatedAt. The
// transition rules themselves live in the service so routes stay dumb.
// Approval is additionally guarded by the adoption_animal_unique_active
// partial unique index in schema.ts - two applications for the same animal
// can never both be approved/completed no matter how concurrent the requests.
export async function updateAdoptionApplicationStatus(
	id: string,
	input: { status: string; reviewNotes?: string | null },
) {
	const [application] = await db
		.update(adoptionApplications)
		.set({ ...input, updatedAt: new Date() })
		.where(eq(adoptionApplications.id, id))
		.returning();
	return application;
}

export async function createAdoptionStatusHistoryEntry(input: typeof adoptionStatusHistory.$inferInsert) {
	const [entry] = await db.insert(adoptionStatusHistory).values(input).returning();
	return entry;
}

// Oldest first so the adopter stepper and the staff queue render history as
// a top-to-bottom timeline rather than newest-first.
export async function findAdoptionStatusHistoryByApplication(applicationId: string) {
	return db
		.select()
		.from(adoptionStatusHistory)
		.where(eq(adoptionStatusHistory.applicationId, applicationId))
		.orderBy(asc(adoptionStatusHistory.createdAt));
}