CREATE TABLE "veterinary_emergency_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"attending_veterinarian_clerk_user_id" text,
	"support_required" boolean DEFAULT false NOT NULL,
	"coordination_note" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_clerk_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "veterinary_emergency_responses_version_positive" CHECK ("veterinary_emergency_responses"."version" > 0),
	CONSTRAINT "veterinary_emergency_responses_updated_after_created" CHECK ("veterinary_emergency_responses"."updated_at" >= "veterinary_emergency_responses"."created_at"),
	CONSTRAINT "veterinary_emergency_responses_closed_after_created" CHECK ("veterinary_emergency_responses"."closed_at" IS NULL OR "veterinary_emergency_responses"."closed_at" >= "veterinary_emergency_responses"."created_at"),
	CONSTRAINT "veterinary_emergency_responses_closed_unassigned" CHECK ("veterinary_emergency_responses"."closed_at" IS NULL OR ("veterinary_emergency_responses"."attending_veterinarian_clerk_user_id" IS NULL AND "veterinary_emergency_responses"."support_required" = false))
);--> statement-breakpoint
ALTER TABLE "veterinary_emergency_responses" ADD CONSTRAINT "veterinary_emergency_responses_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "veterinary_emergency_responses_active_animal_idx" ON "veterinary_emergency_responses" USING btree ("animal_id") WHERE "veterinary_emergency_responses"."closed_at" IS NULL;
