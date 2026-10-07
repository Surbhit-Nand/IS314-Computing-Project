import type { animals } from "../../db/schema.js";

// The single place that turns an animal profile into the text the embedding
// provider sees. Used by three callers, all of which must produce byte-identical
// text for the same profile or an animal's stored vector would stop matching
// what the searcher asked for:
//
//   - animals.service.ts  (registration and search-relevant edits)
//   - backfillAnimalEmbeddings.ts (existing animals)
//   - animals.service.test.ts
//
// ---------------------------------------------------------------------------
// PRIVACY BOUNDARY - read this before adding a field below.
//
// This function is the only animal data that ever leaves the server. It may
// contain public discovery information and nothing else. Never add:
//
//   - rescueHistory / rescue case details
//   - medical records, veterinary notes, medical clearance notes
//   - adoption applicant information
//   - rescue reporter name, phone, email or Clerk id
//   - any staff account information or Clerk user id
//
// If a field is not something a prospective adopter could read on the public
// listing, it does not belong in an embedding.
// ---------------------------------------------------------------------------

export type AnimalSearchTextSource = Pick<
	typeof animals.$inferSelect,
	| "name"
	| "type"
	| "speciesName"
	| "breed"
	| "estimatedAge"
	| "size"
	| "gender"
	| "colour"
	| "behaviour"
	| "description"
>;

// The profile fields whose change makes a stored embedding stale. `name` is
// here because buildAnimalSearchText() includes it, so a rename has to
// re-embed or the old name stays searchable. Everything NOT listed
// (updatedAt, status, medical/veterinary columns, photoUrls, priority) leaves
// the text untouched, so editing those costs no provider call.
export const ANIMAL_SEARCHABLE_FIELDS = [
	"name",
	"type",
	"speciesName",
	"breed",
	"estimatedAge",
	"size",
	"gender",
	"colour",
	"behaviour",
	"description",
] as const satisfies readonly (keyof AnimalSearchTextSource)[];

export type AnimalSearchableField = (typeof ANIMAL_SEARCHABLE_FIELDS)[number];

// Enum columns are stored snake_case ("extra_large") but read as plain English
// ("Extra large") in a sentence an embedding model can compare against a
// searcher's description.
const TYPE_LABELS: Record<string, string> = {
	dog: "Dog",
	cat: "Cat",
	rabbit: "Rabbit",
	other: "Other pet",
};

const SIZE_LABELS: Record<string, string> = {
	small: "Small",
	medium: "Medium",
	large: "Large",
	extra_large: "Extra large",
};

// A blank string and an empty string are both "staff left this blank", and
// sending "Breed: " to the provider would just add noise to the vector.
function present(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

function labelled(label: string, value: string | null): string | null {
	return value === null ? null : `${label}: ${value}`;
}

// Builds the natural-language description of one animal that gets embedded.
//
// Returns a labelled block rather than a bag of keywords on purpose: the search
// side embeds a sentence ("small dog which is calm around children"), so the
// stored side should read like a short profile sheet in the same register.
export function buildAnimalSearchText(animal: AnimalSearchTextSource): string {
	const lines: string[] = [];

	const add = (line: string | null) => {
		if (line !== null) lines.push(line);
	};

	add(labelled("Name", present(animal.name)));
	// An "other" animal's real species is the name staff typed ("Rabbit");
	// "Other pet" only when none was recorded.
	const species =
		animal.type === "other"
			? (present(animal.speciesName) ?? TYPE_LABELS.other)
			: (TYPE_LABELS[animal.type] ?? present(animal.type));
	add(labelled("Species", species));
	add(labelled("Breed", present(animal.breed)));
	add(labelled("Size", animal.size ? (SIZE_LABELS[animal.size] ?? animal.size) : null));
	add(labelled("Estimated age", present(animal.estimatedAge)));
	add(labelled("Gender", present(animal.gender)));
	add(labelled("Colour", present(animal.colour)));

	const behaviour = present(animal.behaviour);
	if (behaviour) lines.push("", "Behaviour:", behaviour);

	const description = present(animal.description);
	if (description) lines.push("", "Description:", description);

	return lines.join("\n");
}

// True when an update touches at least one field the search text is built from,
// i.e. when the stored embedding has to be regenerated. An absent key means
// "not being changed"; an explicit blank string is a change and does count.
// Takes a whole animal update - photoUrls, status and the medical columns
// included - so callers can hand it whatever staff just edited without
// filtering the non-searchable fields out first.
export function touchesSearchableField(input: Partial<typeof animals.$inferInsert>): boolean {
	return ANIMAL_SEARCHABLE_FIELDS.some((field) => input[field] !== undefined);
}