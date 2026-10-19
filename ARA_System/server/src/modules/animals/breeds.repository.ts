import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { breeds } from "../../db/schema.js";

export type BreedSpecies = "dog" | "cat";

// Typed species names are matched trimmed, case-insensitive, spaces collapsed:
// "  guinea   PIG " finds "Guinea Pig".
function normalise(value: string): string {
	return value.trim().replace(/\s+/g, " ").toLowerCase();
}

// Which rows belong to a species: dog/cat rows have no species_name; an
// "other" species is identified by its species_name.
function speciesCondition(species: "dog" | "cat" | "other", speciesName: string | null) {
	if (species !== "other") return and(eq(breeds.species, species), isNull(breeds.speciesName));
	return and(eq(breeds.species, "other"), sql`lower(${breeds.speciesName}) = ${normalise(speciesName ?? "")}`);
}

// Breed names for one species, alphabetical, for the Breed dropdown.
export async function findBreedNames(species: BreedSpecies): Promise<string[]> {
	const rows = await db
		.select({ name: breeds.name })
		.from(breeds)
		.where(speciesCondition(species, null))
		.orderBy(asc(breeds.name));
	return rows.map((row) => row.name);
}

// A typed "other" species' breed list, plus the species in the table's own
// spelling ("guinea pig" -> "Guinea Pig"). Null when the species has no list
// (e.g. Snake) - its Breed stays a typed box.
export async function findOtherSpeciesBreeds(
	speciesName: string,
): Promise<{ speciesName: string; breeds: string[] } | null> {
	if (!normalise(speciesName)) return null;
	const rows = await db
		.select({ speciesName: breeds.speciesName, name: breeds.name })
		.from(breeds)
		.where(speciesCondition("other", speciesName))
		.orderBy(asc(breeds.name));
	if (rows.length === 0) return null;
	return { speciesName: rows[0].speciesName ?? speciesName, breeds: rows.map((row) => row.name) };
}

// Case-insensitive lookup, returning the table's own spelling so the stored
// value is always the canonical one ("labrador retriever" -> "Labrador
// Retriever"). Undefined when the breed isn't listed for that species.
export async function findBreedName(
	species: "dog" | "cat" | "other",
	speciesName: string | null,
	name: string,
): Promise<string | undefined> {
	const [row] = await db
		.select({ name: breeds.name })
		.from(breeds)
		.where(and(speciesCondition(species, speciesName), sql`lower(${breeds.name}) = ${normalise(name)}`))
		.limit(1);
	return row?.name;
}

// The table's spelling of a typed "other" species that has a breed list
// ("rabbit" -> "Rabbit"), or undefined when it has none.
export async function findListedSpeciesName(speciesName: string): Promise<string | undefined> {
	if (!normalise(speciesName)) return undefined;
	const [row] = await db
		.select({ speciesName: breeds.speciesName })
		.from(breeds)
		.where(speciesCondition("other", speciesName))
		.limit(1);
	return row?.speciesName ?? undefined;
}
