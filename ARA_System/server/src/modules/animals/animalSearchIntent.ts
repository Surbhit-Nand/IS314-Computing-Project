import type { animals } from "../../db/schema.js";

type AnimalRow = typeof animals.$inferSelect;

export type AnimalSearchFilters = {
	type?: Exclude<AnimalRow["type"], "other">;
	size?: NonNullable<AnimalRow["size"]>;
	// Gender is free text in the database; these are the registration form values.
	gender?: "Male" | "Female";
	vaccinationStatus?: AnimalRow["vaccinationStatus"];
};

export type AnimalSearchIntent = AnimalSearchFilters & { semanticQuery: string };

function unambiguous<T extends string>(values: T[]): T | undefined {
	const unique = new Set(values);
	return unique.size === 1 ? values[0] : undefined;
}

// Only the desired animal's attributes belong in hard filters. Compatibility
// clauses describe its companions, and remain part of the semantic query.
function constraintText(query: string): string {
	const companion = "(?:(?:other|small|medium|large|extra[ -]+large|male|female|young|older|elderly|all|my|our|the|a|an|calm|gentle|friendly)\\s+)*(?:dogs?|cats?|rabbits?|children|kids|pets?|animals?|families|family)";
	const companions = `${companion}(?:\\s*(?:,\\s*(?:and\\s+)?|and\\s+|or\\s+|&\\s*)${companion})*`;
	// Consume only the companions (including lists), not the rest of the query:
	// "dog good with cats and vaccinated" still explicitly requests vaccination.
	const compatibility = new RegExp(`\\b(?:with|around)\\s+${companions}\\b`, "g");
	return query.toLowerCase()
		.replace(/\b(?:dogs?|cats?|rabbits?)[ -]friendly\b(?!\s+(?:with|around)\b)/g, " ")
		.replace(compatibility, " ")
		.replace(/\b(?:small|medium|large|extra[ -]large)\s+(?:children|kids|family|families|home|house|apartment|garden|yard)\b/g, " ");
}

// This is deliberately a small vocabulary parser, not a natural-language
// interpreter. Negated/uncertain mentions and conflicting values must not
// silently become a positive constraint. Vaccination has its own explicit
// negative enum, handled by the combined token below.
function isQualifiedMention(text: string, index: number): boolean {
	return /\b(?:not|no|without|except|excluding|maybe|perhaps|possibly|rather than|anything but|isn't|isn’t)(?:\s+(?:a|an|the|very|yet|fully|small|medium|large|male|female|calm|quiet|playful|energetic|friendly|gentle))*[ -]*$/.test(text.slice(0, index));
}

/** Receives the service's normalized query; never removes text from embedding input. */
export function parseAnimalSearchIntent(semanticQuery: string): AnimalSearchIntent {
	const text = constraintText(semanticQuery);
	const types: NonNullable<AnimalSearchFilters["type"]>[] = [];
	const sizes: NonNullable<AnimalSearchFilters["size"]>[] = [];
	const genders: NonNullable<AnimalSearchFilters["gender"]>[] = [];
	const vaccinations: NonNullable<AnimalSearchFilters["vaccinationStatus"]>[] = [];
	const uncertain = new Set<keyof AnimalSearchFilters>();

	// Longest phrases first: "extra large" must never also count as "large",
	// and "not vaccinated" must never also count as "vaccinated".
	const tokens = /\b(?:not[ -]+vaccinated|extra[ -]+large|dogs?|cats?|rabbits?|small|medium|large|male|female|vaccinated)\b/g;
	for (const match of text.matchAll(tokens)) {
		const token = match[0].replace(/-/g, " ").replace(/\s+/g, " ");
		let field: keyof AnimalSearchFilters;
		if (/^(dog|cat|rabbit)s?$/.test(token)) {
			field = "type";
			types.push(token.replace(/s$/, "") as NonNullable<AnimalSearchFilters["type"]>);
		} else if (["small", "medium", "large", "extra large"].includes(token)) {
			field = "size";
			sizes.push(token.replace(" ", "_") as NonNullable<AnimalSearchFilters["size"]>);
		} else if (token === "male" || token === "female") {
			field = "gender";
			genders.push(token === "male" ? "Male" : "Female");
		} else {
			field = "vaccinationStatus";
			vaccinations.push(token === "not vaccinated" ? "not_vaccinated" : "vaccinated");
		}
		if (isQualifiedMention(text, match.index)) uncertain.add(field);
	}

	return {
		type: uncertain.has("type") ? undefined : unambiguous(types),
		size: uncertain.has("size") ? undefined : unambiguous(sizes),
		gender: uncertain.has("gender") ? undefined : unambiguous(genders),
		vaccinationStatus: uncertain.has("vaccinationStatus") ? undefined : unambiguous(vaccinations),
		semanticQuery,
	};
}
