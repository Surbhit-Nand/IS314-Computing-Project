// Content rules for animal-profile text that staff type in. Pure functions
// with no imports, so the exact same rules can run in the browser.
//
// MIRRORED in src/features/animals/animalFieldRules.ts - keep both files
// identical. src/features/animals/animalFieldRules.test.ts runs every case
// through both copies and fails if they ever disagree.
//
// Each validator returns a staff-facing error message, or null when the value
// is fine. Rules only apply when a profile is saved: existing animals with
// shorter text keep displaying normally.

export const NARRATIVE_MIN_LENGTH = 30;
export const NARRATIVE_MAX_LENGTH = 1000;
export const NARRATIVE_MIN_WORDS = 5;

// Typed species names and "Other" breeds ("Guinea Pig", "Holland Lop").
export const NAME_TEXT_MIN_LENGTH = 2;
export const NAME_TEXT_MAX_LENGTH = 40;

// Used by the junk checks for typed names and for free text.
const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

// Words = whitespace-separated chunks that contain at least one letter, so
// "123" or "--" never count towards the minimum.
function wordsOf(text: string): string[] {
	return text
		.split(/\s+/)
		.map((chunk) => chunk.toLowerCase().replace(/[^a-z'-]/g, ""))
		.filter((word) => /[a-z]/.test(word));
}

// Description, Behaviour and Rescue history. `fieldLabel` is the sentence-case
// field name used in messages, e.g. "Description".
export function validateNarrativeText(value: string, fieldLabel: string): string | null {
	const text = value.trim();
	if (!text) return `${fieldLabel} is required.`;
	if (text.length < NARRATIVE_MIN_LENGTH) {
		return `${fieldLabel} must be at least ${NARRATIVE_MIN_LENGTH} characters (currently ${text.length}).`;
	}
	if (text.length > NARRATIVE_MAX_LENGTH) {
		return `${fieldLabel} must be ${NARRATIVE_MAX_LENGTH} characters or fewer (currently ${text.length}).`;
	}

	// Real sentences are mostly letters. This rejects digits-only ("1234567890"),
	// symbols-only and mostly-numeric text while still allowing the odd number
	// or date ("rescued on 25/09/2026 near Suva").
	const visible = text.replace(/\s/g, "");
	const letters = (visible.match(/[a-zA-Z]/g) ?? []).length;
	if (letters === 0) {
		return `${fieldLabel} must be written in words, not just numbers or symbols.`;
	}
	if (letters < visible.length * 0.6) {
		return `${fieldLabel} is mostly numbers or symbols - please describe it in words.`;
	}

	const words = wordsOf(text);
	if (words.length < NARRATIVE_MIN_WORDS) {
		return `${fieldLabel} must contain at least ${NARRATIVE_MIN_WORDS} words.`;
	}

	// "aaaaaa", "!!!!!!" - no real word has a letter 4+ times in a row.
	if (/([a-zA-Z])\1{3,}/.test(text) || /(\S)\1{5,}/.test(text)) {
		return `${fieldLabel} contains repeated characters - please write a real description.`;
	}

	// "test test test test test" (same word 3+ times running) or a handful of
	// words cycled over and over ("dog cat dog cat dog cat").
	for (let index = 2; index < words.length; index += 1) {
		if (words[index] === words[index - 1] && words[index] === words[index - 2]) {
			return `${fieldLabel} repeats the same word - please write a real description.`;
		}
	}
	if (new Set(words).size < words.length * 0.4) {
		return `${fieldLabel} repeats the same few words - please write a real description.`;
	}

	return findGibberish(text, fieldLabel, words.length);
}

// ------------------------------------------------------- gibberish checks
// Catches keyboard-mash text that passes the length/word rules above, e.g.
// "w1234567890qgerah...", "eWRETYKUYFJHBN", "rtrsytjmhk yjfhkh". Built to let
// normal text through: Fiji places and names (Nausori, Savusavu, Rajnesh),
// breed and vet words (dachshund, microchipped), numbers with units ("3kg",
// "10 weeks", "2nd") and real words like "strengths" or "rhythm".

// All-caps words of 5+ letters are shouting/mash unless they're one of these.
const KNOWN_ABBREVIATIONS = new Set(["RSPCA", "NSPCA", "COVID"]);

// Digits joined to letters are only allowed as a number + unit/ordinal
// ("3kg", "2.5kg", "2nd", "10am", "1990s") or a short code ("B12", "K9").
const NUMBER_WITH_UNIT =
	/^\d+(?:[.,]\d+)?(?:kgs?|g|lbs?|km|m|cm|mm|ml|l|st|nd|rd|th|s|am|pm|hrs?|h|mins?|yo|yrs?|wks?|mths?|x)$/i;
const SHORT_CODE = /^[A-Za-z]{1,2}\d{1,3}$/;

export const MAX_WORD_LENGTH = 20;

// 4 neighbouring keys in a row ("qwer", "asdf", "hjkl", "zxcv", or backwards).
// "erty" and "trew" are left out: they're inside real words (property, liberty).
const KEYBOARD_RUNS = KEYBOARD_ROWS.flatMap((row) => [row, [...row].reverse().join("")])
	.flatMap((row) => Array.from({ length: row.length - 3 }, (_unused, index) => row.slice(index, index + 4)))
	.filter((run) => run !== "erty" && run !== "trew");

// One word (letters only, lower case) that looks like keyboard mash: a run of
// 4 neighbouring keys, or 5+ consonants in a row (y counts as a vowel, as in
// "rhythm"). Word endings like "-ngths" / "-lfths" (strengths, twelfths) are
// the only real English 5-consonant runs, so a run ending in "ths" at the end
// of the word is allowed.
function looksLikeKeyboardMash(word: string): boolean {
	if (word.length < 4) return false;
	if (KEYBOARD_RUNS.some((run) => word.includes(run))) return true;
	for (const run of word.match(/[^aeiouy]+/g) ?? []) {
		if (run.length >= 5 && !(run.endsWith("ths") && word.endsWith(run))) return true;
	}
	return false;
}

// A capital letter only where words normally have one: "dog", "Dog", "DOG"
// (up to 4 letters, or a known abbreviation like SPCA/RSPCA), "McDonald".
function hasOddCapitals(part: string): boolean {
	if (/^[a-z]+$/.test(part) || /^[A-Z][a-z]*$/.test(part) || /^(?:Mc|Mac)[A-Z][a-z]+$/.test(part)) return false;
	if (/^[A-Z]+$/.test(part)) return part.length >= 5 && !KNOWN_ABBREVIATIONS.has(part);
	return true;
}

function shown(word: string): string {
	return word.length > 16 ? `${word.slice(0, 16)}…` : word;
}

function findGibberish(text: string, fieldLabel: string, wordCount: number): string | null {
	// Split on spaces and punctuation that separates words; keep "2.5kg",
	// "well-fed" and "Charles's" together.
	const tokens = text
		.split(/[\s,;:/()[\]{}"“”!?…]+/)
		.map((token) => token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ""))
		.filter(Boolean);

	let mashWords = 0;
	for (const token of tokens) {
		// Checked per hyphen-separated part, so "2-year-old" and "10-week-old" are
		// fine but "w1234qgerah" isn't.
		const mixed = token
			.split("-")
			.find((part) => /\d/.test(part) && /[A-Za-z]/.test(part) && !NUMBER_WITH_UNIT.test(part) && !SHORT_CODE.test(part));
		if (mixed) {
			return `${fieldLabel} mixes numbers and letters in "${shown(mixed)}" - please write it using real words.`;
		}
		const parts = token.split(/[-'’.]+/).filter((part) => /^[A-Za-z]+$/.test(part));
		const oddCaps = parts.find(hasOddCapitals);
		if (oddCaps) {
			return `${fieldLabel} has odd capital letters in "${shown(oddCaps)}" - please write it using real words.`;
		}
		const tooLong = token.split(/[-'’]+/).find((part) => part.length > MAX_WORD_LENGTH);
		if (tooLong) {
			return `${fieldLabel} has a word longer than ${MAX_WORD_LENGTH} letters ("${shown(tooLong)}") - please write it using real words.`;
		}
		if (parts.some((part) => looksLikeKeyboardMash(part.toLowerCase()))) mashWords += 1;
	}

	// About a third or more of the words look like keyboard mash.
	if (mashWords >= 2 && mashWords * 3 >= wordCount) {
		return `${fieldLabel} looks like random typing - please write it using real words.`;
	}
	return null;
}

// "guinea pig" -> "Guinea Pig", "SUGAR-glider" -> "Sugar-Glider". Also
// collapses runs of whitespace, so the stored value is always tidy. Used for
// the typed species and the Other breed, on display and on save.
export function formatNameText(value: string): string {
	return value
		.trim()
		.replace(/\s+/g, " ")
		.toLowerCase()
		.replace(/(^|[ -])([a-z])/g, (_match, separator: string, letter: string) => separator + letter.toUpperCase());
}

// Letters typed by running along the keyboard or the alphabet: any 3+ letters
// of a keyboard row ("asd", "qwerty"), "abc..." from the start, or 4+ letters
// of the alphabet elsewhere ("mnop") - so real short names like "Stu" or
// "Def" aren't caught by the 3-letter alphabet runs inside them.
function isSequenceJunk(letters: string): boolean {
	if (letters.length < 3) return false;
	if (KEYBOARD_ROWS.some((row) => row.includes(letters))) return true;
	return ALPHABET.startsWith(letters) || (letters.length >= 4 && ALPHABET.includes(letters));
}

// One word of a typed name: letters, optionally joined by apostrophes inside
// the word ("Charles's", "D'Artagnan").
const NAME_WORD = "[A-Za-z]+(?:['’][A-Za-z]+)*";
const NAME_WITH_APOSTROPHES = new RegExp(`^${NAME_WORD}(?:[ -]${NAME_WORD})*$`);

// Shared rule for short typed names: starts with a letter; letters, spaces
// and hyphens only (plus apostrophes when `allowApostrophes`); 2-40
// characters (or `maxLength`); no digits; and no junk - the same letter 3+
// times in a word ("aaaa"), no vowel (y counts), or keyboard/alphabet runs
// ("abc", "qwerty", "asdf"), checked for the whole name and for each word.
function validateNameText(
	value: string,
	fieldLabel: string,
	examples: string,
	{ allowApostrophes = false, maxLength = NAME_TEXT_MAX_LENGTH }: { allowApostrophes?: boolean; maxLength?: number } = {},
): string | null {
	const name = value.trim().replace(/\s+/g, " ");
	if (!name) return `${fieldLabel} is required (${examples}).`;
	if (/\d/.test(name)) return `${fieldLabel} can't contain numbers.`;
	const allowedShape = allowApostrophes ? NAME_WITH_APOSTROPHES : /^[A-Za-z]+(?:[ -][A-Za-z]+)*$/;
	if (!allowedShape.test(name)) {
		return allowApostrophes
			? `${fieldLabel} can only contain letters, spaces, hyphens and apostrophes, starting with a letter.`
			: `${fieldLabel} can only contain letters, spaces and hyphens.`;
	}
	if (name.length < NAME_TEXT_MIN_LENGTH || name.length > maxLength) {
		return `${fieldLabel} must be ${NAME_TEXT_MIN_LENGTH}-${maxLength} characters.`;
	}

	const letters = name.toLowerCase().replace(/[^a-z]/g, "");
	const words = name.toLowerCase().split(/[ -]/).map((word) => word.replace(/[^a-z]/g, ""));
	const looksLikeJunk =
		new Set(letters).size < 2 ||
		// Same letter 3+ times within one word ("aaaa", "Rabbbit") - checked
		// per word so "Charles's Spaniel" isn't read as "...sss...".
		words.some((word) => /([a-z])\1{2,}/.test(word)) ||
		!/[aeiouy]/.test(letters) ||
		isSequenceJunk(letters) ||
		words.some(isSequenceJunk);
	if (looksLikeJunk) return `${fieldLabel} doesn't look like a real name - ${examples}.`;

	return null;
}

// The animal's name: letters (plus spaces, hyphens, apostrophes), 2-30
// characters, starting with a letter, no digits, no junk.
export const ANIMAL_NAME_MAX_LENGTH = 30;

export function validateAnimalName(value: string): string | null {
	return validateNameText(value, "Name", "e.g. Bella, Mr Whiskers, O'Malley", {
		allowApostrophes: true,
		maxLength: ANIMAL_NAME_MAX_LENGTH,
	});
}

// Capitalises the first letter of each word and leaves the rest as typed, so
// "mr whiskers" -> "Mr Whiskers" but "McFluffy" keeps its capitals.
export function formatAnimalName(value: string): string {
	return value
		.trim()
		.replace(/\s+/g, " ")
		.replace(/(^|[ -])([a-z])/g, (_match, separator: string, letter: string) => separator + letter.toUpperCase());
}

// ---------------------------------------------------------------- age
// Estimated age is entered as a number + unit and stored as text in the same
// format existing profiles use ("1 Year", "2.5 Years", "6 Months"), so profile
// pages and the vet module read it unchanged.

export type AgeUnit = "weeks" | "months" | "years";

// Realistic upper limits per unit: under 52 weeks and under 24 months (older
// animals should use the next unit), up to 40 years.
export const AGE_LIMITS: Record<AgeUnit, { max: number; inclusive: boolean }> = {
	weeks: { max: 52, inclusive: false },
	months: { max: 24, inclusive: false },
	years: { max: 40, inclusive: true },
};

const AGE_UNIT_WORDS: Record<AgeUnit, [singular: string, plural: string]> = {
	weeks: ["Week", "Weeks"],
	months: ["Month", "Months"],
	years: ["Year", "Years"],
};

// Number box + unit dropdown check: a number greater than 0 with at most one
// decimal place, realistic for the unit.
export function validateEstimatedAge(valueText: string, unit: AgeUnit | ""): string | null {
	const text = valueText.trim();
	if (!text) return "Please enter the animal's estimated age.";
	if (!/^\d+(?:\.\d)?$/.test(text)) return "Age must be a number with at most one decimal place (e.g. 2 or 2.5).";
	const value = Number(text);
	if (!(value > 0)) return "Age must be greater than 0.";
	if (unit !== "weeks" && unit !== "months" && unit !== "years") {
		return "Please choose weeks, months or years for the age.";
	}
	const { max, inclusive } = AGE_LIMITS[unit];
	if (inclusive ? value > max : value >= max) {
		return unit === "years"
			? `Age can be at most ${max} years.`
			: `Age must be under ${max} ${unit} - use ${unit === "weeks" ? "months" : "years"} instead.`;
	}
	return null;
}

// "2.5" + "years" -> "2.5 Years"; "1" + "months" -> "1 Month".
export function formatEstimatedAge(valueText: string, unit: AgeUnit): string {
	const value = Number(valueText.trim());
	const [singular, plural] = AGE_UNIT_WORDS[unit];
	return `${value} ${value === 1 ? singular : plural}`;
}

// Reads a stored age back into number + unit for the Edit form: "2.5 Years",
// "1 year", "6 months", "10 Weeks" (case-insensitive). Null when it can't be
// understood (e.g. "2" with no unit, or junk) - staff must re-enter it.
export function parseEstimatedAge(text: string | null | undefined): { value: string; unit: AgeUnit } | null {
	const match = /^\s*(\d+(?:\.\d+)?)\s*(weeks?|months?|years?)\s*$/i.exec(text ?? "");
	if (!match) return null;
	const word = match[2].toLowerCase();
	const unit: AgeUnit = word.startsWith("week") ? "weeks" : word.startsWith("month") ? "months" : "years";
	return { value: String(Number(match[1])), unit };
}

// Server-side check of the stored text form, so an API request can't save an
// age the form wouldn't allow.
export function validateEstimatedAgeText(text: string): string | null {
	const parsed = parseEstimatedAge(text);
	if (!parsed) return 'Estimated age must look like "6 Months" or "2.5 Years".';
	return validateEstimatedAge(parsed.value, parsed.unit);
}

// Typed species text that actually means a dog or a cat ("dog", " Cats ") -
// trimmed, case-insensitive, plurals accepted. Dogs and cats must never be
// stored as Other: the form switches back to the Species dropdown and the API
// stores them as type dog/cat. Null for anything else.
export function detectDogOrCatSpecies(value: string): "dog" | "cat" | null {
	const name = value.trim().replace(/\s+/g, " ").toLowerCase();
	if (name === "dog" || name === "dogs") return "dog";
	if (name === "cat" || name === "cats") return "cat";
	return null;
}

// The species staff type when they pick Other (e.g. Rabbit, Snake, Guinea
// Pig). Stored formatted in animals.species_name.
export function validateSpeciesName(value: string): string | null {
	return validateNameText(value, "Species", "e.g. Rabbit, Snake, Guinea Pig");
}

// Words that name an animal, not a breed - e.g. a legacy breed of "cat".
const NOT_A_BREED = ["dog", "dogs", "puppy", "puppies", "cat", "cats", "kitten", "kittens"];

// A breed staff typed instead of picking one from the list: the dog/cat
// "Other" breed option, a legacy breed that isn't in the breeds table (e.g.
// "Russian Blue Mix"), or any breed of an Other species ("Holland Lop").
// "Unknown" and "Mixed breed" pass like any other name. Never the form-only
// word "Other", and never a species word.
export function validateTypedBreedName(value: string): string | null {
	const problem = validateNameText(value, "Breed", "e.g. Russian Blue Mix, Unknown, Mixed breed", {
		allowApostrophes: true,
	});
	if (problem) return problem;

	const name = value.trim().replace(/\s+/g, " ").toLowerCase();
	if (name === "other") {
		return 'Breed can\'t be "Other" - type the actual breed, or use Unknown or Mixed breed.';
	}
	if (NOT_A_BREED.includes(name)) {
		return `"${value.trim()}" is a species, not a breed - type the breed, or use Unknown or Mixed breed.`;
	}
	return null;
}
