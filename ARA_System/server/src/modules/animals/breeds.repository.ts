import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { breeds } from "../../db/schema.js";

export type BreedSpecies = "dog" | "cat";

// Breed names for one species, alphabetical, for the Breed dropdown.
export async function findBreedNames(species: BreedSpecies): Promise<string[]> {
	const rows = await db
		.select({ name: breeds.name })
		.from(breeds)
		.where(eq(breeds.species, species))
		.orderBy(asc(breeds.name));
	return rows.map((row) => row.name);
}

// Case-insensitive lookup, returning the table's own spelling so the stored
// value is always the canonical one ("labrador retriever" -> "Labrador
// Retriever"). Undefined when the breed isn't in the table.
export async function findBreedName(species: BreedSpecies, name: string): Promise<string | undefined> {
	const [row] = await db
		.select({ name: breeds.name })
		.from(breeds)
		.where(and(eq(breeds.species, species), sql`lower(${breeds.name}) = ${name.trim().toLowerCase()}`))
		.limit(1);
	return row?.name;
}
