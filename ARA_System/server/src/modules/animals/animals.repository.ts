import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { animals } from "../../db/schema.js";

export async function findPublicAnimals() {
	return db
		.select()
		.from(animals)
		.where(and(eq(animals.medicallyCleared, true), eq(animals.status, "medically_cleared")));
}

export async function createAnimal(input: typeof animals.$inferInsert) {
	const [animal] = await db.insert(animals).values(input).returning();
	return animal;
}
