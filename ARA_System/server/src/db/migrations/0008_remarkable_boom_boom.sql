ALTER TABLE "animals" ADD COLUMN "veterinary_status" text DEFAULT 'needs_initial_examination' NOT NULL;--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "medical_clearance_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "medical_cleared_by_clerk_user_id" text;--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "medical_clearance_notes" text;