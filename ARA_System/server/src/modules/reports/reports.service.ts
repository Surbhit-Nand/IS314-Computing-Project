import {
	listAnalyticsAdoptionApplications,
	listAnalyticsAnimals,
	listAnalyticsDonations,
	listAnalyticsRescueReports,
} from "./reports.repository.js";

// Report generation for manager/admin. Pure and unit-testable: the service
// only ever maps already-fetched rows into the report shape, so tests can
// feed it fixture data with no database involved. `buildAnalyticsReport` is
// the single async wrapper that pulls the rows and hands them over.

export type ReportRange = "30d" | "90d" | "12m" | "all";

export const REPORT_RANGES: readonly ReportRange[] = ["30d", "90d", "12m", "all"];

export type ReportPoint = { label: string; value: number };

export type AnalyticsReport = {
	range: ReportRange;
	generatedAt: string;
	animals: {
		total: number;
		byStatus: Record<string, number>;
		byType: Record<string, number>;
		vaccinated: number;
		notVaccinated: number;
		medicallyCleared: number;
		trend: ReportPoint[];
	};
	rescue: {
		total: number;
		byStatus: Record<string, number>;
		byUrgency: Record<string, number>;
		bySource: Record<string, number>;
		trend: ReportPoint[];
	};
	adoptions: {
		total: number;
		byStatus: Record<string, number>;
		trend: ReportPoint[];
		perAnimal: { animalId: string; name: string; publicId: string; applications: number }[];
	};
	donations: {
		total: number;
		totalCents: number;
		byMethod: Record<string, number>;
		trend: ReportPoint[];
	};
};

// Cap on the "most applications per animal" table so the report stays scannable.
const TOP_ANIMALS_LIMIT = 8;

function parseReportRange(value: unknown): ReportRange | null {
	return typeof value === "string" && (REPORT_RANGES as readonly string[]).includes(value)
		? (value as ReportRange)
		: null;
}

// Start of the reporting window. "all" has no lower bound.
function rangeStart(range: ReportRange, now: Date = new Date()): Date | null {
	if (range === "all") return null;
	const start = new Date(now);
	if (range === "30d") start.setDate(start.getDate() - 30);
	else if (range === "90d") start.setDate(start.getDate() - 90);
	else start.setMonth(start.getMonth() - 12);
	return start;
}

