import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FIJI_LOCATION_ERROR, isInFiji } from "./location.js";

// The boundary is Fiji's real land outline, so these are the cases that matter:
// main islands + outer islands across the 180th meridian must pass, and foreign
// coordinates anywhere else on Earth must fail - regardless of any address text.
describe("Fiji location validation", () => {
	it("accepts locations on Fiji's main islands", () => {
		assert.equal(isInFiji(-18.1418, 178.4419), true); // Suva
		assert.equal(isInFiji(-17.7765, 177.4356), true); // Nadi
		assert.equal(isInFiji(-17.6167, 177.4667), true); // Lautoka
		assert.equal(isInFiji(-17.6836, 178.8345), true); // Levuka
	});

	it("accepts Fiji's outer islands, including across the 180th meridian", () => {
		assert.equal(isInFiji(-16.4311, 179.3653), true); // Labasa, Vanua Levu
		assert.equal(isInFiji(-16.7771, 179.9869), true); // Taveuni, just west of 180
		assert.equal(isInFiji(-16.8, -179.95), true); // Taveuni's eastern side, west of 180
		assert.equal(isInFiji(-12.4803, 177.0709), true); // Rotuma, far north
		assert.equal(isInFiji(-20.65, -178.72), true); // Ono-i-Lau, far south-east
		assert.equal(isInFiji(-17.24, -178.95), true); // Vanua Balavu, Lau group
		assert.equal(isInFiji(-19.05, 178.25), true); // Kadavu
	});

	it("accepts a pin dropped just off a Fijian beach (territorial water)", () => {
		assert.equal(isInFiji(-18.15, 178.52), true);
	});

	it("rejects locations outside Fiji, such as China", () => {
		assert.equal(isInFiji(39.9042, 116.4074), false); // Beijing
		assert.equal(isInFiji(31.2304, 121.4737), false); // Shanghai
		assert.equal(isInFiji(22.3193, 114.1694), false); // Hong Kong
	});

	it("rejects other countries near and far", () => {
		assert.equal(isInFiji(-33.8688, 151.2093), false); // Sydney
		assert.equal(isInFiji(51.5074, -0.1278), false); // London
		assert.equal(isInFiji(-13.8333, -171.7667), false); // Apia, Samoa
		assert.equal(isInFiji(-21.1394, -175.2049), false); // Nuku'alofa, Tonga
		assert.equal(isInFiji(-17.7333, 168.3167), false); // Port Vila, Vanuatu
		assert.equal(isInFiji(-36.8485, 174.7633), false); // Auckland
		assert.equal(isInFiji(-22.2758, 166.4572), false); // Noumea
	});

	it("rejects non-finite coordinates", () => {
		assert.equal(isInFiji(Number.NaN, 178), false);
		assert.equal(isInFiji(-18, Number.POSITIVE_INFINITY), false);
	});

	it("ships the exact message shown to reporters", () => {
		assert.equal(
			FIJI_LOCATION_ERROR,
			"Please select a location within Fiji. Rescue alerts are only available for animals located in Fiji.",
		);
	});
});
