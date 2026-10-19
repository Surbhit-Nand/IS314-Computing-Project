DROP INDEX "vet_appointment_slot_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "vet_appointment_slot_unique" ON "vet_appointments" USING btree ("appointment_date") WHERE "vet_appointments"."status" = 'booked';
