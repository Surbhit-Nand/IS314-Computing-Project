-- Additive only. Preserve every existing profile and medical record.
ALTER TABLE "animals" ADD COLUMN "published_at" timestamp with time zone;
--> statement-breakpoint
-- Preserve visibility for profiles already public before this workflow.
-- New and not-yet-cleared animals remain drafts (NULL).
UPDATE "animals" SET "published_at" = CURRENT_TIMESTAMP
WHERE "medically_cleared" = true AND "deleted_at" IS NULL
  AND "status" NOT IN ('adopted', 'closed');
