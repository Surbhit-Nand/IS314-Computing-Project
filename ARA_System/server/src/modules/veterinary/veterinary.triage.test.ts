import assert from "node:assert/strict";
import { createServer } from "node:http";
import { beforeEach, describe, it } from "node:test";
import express, { type RequestHandler } from "express";
import type { veterinaryTriageAssessments } from "../../db/schema.js";
import type { createTriageAssessment } from "./veterinary.repository.js";
import type { RapidTriageAssessmentInput } from "./veterinary.validation.js";

process.env.CLERK_SECRET_KEY = "test-clerk-secret-key";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/ara_test";

const [
	{ getLatestRapidTriageAssessment, getRapidTriageHistory, recordRapidTriageAssessment },
	{ createRapidTriageRouter },
	{ rapidTriageAssessmentSchema },
] = await Promise.all([
	import("./veterinary.service.js"),
	import("./veterinary.routes.js"),
	import("./veterinary.validation.js"),
]);

type Assessment = typeof veterinaryTriageAssessments.$inferSelect;
type AssessmentInsert = Parameters<typeof createTriageAssessment>[0];

const ANIMAL_ID = "11111111-1111-4111-8111-111111111111";
const BASE_ASSESSMENT = {
	id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
	animalId: ANIMAL_ID,
	clinicalStability: "currently_stable",
	interventionUrgency: "urgent_evaluation",
	conditionTrend: "unchanged",
	emergencyFindings: [],
	notes: "Initial assessment",
	performedByClerkUserId: "vet-user",
	assessedAt: new Date("2026-10-13T10:00:00Z"),
} satisfies Assessment;

const VALID_INPUT = {
	clinicalStability: "currently_stable",
	interventionUrgency: "urgent_evaluation",
	conditionTrend: "unchanged",
	emergencyFindings: [],
	notes: "Initial assessment",
} satisfies RapidTriageAssessmentInput;

let animalExists: boolean;
let assessments: Assessment[];
let insertedAssessments: AssessmentInsert[];

function assessment(overrides: Partial<Assessment> = {}): Assessment {
	return { ...BASE_ASSESSMENT, ...overrides };
}

function triageDependencies() {
	return {
		findAnimal: async (animalId: string) => animalExists && animalId === ANIMAL_ID ? { id: animalId } : undefined,
		createAssessment: async (input: AssessmentInsert) => {
			insertedAssessments.push(input);
			const saved = assessment({
				...input,
				id: `assessment-${insertedAssessments.length}`,
				assessedAt: new Date(`2026-10-13T10:${String(insertedAssessments.length * 10).padStart(2, "0")}:00Z`),
			});
			assessments.push(saved);
			return saved;
		},
		findLatestAssessment: async (animalId: string) =>
			assessments.filter((item) => item.animalId === animalId).sort((a, b) => b.assessedAt.getTime() - a.assessedAt.getTime())[0],
		listAssessments: async (animalId: string) =>
			assessments
				.filter((item) => item.animalId === animalId)
				.sort((a, b) => a.assessedAt.getTime() - b.assessedAt.getTime()),
	};
}

const authenticate: RequestHandler = (request, _response, next) => {
	request.clerkUserId = "authenticated-veterinarian";
	next();
};

const authorizeVeterinarian: RequestHandler = (request, response, next) => {
	if (request.header("x-test-role") !== "veterinarian") {
		response.status(403).json({ error: "Veterinarian access is required" });
		return;
	}
	next();
};

async function requestTriageRoute(
	method: "POST" | "GET",
	path: string,
	options: { role?: string; body?: unknown; submit?: typeof recordRapidTriageAssessment },
) {
	const app = express();
	app.use(express.json());
	app.use("/animals/:animalId/triage", createRapidTriageRouter({
		authenticate,
		authorizeVeterinarian,
		submitAssessment: options.submit,
	}));
	const server = createServer(app);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");

	try {
		const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
			method,
			headers: {
				...(options.role ? { "x-test-role": options.role } : {}),
				...(method === "POST" ? { "content-type": "application/json" } : {}),
			},
			...(method === "POST" ? { body: JSON.stringify(options.body) } : {}),
		});
		return { status: response.status, body: await response.json() as unknown };
	} finally {
		await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
	}
}

beforeEach(() => {
	animalExists = true;
	assessments = [];
	insertedAssessments = [];
});

