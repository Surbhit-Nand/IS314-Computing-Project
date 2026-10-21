import assert from "node:assert/strict";
import { afterEach, beforeEach, it, mock } from "node:test";
process.env.CLERK_SECRET_KEY = "test-clerk-secret-key";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/isolated_test_only";
const [{ db }, repository, emergency, animals] = await Promise.all([
  import("../../db/client.js"), import("./veterinary.repository.js"), import("./emergency.repository.js"), import("../animals/animals.repository.js"),
]);
let queries: { sql: string; params: unknown[] }[];
let batches: number;
beforeEach(() => {
  queries = []; batches = 0;
  mock.method(db.$client, "query", async (sql: string, params: unknown[]) => { queries.push({ sql, params }); return { rows: [] }; });
  mock.method(db.$client, "transaction", async (items: { queryData: { query: string; params: unknown[] } }[]) => {
    batches++; assert.equal(items.length, 2);
    for (const item of items) queries.push({ sql: item.queryData.query, params: item.queryData.params });
    return items.map(() => ({ rows: [] }));
  });
});
afterEach(() => mock.restoreAll());
it("editing treatment text preserves its status and dates and permits clearing optional fields", async () => {
  await repository.updateCarePlan("care-plan-id", { details: "Updated treatment instructions", medication: "", notes: "" });
  const update = queries[0].sql.split(" where ")[0];
  assert.match(update, /"details" =/);
  assert.match(update, /"medication" =/);
  assert.match(update, /"notes" =/);
  assert.doesNotMatch(update, /"status" =|"scheduled_date" =|"completed_date" =/);
  assert(queries[0].params.includes("care-plan-id"));
  assert(queries[0].params.includes(""));
});
it("queue and coordination queries work with only active animals and their registration priorities", async () => {
  await repository.listMedicalQueue(); await emergency.listOpenEmergencyResponses();
  assert.equal(queries.length, 2);
  assert.match(queries[0].sql, /not in \('adopted','closed'\)/);
  assert.match(queries[0].sql, /when 'critical' then 4/);
  assert.match(queries[1].sql, /"veterinary_emergency_responses"/);
  assert(queries[1].params.includes("critical"));
  assert(queries.every((query) => !query.sql.includes("triage")));
});
it("medical clearance and closure audit use the same transaction-capable HTTP batch", async () => {
  await repository.clearAnimal("animal-id", "signed-in-vet", "Recovered");
  assert.equal(batches, 1); assert.equal(queries.length, 2);
  assert.match(queries[0].sql, /^update "animals"/);
  assert.match(queries[1].sql, /veterinary_emergency_closed/);
  assert(queries[1].params.includes("signed-in-vet"));
});
it("priority edits and soft deletion close old assignments atomically with the animal update", async () => {
  await animals.updateAnimal("animal-id", { veterinaryPriority: "high" });
  await animals.softDeleteAnimal("animal-id");
  assert.equal(batches, 2); assert.equal(queries.length, 4);
  for (const index of [1, 3]) {
    assert.match(queries[index].sql, /veterinary_priority IS DISTINCT FROM 'critical'/);
    assert.match(queries[index].sql, /INSERT INTO audit_logs/);
  }
});
