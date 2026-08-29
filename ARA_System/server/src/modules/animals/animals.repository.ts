import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { animals } from "../../db/schema.js";

// Public listing: only animals a vet has medically cleared and whose status
// is still "medically_cleared" (not yet adopted) are visible to the public.
export async function findPublicAnimals() {
	return db
		.select()
		.from(animals)
		.where(and(eq(animals.medicallyCleared, true), eq(animals.status, "medically_cleared")));
}

// Staff listing: every animal regardless of clearance/adoption status, for
// the internal "Manage Animal Profiles" page.
export async function findAllAnimals() {
	return db.select().from(animals);
}

// Looks up a single animal by its internal id (used to pre-fill the edit form).
export async function findAnimalById(id: string) {
	const [animal] = await db.select().from(animals).where(eq(animals.id, id));
	return animal;
}

// Checks whether a given public-facing Animal ID is already taken, used when
// generating a new unique id.
export async function findAnimalByPublicId(publicId: string) {
	const [animal] = await db.select().from(animals).where(eq(animals.publicId, publicId));
	return animal;
}

export async function createAnimal(input: typeof animals.$inferInsert) {
	const [animal] = await db.insert(animals).values(input).returning();
	return animal;
}

// Updates only the fields provided in `input` and always refreshes updatedAt.
export async function updateAnimal(id: string, input: Partial<typeof animals.$inferInsert>) {
	const [animal] = await db
		.update(animals)
		.set({ ...input, updatedAt: new Date() })
		.where(eq(animals.id, id))
		.returning();
	return animal;
}
