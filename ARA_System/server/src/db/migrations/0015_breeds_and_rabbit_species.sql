-- Breed lookup table + retiring "rabbit" as a registration species.
--
-- Hand-written (like 0007_* and 0013_*): `drizzle-kit generate` currently
-- refuses to run because snapshots 0011/0013 and 0012/0014 share a parent
-- snapshot (left over from the ai-search merge), so there is no 0015 snapshot.
--
-- 1. `breeds`: the allowed dog/cat breeds. The Breed dropdown loads from it and
--    the API rejects dog/cat breeds not listed. Rows are seeded separately by
--    `npm run db:seed:breeds` (ON CONFLICT DO NOTHING, safe to re-run), so this
--    migration only creates the structure.
-- 2. Existing rabbit profiles become species "other" with the animal type in
--    `breed`, the same way hamsters are stored ("Hamster"). The specific rabbit
--    breed is kept by suffixing it ("Holland Lop" -> "Holland Lop Rabbit");
--    blank/generic/odd values become plain "Rabbit". Only rows still typed
--    'rabbit' are touched, so re-running changes nothing. The 'rabbit' value
--    stays in the animal_type enum (dropping an enum value means rebuilding the
--    type on a shared DB) - the API simply stops accepting it.
--
-- `IF NOT EXISTS` on the DDL so re-running after a partial manual apply (see the
-- skipped-migration note in AGENTS.md) is harmless.
CREATE TABLE IF NOT EXISTS "breeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"species" "animal_type" NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "breeds_species_name_unique" ON "breeds" USING btree ("species","name");
--> statement-breakpoint
UPDATE "animals"
SET
	"type" = 'other',
	"breed" = CASE
		WHEN "breed" IS NULL
			OR btrim("breed") = ''
			OR lower(btrim("breed")) IN ('rabbit', 'mixed breed', 'mixed/unknown', 'other', 'unknown')
			OR btrim("breed") !~ '^[A-Za-z][A-Za-z -]*[A-Za-z]$'
			OR length(btrim("breed")) > 33
			THEN 'Rabbit'
		WHEN lower(btrim("breed")) LIKE '% rabbit' THEN btrim("breed")
		ELSE btrim("breed") || ' Rabbit'
	END,
	"updated_at" = now()
WHERE "type" = 'rabbit';
