import { isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
	adoptionApplications,
	animals,
	donations,
	rescueReports,
} from "../../db/schema.js";

// Read-only feeds for the analytics report. Each query pulls only the
// columns the service aggregates over, so the report stays cheap regardless
// of how many other columns those tables grow. Every table is fetched in
// full (no date filter): snapshots count everything ever recorded, and the
// service trims the per-month trends down to the requested range - one query
// per table no matter which range is selected.
//
// Soft-deleted animal profiles are excluded: they were removed by staff (the
// animal passed away or transferred elsewhere) and must not inflate the
// "registered" totals. Adopted/closed animals stay in - a cumulative report
// should still count every animal the shelter ever took in.

export async function listAnalyticsAnimals() {
	return db
		.select({
			id: animals.id,
			name: animals.name,
			publicId: animals.publicId,
			type: animals.type,
			status: animals.status,
			vaccinationStatus: animals.vaccinationStatus,
			medicallyCleared: animals.medicallyCleared,
			createdAt: animals.createdAt,
		})
		.from(animals)
		.where(isNull(animals.deletedAt));
}

export async function listAnalyticsRescueReports() {
	return db
		.select({
			status: rescueReports.status,
			urgency: rescueReports.urgency,
			source: rescueReports.source,
			createdAt: rescueReports.createdAt,
		})
		.from(rescueReports);
}

export async function listAnalyticsAdoptionApplications() {
	return db
		.select({
			animalId: adoptionApplications.animalId,
			status: adoptionApplications.status,
			createdAt: adoptionApplications.createdAt,
		})
		.from(adoptionApplications);
}

export async function listAnalyticsDonations() {
	return db
		.select({
			amountCents: donations.amountCents,
			paymentMethod: donations.paymentMethod,
			status: donations.status,
			createdAt: donations.createdAt,
		})
		.from(donations);
}