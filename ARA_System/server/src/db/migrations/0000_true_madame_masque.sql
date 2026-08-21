CREATE TYPE "public"."animal_status" AS ENUM('intake', 'in_treatment', 'medically_cleared', 'adopted', 'closed');--> statement-breakpoint
CREATE TYPE "public"."animal_type" AS ENUM('dog', 'cat', 'rabbit', 'other');--> statement-breakpoint
CREATE TABLE "adoption_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"applicant_clerk_user_id" text NOT NULL,
	"home_details" text NOT NULL,
	"family_details" text NOT NULL,
	"existing_pets" text,
	"animal_experience" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "animals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "animal_type" NOT NULL,
	"breed" text,
	"estimated_age" text,
	"gender" text,
	"colour" text,
	"rescue_date" date,
	"behaviour" text,
	"rescue_history" text,
	"photo_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"medically_cleared" boolean DEFAULT false NOT NULL,
	"status" "animal_status" DEFAULT 'intake' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "animals_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_clerk_user_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rescue_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid,
	"reporter_clerk_user_id" text,
	"location" text NOT NULL,
	"condition_description" text NOT NULL,
	"urgency" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vet_appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"booked_by_clerk_user_id" text NOT NULL,
	"appointment_date" timestamp with time zone NOT NULL,
	"notes" text,
	"source" text DEFAULT 'online' NOT NULL,
	"status" text DEFAULT 'booked' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD CONSTRAINT "adoption_applications_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rescue_reports" ADD CONSTRAINT "rescue_reports_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_appointments" ADD CONSTRAINT "vet_appointments_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;