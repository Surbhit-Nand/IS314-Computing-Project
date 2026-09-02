CREATE TYPE "public"."animal_size" AS ENUM('small', 'medium', 'large', 'extra_large');--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "size" "animal_size";