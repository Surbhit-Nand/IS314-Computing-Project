import { ANIMAL_TRAITS } from "../../shared/animalTraits.js";
import { COLOUR_OPTIONS, OTHER_ANIMAL_SUGGESTIONS } from "../../shared/animalOptions.js";
import { BREED_SEED_ROWS } from "../../db/breedSeedData.js";
import { ANIMAL_SEARCH_STRUCTURED_TERMS } from "./animalSearchIntent.js";

export type SpellingCorrection = { original: string; corrected: string };
export type AnimalSearchSpelling = {
	originalQuery: string;
	correctedQuery: string;
	corrections: SpellingCorrection[];
	changed: boolean;
};

const words = (text: string) => text.toLowerCase().match(/[\p{L}]+(?:['’][\p{L}]+)*/gu) ?? [];
const traitWords = ANIMAL_TRAITS.flatMap((trait) => [
	...words(`${trait.key} ${trait.label}`),
	// These patterns consist of literal alternatives, optional separators and
	// word boundaries. Read only literal words, excluding explicitly marked
	// stems. This derives aliases such as playful/gentle/affectionate directly
	// from the card vocabulary, without another independent synonym list.
	...words(trait.pattern.source.replace(/\\b/g, " "))
		.filter((word) => !trait.spellingFragments?.includes(word)),
]);
const structuredWords = ANIMAL_SEARCH_STRUCTURED_TERMS.flatMap(words);
const candidates = [...new Set([...structuredWords, ...traitWords, ...COLOUR_OPTIONS.flatMap(words)])]
	.filter((word) => word.length >= 4 || word === "dog" || word === "cat");

// Protection-only words, never correction targets. In particular, ordinary
// prose and negation must not become short domain words (coat -> cat, etc.).
const prose = `a an the and or but if for with without not no never isn't isnt don't dont doesn't doesnt can't cant
is are was were be been being am do does did can could should would will won't wont have has had
i we you he she it they my our your his her its their me us them this that these those who which what
to of in on at by from as into out all any some more most much very only also just still yet fully
near around beside close staying likes like loves love enjoys enjoy wants want needs need looking look find
good well best better home house family people person children kids other pet pets animal animals
age years year months month coat fur hair tail ears eyes face back feet head food water eat eats sleep sleeps
run runs dig digs sit sits stay stays walk walks play plays brown grey gray red blue tan gold silver
black white colour color car cars cart boat bag big hot cold old new bad sad fat thin short long tall
bat cow horse fish fox wolf goat sheep puppy puppies kitten kittens rabbit rabbits guinea pig`;
const protectedDefaults = new Set([
	...words(prose), ...structuredWords, ...traitWords,
	...COLOUR_OPTIONS.flatMap(words), ...OTHER_ANIMAL_SUGGESTIONS.flatMap(words),
	...BREED_SEED_ROWS.flatMap((row) => words(`${row.name} ${row.speciesName ?? ""}`)),
]);

// Optimal-string-alignment Damerau-Levenshtein: adjacent transposition counts
// as one edit. We accept ONLY distance 1, where this equals unrestricted DL.
export function spellingEditDistance(a: string, b: string): number {
	const rows = Array.from({ length: a.length + 1 }, (_, i) =>
		Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1,
				rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
			}
		}
	}
	return rows[a.length][b.length];
}

export function correctAnimalSearchQuery(
	query: string,
	options: { protectedTerms?: Iterable<string> } = {},
): AnimalSearchSpelling {
	const originalQuery = query.trim().replace(/\s+/g, " ");
	const protectedWords = new Set(protectedDefaults);
	for (const term of options.protectedTerms ?? []) {
		for (const word of words(term)) protectedWords.add(word);
	}
	const corrections: SpellingCorrection[] = [];
	const correct = (token: string, allowShort: boolean) => {
		const lower = token.toLowerCase();
		if (protectedWords.has(lower) || !/^[a-z]+$/.test(lower) || lower.length > 32 ||
			lower.length < (allowShort ? 3 : 4)) return token;
		const nearest = candidates.filter((candidate) =>
			Math.abs(candidate.length - lower.length) <= 1 && spellingEditDistance(lower, candidate) === 1);
		// cat/cats and dog/dogs are the same structured intent, not competing
		// meanings. Prefer the shorter form when both are equally close (catt).
		const meanings = new Set(nearest.map((word) => word === "cats" ? "cat" : word === "dogs" ? "dog" : word));
		if (meanings.size !== 1) return token;
		const target = nearest.sort((a, b) => a.length - b.length)[0];
		// Three-letter substitutions are too ambiguous outside clear animal
		// search context; even then only dog/cat can be short correction targets.
		if (lower.length === 3 && target !== "dog" && target !== "cat") return token;
		const corrected = token === token.toUpperCase() ? target.toUpperCase()
			: token[0] === token[0].toUpperCase() ? target[0].toUpperCase() + target.slice(1) : target;
		corrections.push({ original: token, corrected });
		return corrected;
	};
	const tokenPattern = /[\p{L}]+(?:['’][\p{L}]+)*/gu;
	// Resolve longer words first so "vuddly bog" supplies the context "cuddly".
	let correctedQuery = originalQuery.replace(tokenPattern, (token) => correct(token, false));
	const context = words(correctedQuery).some((word) => candidates.includes(word));
	const hasSpecies = /\b(?:dogs?|cats?)\b/i.test(correctedQuery);
	if (context && !hasSpecies) {
		correctedQuery = correctedQuery.replace(tokenPattern, (token) => token.length === 3 ? correct(token, true) : token);
	}
	return { originalQuery, correctedQuery, corrections, changed: corrections.length > 0 };
}
