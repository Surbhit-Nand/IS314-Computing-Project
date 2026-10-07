// Seeds the `breeds` table (migrations 0015 + 0017) from breedSeedData.ts:
// dog and cat breeds, and breeds for typed "other" species (Rabbit...).
// Run with `npm run db:seed:breeds`. Safe to re-run: existing
// (species, species name, name) rows are skipped via ON CONFLICT DO NOTHING,
// and nothing is ever deleted or renamed.
import { breeds } from "./schema.js";
import { db } from "./client.js";
import { BREED_SEED_ROWS } from "./breedSeedData.js";

const inserted = await db
	.insert(breeds)
	.values(BREED_SEED_ROWS)
	// No target: the unique index (migration 0017) is on expressions -
	// (species, lower(species_name), lower(name)) - so any duplicate is skipped.
	.onConflictDoNothing()
	.returning({ id: breeds.id });

console.log(
	`Breeds: ${inserted.length} added, ${BREED_SEED_ROWS.length - inserted.length} already present ` +
		`(${BREED_SEED_ROWS.length} in breedSeedData.ts).`,
);
