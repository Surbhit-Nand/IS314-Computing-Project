-- Slimmed care plan: vet-cost plan plus a next-of-kin backup contact. The
-- older routine/travel columns and the acknowledgement booleans stay for
-- existing rows; new applications leave them null/false.
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "next_of_kin_name" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "next_of_kin_contact" text;