describe("Rapid Triage backend", () => {
	it("saves a new assessment with the authenticated veterinarian identity", async () => {
		const saved = await recordRapidTriageAssessment(ANIMAL_ID, VALID_INPUT, "vet-123", triageDependencies());

		assert.equal(saved.animalId, ANIMAL_ID);
		assert.equal(saved.performedByClerkUserId, "vet-123");
		assert.deepEqual(insertedAssessments[0], {
			animalId: ANIMAL_ID,
			clinicalStability: VALID_INPUT.clinicalStability,
			interventionUrgency: VALID_INPUT.interventionUrgency,
			conditionTrend: VALID_INPUT.conditionTrend,
			emergencyFindings: [],
			notes: VALID_INPUT.notes,
			performedByClerkUserId: "vet-123",
		});
		assert.equal("assessedAt" in insertedAssessments[0], false);
	});

	it("rejects assessment values outside the allowed vocabularies", async () => {
		const result = rapidTriageAssessmentSchema.safeParse({
			...VALID_INPUT,
			clinicalStability: "critical",
		});
		assert.equal(result.success, false);

		const response = await requestTriageRoute("POST", `/animals/${ANIMAL_ID}/triage`, {
			role: "veterinarian",
			body: { ...VALID_INPUT, conditionTrend: "worsening" },
			submit: async () => {
				throw new Error("Invalid input reached the submit handler");
			},
		});
		assert.equal(response.status, 400);
	});

	it("rejects unauthorized submissions before invoking the submit operation", async () => {
		let submitted = false;
		const response = await requestTriageRoute("POST", `/animals/${ANIMAL_ID}/triage`, {
			role: "staff",
			body: VALID_INPUT,
			submit: async () => {
				submitted = true;
				throw new Error("Unauthorized submission reached the handler");
			},
		});

		assert.equal(response.status, 403);
		assert.equal(submitted, false);
	});

	it("retrieves the latest assessment for an animal", async () => {
		const earlier = assessment();
		const latest = assessment({
			id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			conditionTrend: "deteriorating",
			assessedAt: new Date("2026-10-13T10:15:00Z"),
		});
		assessments = [earlier, latest];

		assert.equal((await getLatestRapidTriageAssessment(ANIMAL_ID, triageDependencies()))?.id, latest.id);
	});

	it("returns assessment history in chronological order", async () => {
		const newest = assessment({ assessedAt: new Date("2026-10-13T10:20:00Z") });
		const oldest = assessment({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", assessedAt: new Date("2026-10-13T10:00:00Z") });
		const middle = assessment({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", assessedAt: new Date("2026-10-13T10:15:00Z") });
		assessments = [newest, oldest, middle];

		assert.deepEqual(
			(await getRapidTriageHistory(ANIMAL_ID, triageDependencies())).map((item) => item.assessedAt.toISOString()),
			["2026-10-13T10:00:00.000Z", "2026-10-13T10:15:00.000Z", "2026-10-13T10:20:00.000Z"],
		);
	});

	it("returns no latest assessment and empty history for animals without assessments", async () => {
		const dependencies = triageDependencies();
		assert.equal(await getLatestRapidTriageAssessment(ANIMAL_ID, dependencies), undefined);
		assert.deepEqual(await getRapidTriageHistory(ANIMAL_ID, dependencies), []);
	});

	it("preserves prior assessments when an animal is reassessed", async () => {
		await recordRapidTriageAssessment(ANIMAL_ID, VALID_INPUT, "vet-123", triageDependencies());
		await recordRapidTriageAssessment(ANIMAL_ID, {
			...VALID_INPUT,
			clinicalStability: "unstable",
			interventionUrgency: "immediate_intervention",
			conditionTrend: "deteriorating",
		}, "vet-456", triageDependencies());

		assert.equal(insertedAssessments.length, 2);
		assert.equal(assessments.length, 2);
		assert.equal((await getLatestRapidTriageAssessment(ANIMAL_ID, triageDependencies()))?.performedByClerkUserId, "vet-456");
	});

	it("refuses to submit an assessment when the animal does not exist", async () => {
		animalExists = false;
		await assert.rejects(
			recordRapidTriageAssessment(ANIMAL_ID, VALID_INPUT, "vet-123", triageDependencies()),
			{ message: "Animal not found" },
		);
		assert.equal(insertedAssessments.length, 0);
	});
});
