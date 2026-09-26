ALTER TABLE "rescue_reports" ADD COLUMN IF NOT EXISTS "assigned_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "rescue_reports" SET "status" = 'in_progress' WHERE "status" = 'rescued';
--> statement-breakpoint
UPDATE "rescue_reports" SET "status" = 'resolved' WHERE "status" = 'closed';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rescue_report_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by_clerk_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "rescue_report_status_history"
		ADD CONSTRAINT "rescue_report_status_history_report_id_rescue_reports_id_fk"
		FOREIGN KEY ("report_id") REFERENCES "public"."rescue_reports"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rescue_report_status_history_report_id_idx"
	ON "rescue_report_status_history" USING btree ("report_id");
