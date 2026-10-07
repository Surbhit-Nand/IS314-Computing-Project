import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COUNTRY_DIAL_CODES,
  DEFAULT_DIAL_CODE,
  countPhoneDigits,
  dialCodeByCode,
  expectedLengthLabel,
  formatPhone,
  isValidPhoneNational,
} from "./phone.js";

describe("phone helpers", () => {
  it("defaults to Fiji", () => {
    assert.equal(DEFAULT_DIAL_CODE, "679");
    assert.equal(dialCodeByCode("679").iso, "fj");
  });

  it("falls back to Fiji for an unknown code", () => {
    assert.equal(dialCodeByCode("999").iso, "fj");
  });

  it("combines code and number into the stored string", () => {
    assert.equal(formatPhone("679", "9900000"), "+679 9900000");
  });

  it("accepts in-band Fiji numbers and rejects out-of-band ones", () => {
    assert.equal(isValidPhoneNational("9900000", "679"), true);
    assert.equal(isValidPhoneNational("990 0000", "679"), true);
    assert.equal(isValidPhoneNational("123", "679"), false);
    assert.equal(isValidPhoneNational("99000000", "679"), false);
    assert.equal(isValidPhoneNational("call me", "679"), false);
    assert.equal(isValidPhoneNational("", "679"), false);
  });

  it("accepts 5-digit Samoan landlines and 7-digit mobiles", () => {
    assert.equal(isValidPhoneNational("20000", "685"), true);
    assert.equal(isValidPhoneNational("7200000", "685"), true);
    assert.equal(isValidPhoneNational("2000", "685"), false);
  });

  it("enforces the fixed 10-digit NANP plan", () => {
    assert.equal(isValidPhoneNational("2125551234", "1"), true);
    assert.equal(isValidPhoneNational("212555123", "1"), false);
    assert.equal(isValidPhoneNational("12125551234", "1"), false);
  });

  it("labels expected lengths for messages", () => {
    assert.equal(expectedLengthLabel("679"), "6–7 digits");
    assert.equal(expectedLengthLabel("1"), "10 digits");
  });

  it("counts digits for the live counter", () => {
    assert.equal(countPhoneDigits("990 000"), 6);
    assert.equal(countPhoneDigits(""), 0);
  });

  it("ships a curated country set with bands and examples", () => {
    assert.ok(COUNTRY_DIAL_CODES.length >= 10);
    for (const entry of COUNTRY_DIAL_CODES) {
      assert.ok(entry.iso && entry.name && entry.code && entry.example);
      assert.ok(entry.minLength >= 1 && entry.maxLength >= entry.minLength);
      assert.ok(
        isValidPhoneNational(entry.example, entry.code),
        `${entry.iso} example must pass its own band`,
      );
    }
  });
});
