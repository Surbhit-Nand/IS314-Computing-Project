CREATE TYPE "public"."animal_priority" AS ENUM('critical', 'high', 'moderate', 'routine');--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "veterinary_priority" "animal_priority";