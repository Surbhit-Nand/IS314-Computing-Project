ALTER TABLE "rescue_report_status_history" ADD COLUMN IF NOT EXISTS "dispatcher_name" text;
--> statement-breakpoint
ALTER TABLE "rescue_report_status_history" ADD COLUMN IF NOT EXISTS "notes" text;
--> statement-breakpoint
ALTER TABLE "rescue_report_status_history" ADD COLUMN IF NOT EXISTS "outcome" text;
--> statement-breakpoint
ALTER TABLE "rescue_report_status_history" ADD COLUMN IF NOT EXISTS "additional_remarks" text;
--> statement-breakpoint
ALTER TABLE "rescue_report_status_history" ADD COLUMN IF NOT EXISTS "image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rescue_report_status_history_report_id_idx"
	ON "rescue_report_status_history" USING btree ("report_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rescue_reports_available_idx"
	ON "rescue_reports" USING btree ("status")
	WHERE "assigned_to_clerk_user_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rescue_reports_dispatcher_idx"
	ON "rescue_reports" USING btree ("assigned_to_clerk_user_id", "status");