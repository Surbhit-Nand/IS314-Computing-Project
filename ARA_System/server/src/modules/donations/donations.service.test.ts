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
  });

  assert.equal(result.amountCents, 2500);
  assert.equal(result.currency, "USD");
  assert.equal(result.donorName, "Alex");
  assert.equal(result.donorEmail, "alex@example.com");
  assert.equal(result.message, "For the animals");
});

test("normalizeDonationInput rejects invalid amounts", () => {
  assert.throws(() => normalizeDonationInput({ amountCents: 0 }), /amount/i);
});
