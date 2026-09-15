CREATE TABLE IF NOT EXISTS "adoption_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"status" text NOT NULL,
	"changed_by_clerk_user_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "review_notes" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "adoption_status_history" ADD CONSTRAINT "adoption_status_history_application_id_adoption_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."adoption_applications"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "adoption_animal_unique_active" ON "adoption_applications" USING btree ("animal_id") WHERE "adoption_applications"."status" IN ('approved', 'completed');