import test from "node:test";
import assert from "node:assert/strict";

import { normalizeDonationInput } from "./donations.service.js";

test("normalizeDonationInput accepts valid donation payloads", () => {
  const result = normalizeDonationInput({
    amountCents: 2500,
    currency: "USD",
    donorName: " Alex ",
    donorEmail: "alex@example.com",
    message: " For the animals ",
    paymentMethod: "qr",
  });

  assert.equal(result.amountCents, 2500);
  assert.equal(result.currency, "USD");
  assert.equal(result.donorName, "Alex");
  assert.equal(result.donorEmail, "alex@example.com");
  assert.equal(result.message, "For the animals");
  assert.equal(result.paymentMethod, "qr");
});

test("normalizeDonationInput defaults payment method to card", () => {
  const result = normalizeDonationInput({ amountCents: 1000 });
  assert.equal(result.paymentMethod, "card");
});

test("normalizeDonationInput rejects unsupported payment methods", () => {
  assert.throws(
    () => normalizeDonationInput({ amountCents: 1000, paymentMethod: "cash" }),
    /payment method/i,
  );
});

test("normalizeDonationInput rejects invalid amounts", () => {
  assert.throws(() => normalizeDonationInput({ amountCents: 0 }), /amount/i);
});
