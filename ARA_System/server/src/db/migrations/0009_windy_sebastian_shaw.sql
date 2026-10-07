CREATE TABLE "rescue_debriefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"animal_condition" text,
	"what_happened" text NOT NULL,
	"destination_or_handoff" text,
	"veterinary_priority" text,
	"unsuccessful_details" text,
	"created_by_clerk_user_id" text NOT NULL,
	"dispatcher_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rescue_debriefs_report_id_unique" UNIQUE("report_id")
);
--> statement-breakpoint
CREATE TABLE "rescue_intake_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"animal_type" text,
	"animal_breed" text,
	"condition_description" text,
	"veterinary_priority" text,
	"destination" text,
	"notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by_clerk_user_id" text NOT NULL,
	"dispatcher_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone,
	CONSTRAINT "rescue_intake_handoffs_report_id_unique" UNIQUE("report_id")
);
--> statement-breakpoint
CREATE TABLE "rescue_mission_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"update_type" text NOT NULL,
	"message" text,
	"image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_clerk_user_id" text NOT NULL,
	"dispatcher_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rescue_debriefs" ADD CONSTRAINT "rescue_debriefs_report_id_rescue_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."rescue_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rescue_intake_handoffs" ADD CONSTRAINT "rescue_intake_handoffs_report_id_rescue_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."rescue_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rescue_mission_updates" ADD CONSTRAINT "rescue_mission_updates_report_id_rescue_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."rescue_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rescue_mission_updates_report_id_idx"
	ON "rescue_mission_updates" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rescue_intake_handoffs_status_idx"
	ON "rescue_intake_handoffs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rescue_reports_status_idx"
	ON "rescue_reports" USING btree ("status");