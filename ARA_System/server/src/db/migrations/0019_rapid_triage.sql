CREATE TYPE "public"."triage_clinical_stability" AS ENUM('unstable', 'currently_stable', 'not_yet_assessed');--> statement-breakpoint
CREATE TYPE "public"."triage_intervention_urgency" AS ENUM('immediate_intervention', 'urgent_evaluation', 'stabilized_monitoring');--> statement-breakpoint
CREATE TYPE "public"."triage_condition_trend" AS ENUM('deteriorating', 'unchanged', 'improving', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."triage_emergency_finding" AS ENUM('severe_bleeding', 'breathing_difficulty', 'circulatory_compromise', 'altered_consciousness', 'other_emergency_concern');--> statement-breakpoint
CREATE TABLE "veterinary_triage_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"clinical_stability" "triage_clinical_stability" NOT NULL,
	"intervention_urgency" "triage_intervention_urgency" NOT NULL,
	"condition_trend" "triage_condition_trend" NOT NULL,
	"emergency_findings" "triage_emergency_finding"[] DEFAULT ARRAY[]::"triage_emergency_finding"[] NOT NULL,
	"notes" text,
	"performed_by_clerk_user_id" text NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "veterinary_triage_assessments" ADD CONSTRAINT "veterinary_triage_assessments_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "veterinary_triage_assessments_animal_assessed_idx" ON "veterinary_triage_assessments" USING btree ("animal_id","assessed_at" DESC);