// YYYY-MM bucketing in UTC so month boundaries and labels are stable.
function bucketKey(date: Date): string {
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function increment(counts: Map<string, number>, key: string): void {
	counts.set(key, (counts.get(key) ?? 0) + 1);
}

function addAmount(centsByMethod: Map<string, number>, key: string, amountCents: number): void {
	centsByMethod.set(key, (centsByMethod.get(key) ?? 0) + amountCents);
}

function toRecord(counts: Map<string, number>): Record<string, number> {
	return Object.fromEntries(counts);
}

function toPoints(counts: Map<string, number>): ReportPoint[] {
	return [...counts.keys()]
		.sort()
		.map((label) => ({ label, value: counts.get(label) as number }));
}

// Zero-fills months strictly between the first and last observed bucket so
// line charts drop to 0 across quiet months instead of joining a straight
// line over them. Leading/trailing emptiness is deliberately left unfilled:
// a window with no activity at all still yields an empty series, which the
// frontend renders as its "no activity" fallback rather than a flat zero.
// Returns the same map for chaining into toPoints().
function fillInteriorMonths(counts: Map<string, number>): Map<string, number> {
	if (counts.size >= 2) {
		const [first, last] = [...counts.keys()].sort();
		const [firstYear, firstMonth] = first.split("-").map(Number);
		const [lastYear, lastMonth] = last.split("-").map(Number);
		const cursor = new Date(Date.UTC(firstYear, firstMonth - 1, 1));
		const end = new Date(Date.UTC(lastYear, lastMonth - 1, 1));
		while (cursor < end) {
			const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
			if (!counts.has(key)) counts.set(key, 0);
			cursor.setUTCMonth(cursor.getUTCMonth() + 1);
		}
	}
	return counts;
}

// Plain input shapes (structural - mirrors what the repository selects), so
// unit tests can construct fixtures without touching a database.
export type AnalyticsInput = {
	range: ReportRange;
	animals: {
		id: string;
		name: string;
		publicId: string;
		type: string;
		status: string;
		vaccinationStatus: string;
		medicallyCleared: boolean;
		createdAt: Date;
	}[];
	rescueReports: { status: string; urgency: string; source: string; createdAt: Date }[];
	adoptionApplications: { animalId: string; status: string; createdAt: Date }[];
	donations: {
		amountCents: number;
		paymentMethod: string;
		status: string;
		createdAt: Date;
	}[];
};

export function assembleAnalytics(
	input: AnalyticsInput,
	now: Date = new Date(),
): AnalyticsReport {
	const { range, animals } = input;
	const since = rangeStart(range, now);
	// Animals included in a trend bucket: the window filters registrations;
	// the snapshot counts below always run over the full history.
	const inWindow = (createdAt: Date) => since == null || createdAt >= since;

	const animalStatus = new Map<string, number>();
	const animalType = new Map<string, number>();
	let vaccinated = 0;
	let notVaccinated = 0;
	let medicallyCleared = 0;
	const animalTrend = new Map<string, number>();
	for (const animal of animals) {
		increment(animalStatus, animal.status);
		increment(animalType, animal.type);
		if (animal.vaccinationStatus === "vaccinated") vaccinated += 1;
		else notVaccinated += 1;
		if (animal.medicallyCleared) medicallyCleared += 1;
		if (inWindow(animal.createdAt)) increment(animalTrend, bucketKey(animal.createdAt));
	}
	const totalAnimals = animals.length;

	const rescueStatus = new Map<string, number>();
	const rescueUrgency = new Map<string, number>();
	const rescueSource = new Map<string, number>();
	const rescueTrend = new Map<string, number>();
	for (const report of input.rescueReports) {
		if (!inWindow(report.createdAt)) continue;
		increment(rescueStatus, report.status);
		increment(rescueUrgency, report.urgency);
		increment(rescueSource, report.source);
		increment(rescueTrend, bucketKey(report.createdAt));
	}
	const rescueTotal = [...rescueStatus.values()].reduce((sum, count) => sum + count, 0);

	const adoptionStatus = new Map<string, number>();
	const adoptionTrend = new Map<string, number>();
	const perAnimalCounts = new Map<string, number>();
	for (const application of input.adoptionApplications) {
		if (!inWindow(application.createdAt)) continue;
		increment(adoptionStatus, application.status);
		increment(adoptionTrend, bucketKey(application.createdAt));
		increment(perAnimalCounts, application.animalId);
	}
	const adoptionTotal = [...adoptionStatus.values()].reduce((sum, count) => sum + count, 0);

	// Most-active animals by application count within the window, joined to
	// the animal lookup for a readable name/public reference.
	const animalsById = new Map(animals.map((animal) => [animal.id, animal]));
	const perAnimal = [...perAnimalCounts.entries()]
		.map(([animalId, applications]) => {
			const animal = animalsById.get(animalId);
			return {
				animalId,
				name: animal?.name ?? "Unknown animal",
				publicId: animal?.publicId ?? "—",
				applications,
			};
		})
		.sort((a, b) => b.applications - a.applications)
		.slice(0, TOP_ANIMALS_LIMIT);

	const donationMethod = new Map<string, number>();
	const donationTrend = new Map<string, number>();
	let donationTotal = 0;
	let donationTotalCents = 0;
	for (const donation of input.donations) {
		if (!inWindow(donation.createdAt) || donation.status !== "completed") continue;
		donationTotal += 1;
		donationTotalCents += donation.amountCents;
		increment(donationMethod, donation.paymentMethod);
		addAmount(donationTrend, bucketKey(donation.createdAt), donation.amountCents);
	}

	return {
		range,
		generatedAt: new Date().toISOString(),
		animals: {
			total: totalAnimals,
			byStatus: toRecord(animalStatus),
			byType: toRecord(animalType),
			vaccinated,
			notVaccinated,
			medicallyCleared,
			trend: toPoints(fillInteriorMonths(animalTrend)),
		},
		rescue: {
			total: rescueTotal,
			byStatus: toRecord(rescueStatus),
			byUrgency: toRecord(rescueUrgency),
			bySource: toRecord(rescueSource),
			trend: toPoints(fillInteriorMonths(rescueTrend)),
		},
		adoptions: {
			total: adoptionTotal,
			byStatus: toRecord(adoptionStatus),
			trend: toPoints(fillInteriorMonths(adoptionTrend)),
			perAnimal,
		},
		donations: {
			total: donationTotal,
			totalCents: donationTotalCents,
			byMethod: toRecord(donationMethod),
			trend: toPoints(fillInteriorMonths(donationTrend)),
		},
	};
}

// Pull the current rows and assemble the report for the requested range.
export async function buildAnalyticsReport(range: ReportRange): Promise<AnalyticsReport> {
	const [animals, rescueReports, adoptionApplications, donations] = await Promise.all([
		listAnalyticsAnimals(),
		listAnalyticsRescueReports(),
		listAnalyticsAdoptionApplications(),
		listAnalyticsDonations(),
	]);

	return assembleAnalytics({ range, animals, rescueReports, adoptionApplications, donations });
}

export { parseReportRange, rangeStart };