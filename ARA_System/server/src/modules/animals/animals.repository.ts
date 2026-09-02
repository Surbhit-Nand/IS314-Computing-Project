import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "../../db/client.js";
import { animals } from "../../db/schema.js";

// Public listing: every animal not yet adopted and not soft-deleted is
// publicly visible.
//
// NOTE: AGENTS.md's default rule is that an animal can't appear publicly
// until a vet sets medically_cleared - that gate is intentionally NOT
// applied here. The team decided to skip strict medical clearance for this
// prototype (vaccination status is shown as informational only, not a
// listing gate), since the Veterinary module that would set that flag
// hasn't been built yet. Revisit this once that module exists.
export async function findPublicAnimals() {
	return db
		.select()
		.from(animals)
		.where(and(ne(animals.status, "adopted"), isNull(animals.deletedAt)));
}

// Staff listing: every non-deleted animal regardless of clearance/adoption
// status, for the internal "Manage Animal Profiles" page. Soft-deleted
// animals (deletedAt set) are excluded here too - deleting removes them from
// every list, not just the public one.
export async function findAllAnimals() {
	return db.select().from(animals).where(isNull(animals.deletedAt));
}

// Soft delete: marks an animal as removed without touching the row, so
// rescue_reports/adoption_applications/vet_appointments rows that reference
// it by foreign key (and the animal's own history) are never broken or
// lost. See the comment on `deletedAt` in schema.ts for why this isn't a
// hard DELETE.
export async function softDeleteAnimal(id: string) {
	const [animal] = await db
		.update(animals)
		.set({ deletedAt: new Date(), updatedAt: new Date() })
		.where(eq(animals.id, id))
		.returning();
	return animal;
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
