import test from "node:test";
import assert from "node:assert/strict";

import {
	assembleAnalytics,
	parseReportRange,
	rangeStart,
	type AnalyticsInput,
} from "./reports.service.js";

// Fixed reference date so window assertions are deterministic regardless of
// when the test runs. 2026-09-19 UTC.
const NOW = new Date(Date.UTC(2026, 8, 19));

function baseInput(): AnalyticsInput {
	return {
		range: "all",
		animals: [],
		rescueReports: [],
		adoptionApplications: [],
		donations: [],
	};
}

test("parseReportRange accepts the four supported ranges", () => {
	assert.equal(parseReportRange("30d"), "30d");
	assert.equal(parseReportRange("90d"), "90d");
	assert.equal(parseReportRange("12m"), "12m");
	assert.equal(parseReportRange("all"), "all");
});

test("parseReportRange rejects unknown ranges", () => {
	assert.equal(parseReportRange("7d"), null);
	assert.equal(parseReportRange(undefined), null);
	assert.equal(parseReportRange("ALL"), null);
	assert.equal(parseReportRange(""), null);
});

test("rangeStart subtracts the right window", () => {
	assert.equal(rangeStart("all", NOW), null);
	const start30 = rangeStart("30d", NOW);
	const start90 = rangeStart("90d", NOW);
	const start12 = rangeStart("12m", NOW);
	assert.ok(start30);
	assert.ok(start90);
	assert.ok(start12);
	assert.equal(start30.getTime(), Date.UTC(2026, 7, 20));
	assert.equal(start90.getTime(), Date.UTC(2026, 5, 21));
	// 12 months back stays the same day, year flipped.
	assert.equal(start12.getTime(), Date.UTC(2025, 8, 19));
});

test("assembleAnalytics summarises animal snapshots over full history", () => {
	const input = baseInput();
	input.animals = [
		{
			id: "a1",
			name: "Rex",
			publicId: "SPCA-1",
			type: "dog",
			status: "medically_cleared",
			vaccinationStatus: "vaccinated",
			medicallyCleared: true,
			createdAt: new Date(Date.UTC(2026, 3, 2)),
		},
		{
			id: "a2",
			name: "Milo",
			publicId: "SPCA-2",
			type: "cat",
			status: "adopted",
			vaccinationStatus: "not_vaccinated",
			medicallyCleared: false,
			createdAt: new Date(Date.UTC(2026, 8, 5)),
		},
	];

	const report = assembleAnalytics(input, NOW);

	assert.equal(report.animals.total, 2);
	assert.deepEqual(report.animals.byStatus, {
		medically_cleared: 1,
		adopted: 1,
	});
	assert.deepEqual(report.animals.byType, { dog: 1, cat: 1 });
	assert.equal(report.animals.vaccinated, 1);
	assert.equal(report.animals.notVaccinated, 1);
	assert.equal(report.animals.medicallyCleared, 1);
});

test("assembleAnalytics trends only count rows inside the window", () => {
	const input = baseInput();
	input.range = "30d";
	input.animals = [
		{
			id: "a1",
			name: "Rex",
			publicId: "SPCA-1",
			type: "dog",
			status: "intake",
			vaccinationStatus: "not_vaccinated",
			medicallyCleared: false,
			// 40 days before NOW: outside the 30-day window.
			createdAt: new Date(Date.UTC(2026, 7, 10)),
		},
		{
			id: "a2",
			name: "Milo",
			publicId: "SPCA-2",
			type: "cat",
			status: "intake",
			vaccinationStatus: "not_vaccinated",
			medicallyCleared: false,
			// 5 days before NOW: inside the window.
			createdAt: new Date(Date.UTC(2026, 8, 14)),
		},
	];

	const report = assembleAnalytics(input, NOW);

	// The snapshot still counts every animal ever registered.
	assert.equal(report.animals.total, 2);
	// The trend only includes the registration inside the window.
	assert.deepEqual(report.animals.trend, [{ label: "2026-09", value: 1 }]);
});

test("donations only count completed payments in the window", () => {
	const input = baseInput();
	input.range = "90d";
	input.donations = [
		{
			amountCents: 5000,
			paymentMethod: "card",
			status: "completed",
			createdAt: new Date(Date.UTC(2026, 7, 1)),
		},
		{
			amountCents: 8000,
			paymentMethod: "qr",
			status: "completed",
			createdAt: new Date(Date.UTC(2026, 7, 15)),
		},
		{
			amountCents: 9999,
			paymentMethod: "card",
			status: "failed",
			createdAt: new Date(Date.UTC(2026, 7, 20)),
		},
		{
			amountCents: 100,
			paymentMethod: "card",
			status: "completed",
			createdAt: new Date(Date.UTC(2025, 1, 1)),
		},
	];

	const report = assembleAnalytics(input, NOW);

	assert.equal(report.donations.total, 2);
	assert.equal(report.donations.totalCents, 13000);
	assert.deepEqual(report.donations.byMethod, { card: 1, qr: 1 });
	// The trend is the per-month income sum (cents).
	assert.deepEqual(report.donations.trend, [{ label: "2026-08", value: 13000 }]);
});

test("adoption applications per-animal list is joined and high to low", () => {
	const input = baseInput();
	input.range = "all";
	input.animals = [
		{
			id: "a1",
			name: "Rex",
			publicId: "SPCA-1",
			type: "dog",
			status: "intake",
			vaccinationStatus: "not_vaccinated",
			medicallyCleared: false,
			createdAt: new Date(Date.UTC(2026, 1, 1)),
		},
		{
			id: "a2",
			name: "Milo",
			publicId: "SPCA-2",
			type: "cat",
			status: "intake",
			vaccinationStatus: "not_vaccinated",
			medicallyCleared: false,
			createdAt: new Date(Date.UTC(2026, 1, 1)),
		},
	];
	input.adoptionApplications = [
		{ animalId: "a1", status: "approved", createdAt: new Date(Date.UTC(2026, 2, 3)) },
		{ animalId: "a1", status: "rejected", createdAt: new Date(Date.UTC(2026, 3, 4)) },
		{ animalId: "a1", status: "under_review", createdAt: new Date(Date.UTC(2026, 4, 5)) },
		{ animalId: "a2", status: "submitted", createdAt: new Date(Date.UTC(2026, 2, 7)) },
	];

	const report = assembleAnalytics(input, NOW);

	assert.equal(report.adoptions.total, 4);
	assert.deepEqual(report.adoptions.byStatus, {
		approved: 1,
		rejected: 1,
		under_review: 1,
		submitted: 1,
	});
	assert.deepEqual(report.adoptions.perAnimal, [
		{ animalId: "a1", name: "Rex", publicId: "SPCA-1", applications: 3 },
		{ animalId: "a2", name: "Milo", publicId: "SPCA-2", applications: 1 },
	]);
});