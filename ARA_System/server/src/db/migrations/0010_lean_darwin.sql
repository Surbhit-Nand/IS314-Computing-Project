CREATE TYPE "public"."animal_priority" AS ENUM('critical', 'high', 'moderate', 'routine');--> statement-breakpoint
CREATE TABLE "veterinary_care_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"requirement_type" text NOT NULL,
	"status" text DEFAULT 'required' NOT NULL,
	"scheduled_date" timestamp with time zone,
	"completed_date" timestamp with time zone,
	"details" text,
	"medication" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "veterinary_examinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"examination_date" timestamp with time zone NOT NULL,
	"weight_kg" double precision,
	"temperature_c" double precision,
	"general_condition" text NOT NULL,
	"injuries" text,
	"observations" text,
	"diagnosis" text,
	"notes" text,
	"performed_by_clerk_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "veterinary_treatment_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"care_plan_id" uuid,
	"appointment_id" uuid,
	"treatment_date" date NOT NULL,
	"details" text NOT NULL,
	"medication" text,
	"notes" text,
	"performed_by_clerk_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "veterinary_priority" "animal_priority";--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "veterinary_status" text DEFAULT 'needs_initial_examination' NOT NULL;--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "medical_clearance_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "medical_cleared_by_clerk_user_id" text;--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "medical_clearance_notes" text;--> statement-breakpoint
ALTER TABLE "vet_appointments" ADD COLUMN "purpose" text DEFAULT 'Follow-up examination' NOT NULL;--> statement-breakpoint
ALTER TABLE "vet_appointments" ADD COLUMN "visit_details" text;--> statement-breakpoint
ALTER TABLE "vet_appointments" ADD COLUMN "treatment_performed" text;--> statement-breakpoint
ALTER TABLE "vet_appointments" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vet_appointments" ADD COLUMN "completed_by_clerk_user_id" text;--> statement-breakpoint
ALTER TABLE "veterinary_care_plans" ADD CONSTRAINT "veterinary_care_plans_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veterinary_examinations" ADD CONSTRAINT "veterinary_examinations_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veterinary_treatment_history" ADD CONSTRAINT "veterinary_treatment_history_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veterinary_treatment_history" ADD CONSTRAINT "veterinary_treatment_history_care_plan_id_veterinary_care_plans_id_fk" FOREIGN KEY ("care_plan_id") REFERENCES "public"."veterinary_care_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veterinary_treatment_history" ADD CONSTRAINT "veterinary_treatment_history_appointment_id_vet_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."vet_appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vet_appointment_slot_unique" ON "vet_appointments" USING btree ("appointment_date");