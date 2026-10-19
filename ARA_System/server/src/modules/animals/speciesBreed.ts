import {
	detectDogOrCatSpecies,
	formatNameText,
	validateSpeciesName,
	validateTypedBreedName,
} from "./animalFieldRules.js";

export type SpeciesResolution =
	| { type: "dog" | "cat" | "other"; speciesName: string | null; breed: string; error?: undefined }
	| { type?: undefined; speciesName?: undefined; breed?: undefined; error: string };

// The breeds-table lookups this needs (breeds.repository.ts in production),
// passed in so it can be unit-tested without a database (speciesBreed.test.ts).
export type BreedLookups = {
	// A listed breed in the table's spelling (case-insensitive), or undefined.
	// speciesName is null for dog/cat.
	findBreedName: (
		species: "dog" | "cat" | "other",
		speciesName: string | null,
		name: string,
	) => Promise<string | undefined>;
	// The table's spelling of a typed species that has a breed list
	// ("rabbit" -> "Rabbit"), or undefined when it has none (e.g. Snake).
	findListedSpeciesName: (speciesName: string) => Promise<string | undefined>;
};

// Checks species + breed together and returns what to store. Used by the
// create and edit routes.
//
// - Type "other" with a typed species of dog(s)/cat(s) is stored as a dog or
//   cat (species name cleared) - dogs and cats are never stored as Other.
// - Dog/cat: species name always null.
// - Other: the species is validated and stored in the breeds table's spelling
//   when it has a breed list ("guinea pig" -> "Guinea Pig"), otherwise
//   capitalised.
// - Breed, for every species: a listed breed is stored in the table's
//   spelling; any other breed (the form's "Other" breed option, a legacy value
//   such as "Russian Blue Mix", or the breed of a species with no list) is
//   accepted only if it passes the typed-breed rules - no digits, junk, "Other"
//   or species words - and is stored capitalised. Typed breeds are never added
//   to the breeds table.
export async function resolveSpeciesAndBreed(
	type: "dog" | "cat" | "other",
	speciesName: string,
	breed: string,
	lookups: BreedLookups,
): Promise<SpeciesResolution> {
	const resolvedType = type === "other" ? (detectDogOrCatSpecies(speciesName) ?? "other") : type;

	let resolvedSpeciesName: string | null = null;
	if (resolvedType === "other") {
		const speciesProblem = validateSpeciesName(speciesName);
		if (speciesProblem) return { error: speciesProblem };
		resolvedSpeciesName = (await lookups.findListedSpeciesName(speciesName)) ?? formatNameText(speciesName);
	}

	const listed = await lookups.findBreedName(resolvedType, resolvedSpeciesName, breed);
	if (listed) return { type: resolvedType, speciesName: resolvedSpeciesName, breed: listed };

	const breedProblem = validateTypedBreedName(breed);
	if (breedProblem) return { error: breedProblem };
	return { type: resolvedType, speciesName: resolvedSpeciesName, breed: formatNameText(breed) };
}
