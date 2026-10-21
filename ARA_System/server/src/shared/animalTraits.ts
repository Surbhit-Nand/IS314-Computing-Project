// Dependency-free vocabulary shared by animal cards, sidebar filters and AI search.
// Keep this module free of database, environment and frontend imports.

// Trait lexicon scanned out of the staff-written description + behaviour
// text. Every entry is clickable: `filterValue` names a Behaviour filter
// option, and the listing matches by set inclusion (see `extractTraits`),
// so a tag can never promise a filter it does not apply. Groups drive the
// sidebar's grouped Behaviour options - keep the two in sync.
export type TraitGroup = "Temperament" | "Sociability" | "Energy & lifestyle" | "Training & care";

export type TraitEntry = {
  key: string;
  label: string;
  group: TraitGroup;
  pattern: RegExp;
  // Regex stems are not complete words and must never become spelling targets.
  spellingFragments?: readonly string[];
};

export const ANIMAL_TRAITS: TraitEntry[] = [
  // Temperament (the original five - these own long-standing filter keys).
  { key: "good-with-children", label: "Good with children", group: "Temperament", pattern: /(good with children|family|kids)/ },
  { key: "calm", label: "Calm", group: "Temperament", pattern: /(calm|gentle|docile|quiet)/ },
  { key: "energetic", label: "Energetic", group: "Temperament", pattern: /(energetic|active|playful|high.?energy)/ },
  { key: "house-trained", label: "House-trained", group: "Temperament", pattern: /(house.?trained|housebroken)/ },
  { key: "good-with-pets", label: "Good with pets", group: "Temperament", pattern: /(good with (other )?(dogs|pets|animals)|cat.?friendly|dog.?friendly)/ },
  // Sociability.
  { key: "friendly", label: "Friendly", group: "Sociability", pattern: /(friendly|sociable|outgoing)/ },
  { key: "shy", label: "Shy", group: "Sociability", pattern: /\bshy\b|\btimid\b|\breserved\b/ },
  { key: "independent", label: "Independent", group: "Sociability", pattern: /(independent|self.?sufficient|low.?maintenance)/ },
  { key: "cuddly", label: "Cuddly", group: "Sociability", pattern: /(cuddl|affectionate|lap.?cat|lap.?dog|snuggl)/, spellingFragments: ["cuddl", "snuggl"] },
  { key: "loyal", label: "Loyal", group: "Sociability", pattern: /(loyal|devoted|bonded|velcro)/ },
  { key: "good-with-strangers", label: "Good with strangers", group: "Sociability", pattern: /(good with strangers|loves (meeting )?people|greets (visitors|guests))/ },
  { key: "vocal", label: "Vocal", group: "Sociability", pattern: /(vocal|talkative|chatty|howls?|barky|meows? (a lot|constantly))/ },
  // Energy & lifestyle.
  { key: "loves-walks", label: "Loves walks", group: "Energy & lifestyle", pattern: /(loves? walks|enjoys? walks|great walking|walking companion|hiking)/ },
  { key: "apartment-friendly", label: "Apartment-friendly", group: "Energy & lifestyle", pattern: /(apartment.?friendly|flat.?friendly|small.?space|indoor (cat|pet|life))/ },
  { key: "adventurous", label: "Adventurous", group: "Energy & lifestyle", pattern: /(adventurous|explorer|curious|mischievous)/ },
  { key: "lazy", label: "Laid-back", group: "Energy & lifestyle", pattern: /(laid.?back|lazy|couch potato|lounge)/ },
  // Training & care.
  { key: "litter-trained", label: "Litter-trained", group: "Training & care", pattern: /(litter.?trained|litter box)/ },
  { key: "desexed", label: "Desexed", group: "Training & care", pattern: /(desexed|spayed|neutered|fixed)/ },
  { key: "senior", label: "Senior", group: "Training & care", pattern: /(senior|elderly|old soul|golden oldie|retire)/ },
  { key: "special-needs", label: "Special needs", group: "Training & care", pattern: /(special needs|daily medication|ongoing (medical )?care|blind|deaf|three.?legged|tripod|diabet)/, spellingFragments: ["diabet"] },
  { key: "puppy-energy", label: "Young & bouncy", group: "Training & care", pattern: /(puppy|kitten|young and (bouncy|lively)|full of beans)/ },
];

// Whole-word-ish guard shared with the search parser's philosophy: a trait
// preceded by not/no/without (etc.) must not tag. Checked on the text before
// each match.
function isNegatedMention(text: string, index: number): boolean {
  return /\b(?:not|no|without|never|isn.?t|doesn.?t|don.?t|can.?t)(?:\s+(?:a|an|the|very|particularly|especially|at|all))*[ -]*$/.test(
    text.slice(0, index),
  );
}

// Every trait key present in the free text (description + behaviour), in
// lexicon order. Shared by card tags, sidebar filters, query trait extraction
// and search ranking. The card's display cap must never limit this full set.
export function extractTraits(
  behaviour: string | null | undefined,
  description: string | null | undefined,
): string[] {
  const text = `${behaviour ?? ""}\n${description ?? ""}`.toLowerCase();
  if (!text.trim()) return [];
  const found: string[] = [];
  for (const trait of ANIMAL_TRAITS) {
    // Fresh (non-global) regex use per test: global regexes keep lastIndex
    // state across calls, so matching resets explicitly instead.
    const pattern = new RegExp(trait.pattern.source, trait.pattern.flags.replace("g", ""));
    const match = pattern.exec(text);
    if (match && match.index !== undefined && !isNegatedMention(text, match.index)) {
      found.push(trait.key);
    }
  }
  return found;
}

export function traitLabel(key: string): string {
  return ANIMAL_TRAITS.find((trait) => trait.key === key)?.label ?? key;
}
