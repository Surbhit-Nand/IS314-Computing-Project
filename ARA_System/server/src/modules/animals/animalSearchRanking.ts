import { extractTraits } from "../../shared/animalTraits.js";

export type AnimalSearchCandidate = {
	id: string;
	behaviour: string | null;
	description: string | null;
	similarity: number | null;
};

export type RankedAnimalSearchCandidate<T extends AnimalSearchCandidate> = {
	animal: T;
	matchedTraits: string[];
	matchedTagCount: number;
	requestedTagCount: number;
	tagMatchRatio: number;
	tagMatchTier: number;
	similarity: number | null;
	reason: "full tag match" | "partial tag match" | "semantic fallback";
};

// Only accepts candidates already gated by publicSearchEligibility in SQL.
// Scores stay internal; the public route continues to serialize IDs only.
export function rankAnimalSearchCandidates<T extends AnimalSearchCandidate>(
	candidates: T[],
	requestedTraits: string[],
	options: { minSimilarity: number; limit: number },
): RankedAnimalSearchCandidate<T>[] {
	const requested = [...new Set(requestedTraits)];
	const scored: RankedAnimalSearchCandidate<T>[] = [];
	for (const animal of candidates) {
		const traits = new Set(extractTraits(animal.behaviour, animal.description));
		const matchedTraits = requested.filter((trait) => traits.has(trait));
		const matchedTagCount = matchedTraits.length;
		const similarity = animal.similarity !== null && Number.isFinite(animal.similarity)
			? animal.similarity : null;
		if (matchedTagCount === 0 && (similarity === null || similarity < options.minSimilarity)) continue;
		const tagMatchTier = matchedTagCount === 0 ? 0 : matchedTagCount === requested.length ? 2 : 1;
		scored.push({
			animal,
			matchedTraits,
			matchedTagCount,
			requestedTagCount: requested.length,
			tagMatchRatio: requested.length ? matchedTagCount / requested.length : 0,
			tagMatchTier,
			similarity,
			reason: tagMatchTier === 2 ? "full tag match" : tagMatchTier === 1 ? "partial tag match" : "semantic fallback",
		});
	}
	scored.sort((a, b) =>
		b.tagMatchTier - a.tagMatchTier ||
		b.matchedTagCount - a.matchedTagCount ||
		(b.similarity ?? -Infinity) - (a.similarity ?? -Infinity) ||
		a.animal.id.localeCompare(b.animal.id),
	);
	// Keep the highest-ranked occurrence, even if a caller merges candidate sources.
	const unique = new Map<string, RankedAnimalSearchCandidate<T>>();
	for (const result of scored) {
		if (!unique.has(result.animal.id)) unique.set(result.animal.id, result);
	}
	return [...unique.values()].slice(0, options.limit);
}
