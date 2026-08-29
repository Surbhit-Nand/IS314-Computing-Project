CREATE TYPE "public"."vaccination_status" AS ENUM('not_vaccinated', 'vaccinated');--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "vaccination_status" "vaccination_status" DEFAULT 'not_vaccinated' NOT NULL;