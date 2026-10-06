ALTER TABLE "adoption_applications" ALTER COLUMN "home_details" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "adoption_applications" ALTER COLUMN "family_details" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "full_name" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "contact_number" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "applicant_email" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "residential_address" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "date_of_birth" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "housing_type" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "tenure" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "landlord_pets_allowed" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "fenced_yard" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "household_size" integer;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "children_ages" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "pet_allergies" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "owned_pets_before" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "previous_pet_outcome" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "has_current_pets" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "current_pets_details" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "alone_hours" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "primary_caregiver" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "daily_routine" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "vet_cost_plan" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "travel_care_plan" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "adoption_motivation" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "adoption_for" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "household_agreement" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "consent_home_visit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "agree_return_to_spca" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "confirm_accurate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "search_embedding" vector(768);