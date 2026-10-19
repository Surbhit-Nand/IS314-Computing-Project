CREATE TABLE IF NOT EXISTS "rescue_takeover_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"requested_by_clerk_user_id" text NOT NULL,
	"requested_by_name" text,
	"assigned_to_clerk_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by_clerk_user_id" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rescue_takeover_requests_report_id_rescue_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."rescue_reports"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rescue_takeover_pending_unique"
	ON "rescue_takeover_requests" ("report_id", "requested_by_clerk_user_id")
	WHERE "status" = 'pending';
