import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { apiErrorHandler } from "./errorHandler.js";

// Pure middleware tests: no HTTP server, database or Clerk. The handler takes
// only `error`, a request it ignores, a response and `next`, so a minimal fake
// response is enough to observe exactly what a caller would receive.

interface Captured {
	status?: number;
	body?: unknown;
}

function invoke(error: unknown): Captured {
	const captured: Captured = {};
	const response = {
		status(code: number) {
			captured.status = code;
			return response;
		},
		json(body: unknown) {
			captured.body = body;
			return response;
		},
	} as unknown as Response;

	apiErrorHandler(error, {} as Request, response, (() => {}) as unknown as NextFunction);
	return captured;
}

// The 500 path logs the real error, which would spam the test output.
function withoutConsoleError<T>(run: () => T): { value: T; logged: unknown[] } {
	const original = console.error;
	const logged: unknown[] = [];
	console.error = (...args: unknown[]) => {
		logged.push(...args);
	};
	try {
		return { value: run(), logged };
	} finally {
		console.error = original;
	}
}

describe("apiErrorHandler", () => {
	it("reports malformed JSON as 400, not 500", () => {
		// body-parser's shape for a body it could not parse.
		const captured = invoke({
			status: 400,
			statusCode: 400,
			type: "entity.parse.failed",
			expose: true,
			message: "Unexpected token b in JSON at position 1",
		});

		assert.equal(captured.status, 400);
		assert.deepEqual(captured.body, { error: "Unexpected token b in JSON at position 1" });
	});

	it("honours statusCode when status is absent", () => {
		const captured = invoke({ statusCode: 401, message: "Missing required webhook headers" });

		assert.equal(captured.status, 401);
		assert.deepEqual(captured.body, { error: "Missing required webhook headers" });
	});

	it("falls back to a generic message for a client error with no message", () => {
		const captured = invoke({ status: 400 });

		assert.equal(captured.status, 400);
		assert.deepEqual(captured.body, { error: "Invalid request" });
	});

	it("treats a blank message as missing", () => {
		const captured = invoke({ status: 403, message: "   " });

		assert.equal(captured.status, 403);
		assert.deepEqual(captured.body, { error: "Invalid request" });
	});

	it("keeps a genuine failure at 500 and logs its details", () => {
		const { value: captured, logged } = withoutConsoleError(() => invoke(new Error("connection refused")));

		assert.equal(captured.status, 500);
		assert.deepEqual(captured.body, { error: "Internal server error" });
		assert.equal(logged.length, 2, "expected the prefix and the error itself");
	});

	it("does not leak a thrown 5xx status or message to the caller", () => {
		const { value: captured } = withoutConsoleError(() =>
			invoke({ status: 503, message: "upstream secret detail" }),
		);

		assert.equal(captured.status, 500, "a 5xx stays a 500");
		assert.deepEqual(captured.body, { error: "Internal server error" });
	});

	it("survives a non-object throw", () => {
		const { value: captured } = withoutConsoleError(() => invoke("just a string"));

		assert.equal(captured.status, 500);
		assert.deepEqual(captured.body, { error: "Internal server error" });
	});
});
