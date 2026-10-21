import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { app } from "../app.js";
import { findPublicAnimals, findPublicAnimalSpellingTerms } from "../modules/animals/animals.repository.js";
import { correctAnimalSearchQuery } from "../modules/animals/animalSearchSpelling.js";
import { parseAnimalSearchIntent } from "../modules/animals/animalSearchIntent.js";

// Read-only live verification against the actual Express endpoint, configured
// development database and Gemini provider. No profile/vector writes.
// node --use-system-ca --import tsx server/src/scripts/diagnoseAnimalSearchSpelling.ts report.json
const queries = [
  ["small energetic vuddly bog", "small energetic cuddly dog"],
  ["smal calm dog", "small calm dog"],
  ["quiet cudly catt", "quiet cuddly cat"],
  ["vaccinted friendly dog", "vaccinated friendly dog"],
  ["not energtic dog", "not energetic dog"],
  ["small energetic cuddly dog", "small energetic cuddly dog"],
];

async function main() {
  const [animals, protectedTerms] = await Promise.all([findPublicAnimals(), findPublicAnimalSpellingTerms()]);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const reports = [];
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    for (const [query, expected] of queries) {
      const spelling = correctAnimalSearchQuery(query, { protectedTerms });
      const { requestedTraits, semanticQuery, ...filters } = parseAnimalSearchIntent(spelling.correctedQuery);
      try {
        const response: Response = await fetch(`http://127.0.0.1:${address.port}/api/animals/ai-search`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }),
        });
        const payload = await response.json() as { results?: string[]; didYouMean?: string; error?: string };
        assert.equal(response.status, 200, payload.error);
        assert.equal(spelling.correctedQuery, expected);
        assert.equal(payload.didYouMean, spelling.changed ? expected : undefined);
        assert(payload.results);
        const returnedAnimals = payload.results.map(id => {
          const animal = animals.find(row => row.id === id);
          assert(animal, "Returned ID must be publicly visible");
          for (const [key, value] of Object.entries(filters)) {
            if (value !== undefined) assert.equal(String(animal[key as keyof typeof animal]).trim().toLowerCase(), value.toLowerCase());
          }
          return animal.name;
        });
        const report = { ...spelling, filters, requestedTraits, semanticQuery, didYouMean: payload.didYouMean ?? null, returnedAnimals };
        reports.push(report);
        console.log(JSON.stringify(report));
      } catch (error) {
        const report = { ...spelling, filters, requestedTraits, error: error instanceof Error ? error.message : "Search failed" };
        reports.push(report); console.log(JSON.stringify(report)); process.exitCode = 1;
      }
    }
    if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify({ generatedAt: new Date().toISOString(), queries: reports }, null, 2) + "\n");
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Diagnostic failed"); process.exitCode = 1;
});
