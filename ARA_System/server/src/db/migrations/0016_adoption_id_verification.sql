-- Applicant identification for adoption review: document type + hosted photo
-- URL. Required on new applications; staff judge the document at review and
-- the applicant always continues. Existing rows keep nulls.
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "id_document_type" text;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD COLUMN IF NOT EXISTS "id_document_url" text;
