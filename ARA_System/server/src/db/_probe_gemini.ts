import { embedSearchQuery, embedAnimalProfileText, isAiSearchConfigured } from "../services/aiSearchClient.js";
import { ANIMAL_SEARCH_EMBEDDING_DIMENSIONS } from "../config/aiSearchConfig.js";

console.log("configured:", isAiSearchConfigured());
console.log("expected dimensions:", ANIMAL_SEARCH_EMBEDDING_DIMENSIONS);

const started = Date.now();
const v = await embedSearchQuery("small dog which is calm around children");
console.log("QUERY embed ok in", Date.now() - started, "ms");
console.log("  typeof:", typeof v, "| isArray:", Array.isArray(v));
console.log("  length:", v.length, "| expected:", ANIMAL_SEARCH_EMBEDDING_DIMENSIONS, "| match:", v.length === ANIMAL_SEARCH_EMBEDDING_DIMENSIONS);
console.log("  all numbers:", v.every((n) => typeof n === "number" && Number.isFinite(n)));
console.log("  first 4 values:", v.slice(0, 4).map((n) => n.toFixed(6)).join(", "));

const d = await embedAnimalProfileText("Name: Milo\nSpecies: Dog\nBehaviour: Calm, gentle and patient.");
console.log("DOCUMENT embed ok | length:", d.length, "| match:", d.length === ANIMAL_SEARCH_EMBEDDING_DIMENSIONS);
console.log("  all numbers:", d.every((n) => typeof n === "number" && Number.isFinite(n)));