import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchAccountSummary } from "./accountSummary";

test("account summary reflects five owned animals and a booking cancellation", async (context) => {
  let status = "booked";
  const animals = Array.from({ length: 5 }, (_, index) => ({ id: `animal-${index}`, name: `Companion ${index}` }));
  context.mock.method(globalThis, "fetch", async (url: string) => {
    const path = new URL(url).pathname;
    if (path === "/api/adoptions/mine") return Response.json([{ id: "application", status: "under_review", animal: animals[0], updatedAt: new Date().toISOString() }]);
    if (path === "/api/rescue/mine") return Response.json([]);
    if (path === "/api/my-animals/") return Response.json(animals);
    const animal = animals.find((entry) => path.endsWith(entry.id));
    assert.ok(animal);
    return Response.json({ animal, appointments: animal.id === "animal-0" ? [
      { id: "booking", animalId: animal.id, status, appointmentDate: new Date(Date.now() + 86400000).toISOString(), createdAt: new Date().toISOString() },
      { id: "old", animalId: animal.id, status: "booked", appointmentDate: "2020-01-01T00:00:00Z", createdAt: "2020-01-01T00:00:00Z" },
    ] : [] });
  });
  const before = await fetchAccountSummary("test-token");
  assert.equal(before.animals, 5);
  assert.equal(before.applications, 1);
  assert.equal(before.pending, 1);
  assert.equal(before.reports, 0);
  assert.equal(before.upcoming?.length, 1);
  assert.equal(before.incomplete, false);
  status = "cancelled";
  const after = await fetchAccountSummary("test-token");
  assert.equal(after.animals, 5);
  assert.equal(after.upcoming?.length, 0);
  assert.equal(after.activity.find((entry) => entry.id === "appointment-booking")?.status, "cancelled");
});

test("unavailable appointment records do not produce a false zero or hide animal totals", async (context) => {
  context.mock.method(globalThis, "fetch", async (url: string) => {
    const path = new URL(url).pathname;
    if (path === "/api/my-animals/") return Response.json([{ id: "animal", name: "Luna" }]);
    if (path === "/api/my-animals/animal") return Response.json({ error: "Temporarily unavailable" }, { status: 503 });
    return Response.json([]);
  });
  const summary = await fetchAccountSummary("test-token");
  assert.equal(summary.animals, 1);
  assert.equal(summary.upcoming, null);
  assert.equal(summary.incomplete, true);
});
