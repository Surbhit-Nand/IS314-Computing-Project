-- Breed lists for typed "Other" species (Rabbit, Hamster, Guinea Pig...).
--
-- Hand-written (drizzle-kit generate is broken on this branch - see the
-- AGENTS.md "Database / Neon gotchas" notes), like 0015_* and 0016_*.
--
-- 1. breeds.species_name (nullable text): for rows with species 'other', the
--    typed species the breed belongs to ("Rabbit"). NULL for dog/cat rows -
--    their species is `species`. Additive + nullable, so the existing 79
--    dog/cat rows and old code that doesn't know the column keep working.
-- 2. Uniqueness becomes (species, species_name, name), case-insensitive, so
--    "Mixed breed" / "Unknown" / "Rex" can exist once per species. The new
--    index is created BEFORE the old (species, name) one is dropped, so the
--    table is never without a uniqueness rule. COALESCE makes the NULL
--    species_name of dog/cat rows compare equal (plain NULLs never collide).
--
-- No rows are inserted here: `npm run db:seed:breeds` adds the lists from
-- breedSeedData.ts with ON CONFLICT DO NOTHING (safe to re-run). No animal rows
-- are touched. IF [NOT] EXISTS everywhere, so re-running after a partial manual
-- apply (see the skipped-migration note in AGENTS.md) is harmless.
ALTER TABLE "breeds" ADD COLUMN IF NOT EXISTS "species_name" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "breeds_species_species_name_name_unique" ON "breeds" USING btree ("species", lower(coalesce("species_name", '')), lower("name"));
--> statement-breakpoint
DROP INDEX IF EXISTS "breeds_species_name_unique";
