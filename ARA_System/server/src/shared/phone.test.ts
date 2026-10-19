import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	FIJI_COUNTRY_CODE,
	FIJI_PHONE_ERROR,
	formatFijiPhone,
	isValidFijiPhone,
	normalizeFijiPhone,
} from "./phone.js";

describe("Fiji reporter phone helpers", () => {
	it("normalizes typed and pasted Fiji formats to the 7 national digits", () => {
		assert.equal(FIJI_COUNTRY_CODE, "679");
		assert.equal(normalizeFijiPhone("9900000"), "9900000");
		assert.equal(normalizeFijiPhone("990 0000"), "9900000");
		assert.equal(normalizeFijiPhone("6799900000"), "9900000");
		assert.equal(normalizeFijiPhone("+679 990 0000"), "9900000");
		assert.equal(normalizeFijiPhone("+6799900000"), "9900000");
	});

	it("rejects other country codes and invalid lengths", () => {
		assert.equal(normalizeFijiPhone("+61 412 345 678"), null);
		assert.equal(normalizeFijiPhone("+1 212 555 1234"), null);
		assert.equal(normalizeFijiPhone("990000"), null);
		assert.equal(normalizeFijiPhone("99000000"), null);
		assert.equal(normalizeFijiPhone("call me"), null);
		assert.equal(normalizeFijiPhone(""), null);
	});

	it("validates a Fiji number", () => {
		assert.equal(isValidFijiPhone("9900000"), true);
		assert.equal(isValidFijiPhone("+679 990 0000"), true);
		assert.equal(isValidFijiPhone("+679 99000"), false);
		assert.equal(isValidFijiPhone(""), false);
	});

	it("formats the canonical stored value and exposes the shared message", () => {
		assert.equal(formatFijiPhone("9900000"), "+679 9900000");
		assert.equal(FIJI_PHONE_ERROR, "Enter a valid 7-digit Fiji phone number.");
	});
});
