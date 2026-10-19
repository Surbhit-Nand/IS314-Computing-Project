import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FIJI_LOCATION_ERROR, isInFiji } from "./fijiLocation.js";

// Mirrors the server-side suite (server/src/shared/location.test.ts) so a drift
// between the two boundary copies or the message string fails the build.
describe("Fiji location validation (frontend)", () => {
  it("accepts mainland and outer-island locations", () => {
    assert.equal(isInFiji(-18.1418, 178.4419), true); // Suva
    assert.equal(isInFiji(-16.7771, 179.9869), true); // Taveuni, west of 180
    assert.equal(isInFiji(-16.8, -179.95), true); // Taveuni, east of 180
    assert.equal(isInFiji(-12.4803, 177.0709), true); // Rotuma
    assert.equal(isInFiji(-20.65, -178.72), true); // Ono-i-Lau
  });

  it("rejects locations outside Fiji, such as China", () => {
    assert.equal(isInFiji(39.9042, 116.4074), false); // Beijing
    assert.equal(isInFiji(31.2304, 121.4737), false); // Shanghai
    assert.equal(isInFiji(-13.8333, -171.7667), false); // Apia, Samoa
    assert.equal(isInFiji(-33.8688, 151.2093), false); // Sydney
  });

  it("ships the exact message shown to reporters", () => {
    assert.equal(
      FIJI_LOCATION_ERROR,
      "Please select a location within Fiji. Rescue alerts are only available for animals located in Fiji.",
    );
  });
});
