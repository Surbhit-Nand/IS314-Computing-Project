-- Simplified adoption questionnaire: self-declared adult/minor bracket with
-- guardian details for minors (replacing date of birth), plus a respiratory
-- health answer backing the cat-adoption gate. Removed questions (tenure,
-- landlord, household size, children ages, motivation) keep their nullable
-- columns for existing rows; new applications leave them null.
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "age_bracket" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "guardian_name" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "guardian_contact" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "guardian_relationship" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "guardian_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "respiratory_issues" text;
