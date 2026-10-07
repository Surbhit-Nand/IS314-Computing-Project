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

const KEYBOARD_SEQUENCES = ["abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm"];

// One word of a typed name: letters, optionally joined by apostrophes inside
// the word ("Charles's", "D'Artagnan").
const NAME_WORD = "[A-Za-z]+(?:['’][A-Za-z]+)*";
const NAME_WITH_APOSTROPHES = new RegExp(`^${NAME_WORD}(?:[ -]${NAME_WORD})*$`);

// Shared rule for short typed names: letters, spaces and hyphens only (plus
// apostrophes when `allowApostrophes`), 2-40 characters, no digits, and no
// junk ("aaaa", "abc", "qwerty", no vowels).
function validateNameText(
	value: string,
	fieldLabel: string,
	examples: string,
	{ allowApostrophes = false }: { allowApostrophes?: boolean } = {},
): string | null {
	const name = value.trim().replace(/\s+/g, " ");
	if (!name) return `${fieldLabel} is required (${examples}).`;
	if (/\d/.test(name)) return `${fieldLabel} can't contain numbers.`;
	const allowedShape = allowApostrophes ? NAME_WITH_APOSTROPHES : /^[A-Za-z]+(?:[ -][A-Za-z]+)*$/;
	if (!allowedShape.test(name)) {
		return allowApostrophes
			? `${fieldLabel} can only contain letters, spaces, hyphens and apostrophes.`
			: `${fieldLabel} can only contain letters, spaces and hyphens.`;
	}
	if (name.length < NAME_TEXT_MIN_LENGTH || name.length > NAME_TEXT_MAX_LENGTH) {
		return `${fieldLabel} must be ${NAME_TEXT_MIN_LENGTH}-${NAME_TEXT_MAX_LENGTH} characters.`;
	}

	const letters = name.toLowerCase().replace(/[^a-z]/g, "");
	const looksLikeJunk =
		new Set(letters).size < 2 ||
		// Same letter 3+ times within one word ("aaaa", "Rabbbit") - checked
		// per word so "Charles's Spaniel" isn't read as "...sss...".
		/([a-z])\1{2,}/.test(name.toLowerCase().replace(/['’]/g, "")) ||
		!/[aeiouy]/.test(letters) ||
		(letters.length >= 3 && KEYBOARD_SEQUENCES.some((sequence) => sequence.includes(letters)));
	if (looksLikeJunk) return `${fieldLabel} doesn't look like a real name - ${examples}.`;

	return null;
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
