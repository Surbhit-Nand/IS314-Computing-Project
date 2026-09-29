import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { notificationTargetView } from "./notificationTargets.js";

describe("notificationTargetView", () => {
	it("routes each entity type to its tracking page", () => {
		assert.equal(notificationTargetView("adoption_application"), "my-applications");
		assert.equal(notificationTargetView("rescue_report"), "my-reports");
		assert.equal(notificationTargetView("vet_appointment"), "vet-appointments");
	});

	it("falls back to the user dashboard for unknown types", () => {
		assert.equal(notificationTargetView(null), "user-dashboard");
		assert.equal(notificationTargetView(undefined), "user-dashboard");
		assert.equal(notificationTargetView("something_new"), "user-dashboard");
	});
});
