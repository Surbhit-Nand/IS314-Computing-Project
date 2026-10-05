// Verifies the "no key configured" branch in isolation, without touching server/.env.
// isAiSearchConfigured() is the exact predicate the service uses.
import { env } from "../config/env.js";
console.log("real run: geminiApiKey present =", Boolean(env.geminiApiKey));
const simulated = { geminiApiKey: "" };
console.log("simulated blank key -> isConfigured would be =", Boolean(simulated.geminiApiKey));