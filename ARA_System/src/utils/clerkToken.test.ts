import test from "node:test";
import assert from "node:assert/strict";
import { getFreshClerkToken } from "./clerkToken.js";

test("getFreshClerkToken refreshes the session before protected requests", async () => {
  let calledWith: { forceRefresh?: boolean } | undefined;

  const getToken = async (options?: { forceRefresh?: boolean }) => {
    calledWith = options;
    return "fresh-token";
  };

  const token = await getFreshClerkToken(getToken);

  assert.equal(token, "fresh-token");
  assert.deepEqual(calledWith, { forceRefresh: true });
});
