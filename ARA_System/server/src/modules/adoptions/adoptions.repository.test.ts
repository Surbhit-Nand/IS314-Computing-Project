import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

process.env.CLERK_SECRET_KEY = "test-clerk-secret-key";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/ara_test";

const { db } = await import("../../db/client.js");
const { findActiveAdoptionApplication } = await import("./adoptions.repository.js");
// Imported only so this test can pin the repository's closed-status list to the
// lifecycle definition. The repository itself cannot import the service (the
// service already imports the repository), so the invariant is asserted here.
const { ADOPTION_STATUSES, ALLOWED_TRANSITIONS } = await import("./adoptions.service.js");

// Execute the real Drizzle builder, intercepting only the transport. This checks
// the actual SQL and bound parameters without a live database or module mocking
// (see the same pattern in animals.repository.test.ts). It exists because the
// service suite stubs findActiveAdoptionApplication away, so the duplicate-
// application predicate itself was never asserted anywhere.
let queries: { sql: string; params: unknown[] }[] = [];
beforeEach(() => {
	queries = [];
	mock.method(db.$client, "query", async (sql: string, params: unknown[]) => {
		queries.push({ sql, params });
		return { rows: [] };
	});
});
afterEach(() => mock.restoreAll());

describe("active adoption application predicate", () => {
	it("treats rejected, completed and withdrawn applications as closed", async () => {
		await findActiveAdoptionApplication("animal-id", "applicant-id");
		const { sql, params } = queries[0];

		// Only live statuses may block a new application. A withdrawn one was
		// cancelled by the applicant themselves, so leaving it out of this list
		// would silently lock them out of re-applying for that animal forever.
		const notIn = sql.match(/"status" not in \(([^)]+)\)/);
		assert.ok(notIn, `Expected a status NOT IN clause in: ${sql}`);
		// Read the bound values by their placeholder numbers rather than by
		// position: the LIMIT placeholder is bound after the status list.
		const excluded = notIn[1]
			.split(",")
			.map((placeholder) => params[Number(placeholder.trim().replace("$", "")) - 1]);
		assert.deepEqual([...excluded].sort(), ["completed", "rejected", "withdrawn"]);

		// The two active statuses that must still block a duplicate.
		for (const live of ["submitted", "under_review", "approved"]) {
			assert.ok(!excluded.includes(live), `${live} must not be treated as closed`);
		}
	});

	it("keeps the closed-status list exactly the terminal statuses of the lifecycle", async () => {
		// The bug this guards: the query listed "rejected" and "completed" only,
		// so a withdrawn application blocked re-applying for ever. Deriving the
		// expectation from ALLOWED_TRANSITIONS stops a new terminal status being
		// added (or removed) without updating the duplicate check.
		const terminal = ADOPTION_STATUSES.filter((status) => ALLOWED_TRANSITIONS[status].length === 0);

		await findActiveAdoptionApplication("animal-id", "applicant-id");
		const { sql, params } = queries[0];
		const notIn = sql.match(/"status" not in \(([^)]+)\)/);
		assert.ok(notIn, `Expected a status NOT IN clause in: ${sql}`);
		const excluded = notIn[1]
			.split(",")
			.map((placeholder) => params[Number(placeholder.trim().replace("$", "")) - 1]);

		assert.deepEqual([...excluded].sort(), [...terminal].sort());
	});

	it("scopes the check to one animal and one applicant", async () => {
		await findActiveAdoptionApplication("animal-id", "applicant-id");
		const { sql, params } = queries[0];

		assert.match(sql, /"animal_id" = \$\d+/);
		assert.match(sql, /"applicant_clerk_user_id" = \$\d+/);
		assert.ok(params.includes("animal-id"));
		assert.ok(params.includes("applicant-id"));
		assert.match(sql, /limit \$\d+$/);
	});
});
