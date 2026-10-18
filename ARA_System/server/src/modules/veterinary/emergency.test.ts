import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import express from "express";

process.env.CLERK_SECRET_KEY = "test-clerk-secret-key";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/isolated_test_only";
const [{ createEmergencyStore }, service, { createEmergencyRouter }] = await Promise.all([
  import("./emergency.repository.js"), import("./emergency.service.js"), import("./emergency.routes.js"),
]);
type Transaction = import("./emergency.repository.js").EmergencyTransaction;
type Response = import("./emergency.repository.js").EmergencyResponse;
type Action = import("./emergency.service.js").EmergencyAction;
const db = new PGlite();
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const transaction: Transaction = (work) => db.transaction(async (tx) => work(createEmergencyStore((sql, values) => tx.query(sql, values))));
const expectation = (response?: Response) => ({ responseId: response?.id ?? null, version: response?.version ?? null });
const attend = (animalId = A, actor = "vet-a", response?: Response) =>
  service.coordinateEmergency(animalId, { ...expectation(response), action: "attend" }, actor, transaction);
const action = (input: Action, actor = "vet-a") => service.coordinateEmergency(A, input, actor, transaction);
const { closeInactiveEmergencyResponses } = await import("./emergency.lifecycle.js");

before(async () => {
  await db.exec(`CREATE TABLE animals (id uuid PRIMARY KEY, name text, veterinary_priority text DEFAULT 'critical', status text DEFAULT 'intake', medically_cleared boolean DEFAULT false, deleted_at timestamptz);
    CREATE TABLE audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_clerk_user_id text NOT NULL,
    action text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL, metadata jsonb, created_at timestamptz DEFAULT now());`);
  await db.exec(readFileSync(new URL("../../db/migrations/0020_veterinary_emergency_responses.sql", import.meta.url), "utf8"));
});
beforeEach(async () => {
  await db.exec("TRUNCATE veterinary_emergency_responses, audit_logs, animals CASCADE");
  await db.query("INSERT INTO animals(id,name) VALUES ($1,'Animal A'),($2,'Animal B')", [A, B]);
});
after(async () => { await db.close(); });

