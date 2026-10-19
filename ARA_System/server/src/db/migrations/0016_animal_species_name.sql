-- Separate the typed species of "Other" animals from their breed.
--
-- Hand-written (drizzle-kit generate is broken on this branch - see the
-- AGENTS.md "Database / Neon gotchas" notes), like 0007_*, 0013_* and 0015_*.
--
-- 1. animals.species_name (nullable text): the species staff typed for an
--    animal whose `type` is 'other' (e.g. "Rabbit", "Guinea Pig"). NULL for
--    dogs and cats - their species is already `type`. Additive + nullable, so
--    old code that doesn't know the column keeps working.
-- 2. Until now an Other animal's typed animal kind lived in `breed` (e.g.
--    "Holland Lop Rabbit", "Syrian Hamster", "Guinea Pig"). Split it:
--      - a known species word inside the breed (Rabbit, Hamster, Guinea Pig)
--        becomes species_name, and the remaining words stay as the breed
--        ("Holland Lop Rabbit" -> Rabbit / "Holland Lop"; "Syrian Hamster
--        Mix" -> Hamster / "Syrian Mix"), capitalised; nothing left -> breed
--        "Unknown";
--      - any other value was the typed animal kind itself, so it becomes
--        species_name (capitalised) and breed becomes "Unknown".
--    No words are dropped. Postgres evaluates every SET expression against the
--    row's ORIGINAL values, so both columns are derived from the old breed.
--    Only Other rows without a species_name yet are touched, so re-running
--    changes nothing.
ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "species_name" text;
--> statement-breakpoint
UPDATE "animals"
SET
	"species_name" = CASE
		WHEN "breed" ~* '\mrabbit\M' THEN 'Rabbit'
		WHEN "breed" ~* '\mhamster\M' THEN 'Hamster'
		WHEN "breed" ~* '\mguinea pig\M' THEN 'Guinea Pig'
		WHEN "breed" IS NULL OR btrim("breed") = '' THEN NULL
		ELSE initcap(regexp_replace(btrim("breed"), '\s+', ' ', 'g'))
	END,
	"breed" = CASE
		WHEN "breed" ~* '\m(rabbit|hamster|guinea pig)\M' THEN coalesce(
			nullif(initcap(btrim(regexp_replace(regexp_replace("breed", '\m(rabbit|hamster|guinea pig)\M', '', 'gi'), '\s+', ' ', 'g'))), ''),
			'Unknown'
		)
		WHEN "breed" IS NULL OR btrim("breed") = '' THEN "breed"
		ELSE 'Unknown'
	END,
	"updated_at" = now()
WHERE "type" = 'other' AND "species_name" IS NULL;
