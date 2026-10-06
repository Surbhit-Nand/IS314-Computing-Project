import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { retryTransient } from "./retry.js";

// Run: npm test (glob covers server/src/**/*.test.ts). Pure unit tests, no
// database - timing assertions use generous bounds so CI slowness never flakes.
describe("retryTransient", () => {
	it("passes through a first-try success without delay", async () => {
		const started = Date.now();
		const result = await retryTransient(async () => "ok");
		assert.equal(result, "ok");
		assert.ok(Date.now() - started < 200);
	});

	it("retries transient failures then returns the success", async () => {
		let calls = 0;
		const result = await retryTransient(
			async () => {
				calls += 1;
				if (calls < 3) throw new TypeError("fetch failed");
				return "recovered";
			},
			{ attempts: 3, baseDelayMs: 10 },
		);
		assert.equal(result, "recovered");
		assert.equal(calls, 3);
	});

	it("rethrows the last error after exhausting attempts", async () => {
		let calls = 0;
		await assert.rejects(
			retryTransient(
				async () => {
					calls += 1;
					throw new TypeError("fetch failed");
				},
				{ attempts: 3, baseDelayMs: 10 },
			),
			/TypeError: fetch failed/,
		);
		assert.equal(calls, 3);
	});

	it("never retries non-transient errors", async () => {
		let calls = 0;
		const validationError = Object.assign(new Error("bad request"), { status: 400 });
		await assert.rejects(
			retryTransient(async () => {
				calls += 1;
				throw validationError;
			}),
			/bad request/,
		);
		assert.equal(calls, 1);
	});

	it("retries 503 but not 403", async () => {
		let unavailableCalls = 0;
		await assert.rejects(
			retryTransient(
				async () => {
					unavailableCalls += 1;
					throw Object.assign(new Error("overloaded"), { status: 503 });
				},
				{ attempts: 2, baseDelayMs: 10 },
			),
		);
		assert.equal(unavailableCalls, 2);

		let forbiddenCalls = 0;
		await assert.rejects(
			retryTransient(async () => {
				forbiddenCalls += 1;
				throw Object.assign(new Error("denied"), { status: 403 });
			}),
		);
		assert.equal(forbiddenCalls, 1);
	});
});