describe("Emergency coordination on isolated PostgreSQL", () => {
  it("supports two Critical animals attended by different vets without changing priority", async () => {
    const a = await attend();
    const b = await attend(B, "vet-b");
    assert.equal(a.attendingVeterinarianClerkUserId, "vet-a");
    assert.equal(b.attendingVeterinarianClerkUserId, "vet-b");
    assert.deepEqual((await db.query("SELECT DISTINCT veterinary_priority FROM animals")).rows, [{ veterinary_priority: "critical" }]);
  });
  it("allows only one winner when two vets claim simultaneously", async () => {
    const results = await Promise.allSettled([attend(A, "vet-a"), attend(A, "vet-b")]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const failed = results.find((r) => r.status === "rejected");
    assert.ok(failed?.status === "rejected" && failed.reason.status === 409);
    assert.equal((await db.query("SELECT * FROM veterinary_emergency_responses WHERE closed_at IS NULL")).rows.length, 1);
    assert.equal((await db.query("SELECT * FROM audit_logs")).rows.length, 1);
  });
  it("releases ownership without closing the episode and permits another vet to attend", async () => {
    const initial = await attend();
    const released = await action({ ...expectation(initial), action: "release" });
    assert.equal(released.attendingVeterinarianClerkUserId, null);
    assert.equal(released.closedAt, null);
    const next = await attend(A, "vet-b", released);
    assert.equal(next.id, initial.id);
    assert.equal(next.attendingVeterinarianClerkUserId, "vet-b");
  });
  it("requires confirmed handoffs and audits old and new veterinarians", async () => {
    const initial = await attend();
    const input = { ...expectation(initial), action: "take_over" as const, handoffConfirmed: true as const, note: "Agreed handoff; monitor breathing" };
    assert.equal(service.emergencyActionSchema.safeParse({ ...input, handoffConfirmed: false }).success, false);
    assert.equal(service.emergencyActionSchema.safeParse({ ...input, note: " " }).success, false);
    const next = await action(input, "vet-b");
    assert.equal(next.attendingVeterinarianClerkUserId, "vet-b");
    const [{ metadata }] = (await db.query<{ metadata: Record<string, unknown> }>("SELECT metadata FROM audit_logs WHERE action='veterinary_emergency_take_over'")).rows;
    assert.equal(metadata.previousVeterinarian, "vet-a");
    assert.equal(metadata.attendingVeterinarian, "vet-b");
    assert.equal(metadata.note, input.note);
  });
  it("rejects competing takeovers and stale support writes", async () => {
    const initial = await attend();
    const input = { ...expectation(initial), action: "take_over" as const, handoffConfirmed: true as const, note: "Agreed handoff" };
    const results = await Promise.allSettled([action(input, "vet-b"), action(input, "vet-c")]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    await assert.rejects(action({ ...expectation(initial), action: "support", supportRequired: true, note: "Assist" }), { status: 409 });
  });
  it("records support requests; only the owner may release or change support", async () => {
    const initial = await attend();
    await assert.rejects(action({ ...expectation(initial), action: "support", supportRequired: true, note: " " }), { status: 400 });
    await assert.rejects(action({ ...expectation(initial), action: "release" }, "vet-b"), { status: 403 });
    const supported = await action({ ...expectation(initial), action: "support", supportRequired: true, note: "Need a second vet for stabilization" });
    assert.equal(supported.supportRequired, true);
    const listed = await service.getEmergencyResponses({ list: async () => [supported], resolveNames: async () => new Map([["vet-a", "Vet Maya"]]) });
    assert.equal(listed[0].attendingVeterinarianName, "Vet Maya");
    assert.equal(listed[0].coordinationNote, supported.coordinationNote);
    const fallback = await service.getEmergencyResponses({ list: async () => [supported], resolveNames: async () => { throw new Error("Clerk unavailable"); } });
    assert.equal(fallback[0].attendingVeterinarianClerkUserId, "vet-a");
    assert.match(fallback[0].attendingVeterinarianName!, /name unavailable/);
  });
  it("rejects inactive or non-Critical animals without any additional assessment", async () => {
    await db.query("UPDATE animals SET veterinary_priority='high' WHERE id=$1", [A]);
    await assert.rejects(attend(), { status: 409 });
    await assert.rejects(attend(A, ""), { status: 401 });
  });
  it("closes and audits an episode on leaving Critical care and starts fresh on return", async () => {
    const initial = await attend();
    await db.query("UPDATE animals SET veterinary_priority='high' WHERE id=$1", [A]);
    await db.transaction((tx) => closeInactiveEmergencyResponses((text, values) => tx.query(text, values)));
    const closed = (await db.query<{ closed_at: Date; attending_veterinarian_clerk_user_id: string | null; version: number }>("SELECT * FROM veterinary_emergency_responses WHERE id=$1", [initial.id])).rows[0];
    assert.ok(closed.closed_at); assert.equal(closed.attending_veterinarian_clerk_user_id, null); assert.equal(closed.version, 2);
    await db.query("UPDATE animals SET veterinary_priority='critical' WHERE id=$1", [A]);
    const next = await attend(A, "vet-b");
    assert.notEqual(next.id, initial.id); assert.equal(next.attendingVeterinarianClerkUserId, "vet-b");
    assert.equal((await db.query("SELECT * FROM veterinary_emergency_responses")).rows.length, 2);
    await assert.rejects(attend(A, "vet-c", initial), { status: 409 });
    assert.equal((await db.query("SELECT * FROM audit_logs WHERE action='veterinary_emergency_closed'")).rows.length, 1);
  });
  it("closes on medical clearance, adoption, soft deletion, or closed status", async () => {
    for (const change of ["medically_cleared=true", "status='adopted'", "deleted_at=now()", "status='closed'"]) {
      await db.exec("TRUNCATE veterinary_emergency_responses,audit_logs");
      await db.query("UPDATE animals SET medically_cleared=false,status='intake',deleted_at=null WHERE id=$1", [A]);
      await attend(); await db.query(`UPDATE animals SET ${change} WHERE id=$1`, [A]);
      await db.transaction((tx) => closeInactiveEmergencyResponses((text, values) => tx.query(text, values)));
      assert.equal(await transaction((store) => store.openResponse(A)), undefined);
    }
  });
  it("rolls an animal update and episode closure back together when the transaction fails", async () => {
    const response = await attend();
    await assert.rejects(db.transaction(async (tx) => {
      await tx.query("UPDATE animals SET medically_cleared=true WHERE id=$1", [A]);
      await closeInactiveEmergencyResponses((text, values) => tx.query(text, values));
      throw new Error("Simulated write failure");
    }), /Simulated write failure/);
    assert.equal((await db.query<{ medically_cleared: boolean }>("SELECT medically_cleared FROM animals WHERE id=$1", [A])).rows[0].medically_cleared, false);
    const unchanged = await transaction((store) => store.openResponse(A));
    assert.equal(unchanged?.id, response.id); assert.equal(unchanged?.version, response.version);
    assert.equal(unchanged?.attendingVeterinarianClerkUserId, "vet-a");
    assert.equal((await db.query("SELECT * FROM audit_logs WHERE action='veterinary_emergency_closed'")).rows.length, 0);
  });
  it("enforces the partial unique index and closed-unassigned check", async () => {
    await attend();
    await assert.rejects(db.query("INSERT INTO veterinary_emergency_responses(animal_id,updated_by_clerk_user_id) VALUES ($1,'vet-b')", [A]), { code: "23505" });
    await assert.rejects(db.query("UPDATE veterinary_emergency_responses SET closed_at=now() WHERE animal_id=$1", [A]), { code: "23514" });
  });
  it("rolls back ownership when auditing fails", async () => {
    const broken: Transaction = (work) => db.transaction((tx) => work({ ...createEmergencyStore((text, values) => tx.query(text, values)), audit: async () => { throw new Error("audit failed"); } }));
    await assert.rejects(service.coordinateEmergency(A, { ...expectation(), action: "attend" }, "vet-a", broken), /audit failed/);
    assert.equal((await db.query("SELECT * FROM veterinary_emergency_responses")).rows.length, 0);
  });
});

it("protects coordination routes, validates input, and uses the authenticated actor", async () => {
  const app = express(); app.use(express.json());
  app.use("/api/veterinary/emergency-responses", createEmergencyRouter({
    authenticate: (request, response, next) => { if (!request.header("authorization")) { response.status(401).json({ error: "Sign in" }); return; } request.clerkUserId = "vet-a"; next(); },
    authorize: (request, response, next) => { if (request.header("authorization") !== "Bearer vet") { response.status(403).json({ error: "Vet only" }); return; } next(); },
    list: () => service.getEmergencyResponses({ list: async () => [], resolveNames: async () => new Map() }),
    coordinate: (id, input, actor) => service.coordinateEmergency(id, input, actor, transaction),
  }));
  const server = createServer(app);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/api/veterinary/emergency-responses`;
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { Authorization: "Bearer staff" } })).status, 403);
    const post = (body: unknown) => fetch(`${url}/${A}`, { method: "POST", headers: { Authorization: "Bearer vet", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await post({ ...expectation(), action: "attend", actor: "spoofed" })).status, 400);
    const result = await post({ ...expectation(), action: "attend" });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).attendingVeterinarianClerkUserId, "vet-a");
    assert.equal((await post({ ...expectation(), action: "attend" })).status, 409);
  } finally { await new Promise<void>((done) => server.close(() => done())); }
});
