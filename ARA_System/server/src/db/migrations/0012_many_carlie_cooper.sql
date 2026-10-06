ALTER TABLE "adoption_applications" ALTER COLUMN "home_details" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "adoption_applications" ALTER COLUMN "family_details" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "full_name" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "contact_number" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "applicant_email" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "residential_address" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "date_of_birth" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "housing_type" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "tenure" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "landlord_pets_allowed" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "fenced_yard" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "household_size" integer;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "children_ages" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "pet_allergies" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "owned_pets_before" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "previous_pet_outcome" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "has_current_pets" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "current_pets_details" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "alone_hours" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "primary_caregiver" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "daily_routine" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "vet_cost_plan" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "travel_care_plan" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "adoption_motivation" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "adoption_for" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "household_agreement" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "consent_home_visit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "agree_return_to_spca" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN "confirm_accurate" boolean DEFAULT false NOT NULL;