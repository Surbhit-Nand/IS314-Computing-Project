import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
process.env.CLERK_SECRET_KEY = "test-clerk-secret-key";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/isolated_test_only";
const [{ synchronizeVeterinaryAlerts, listVeterinarianRecipients }, { veterinaryAlertChanges }, notificationService] = await Promise.all([
  import("./veterinaryAlerts.service.js"), import("./veterinaryAlerts.middleware.js"),
  import("./notifications.service.js"),
]);
const db = new PGlite();
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", C = "33333333-3333-4333-8333-333333333333";
const sync = (recipients = ["vet-a", "vet-b"]) => db.transaction((tx) => synchronizeVeterinaryAlerts((text, values) => tx.query(text, values), recipients));
const notifications = async () => (await db.query<{ id: string; recipient_clerk_user_id: string; type: string; title: string; body: string; read_at: Date | null; entity_id: string }>("SELECT * FROM notifications ORDER BY recipient_clerk_user_id,created_at")).rows;
before(async () => {
  await db.exec(`CREATE TABLE animals(id uuid PRIMARY KEY,veterinary_priority text,status text DEFAULT 'intake',medically_cleared boolean DEFAULT false,deleted_at timestamptz);
    CREATE TABLE audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_clerk_user_id text NOT NULL,action text NOT NULL,entity_type text NOT NULL,entity_id text NOT NULL,metadata jsonb,created_at timestamptz DEFAULT now());
    CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recipient_clerk_user_id text NOT NULL,type text NOT NULL DEFAULT 'adoption.status_changed',title text NOT NULL,body text,entity_type text,entity_id text,read_at timestamptz,created_at timestamptz DEFAULT now());`);
  for (const file of ["0020_veterinary_emergency_responses.sql"]) await db.exec(readFileSync(new URL(`../../db/migrations/${file}`, import.meta.url), "utf8"));
});
beforeEach(async () => {
  await db.exec("TRUNCATE notifications,audit_logs,veterinary_emergency_responses,animals CASCADE");
  await db.query("INSERT INTO animals(id,veterinary_priority) VALUES ($1,'critical'),($2,'critical'),($3,'high')", [A, B, C]);
});
after(async () => { await db.close(); });

describe("Existing support notifications without extra clinical assessments", () => {
  it("does not create assistance alerts from mere registration or refresh", async () => {
    await sync(); await sync(); assert.equal((await notifications()).length, 0);
  });
  it("deduplicates support requests and preserves read state on repeated sync", async () => {
    await db.query("INSERT INTO veterinary_emergency_responses(animal_id,attending_veterinarian_clerk_user_id,support_required,updated_by_clerk_user_id) VALUES ($1,'vet-a',true,'vet-a')",[A]);
    await Promise.all([sync(),sync()]);
    const rows=await notifications();assert.equal(rows.length,2);assert(rows.every(row=>row.type==='veterinary.emergency.support'));
    await db.exec("UPDATE notifications SET read_at=now()");await sync();assert((await notifications()).every(row=>row.read_at));
    await db.query("UPDATE veterinary_emergency_responses SET support_required=false WHERE animal_id=$1",[A]);await sync();
    assert((await notifications()).every(row=>row.type==='veterinary.emergency.resolved'));
  });
  it("closes responses only when the animal leaves active Critical care", async () => {
    await db.query("INSERT INTO veterinary_emergency_responses(animal_id,attending_veterinarian_clerk_user_id,updated_by_clerk_user_id) VALUES ($1,'vet-a','vet-a')",[A]);
    await sync();assert.equal((await db.query("SELECT * FROM veterinary_emergency_responses WHERE closed_at IS NULL")).rows.length,1);
    await db.query("UPDATE animals SET medically_cleared=true WHERE id=$1",[A]);await sync();
    assert.equal((await db.query("SELECT * FROM veterinary_emergency_responses WHERE closed_at IS NULL")).rows.length,0);
    assert.equal((await db.query("SELECT * FROM audit_logs WHERE action='veterinary_emergency_closed'")).rows.length,1);
  });
  it("leaves ordinary adoption notification history unchanged", async () => {
    await db.exec("INSERT INTO notifications(recipient_clerk_user_id,type,title,body,entity_type,entity_id,read_at) VALUES ('public-user','adoption.status_changed','Application approved','Original message','adoption_application','application-id',now())");
    const before=await notifications();await sync();assert.deepEqual(await notifications(),before);
  });
});

it("scopes existing inbox reads and counts to the user and verified veterinary access", async () => {
  for (const veterinaryAccess of [false, true]) {
    const result = await notificationService.listMyNotifications("signed-in-user", {
      access: async (id) => { assert.equal(id, "signed-in-user"); return veterinaryAccess; },
      find: async (id, limit, vet) => { assert.equal(id, "signed-in-user"); assert.equal(limit, 30); assert.equal(vet, veterinaryAccess); return []; },
      count: async (id, vet) => { assert.equal(id, "signed-in-user"); assert.equal(vet, veterinaryAccess); return 0; },
    });
    assert.deepEqual(result, { items: [], unreadCount: 0 });
  }
});

it("paginates Clerk users and includes only active authorized veterinarian accounts", async () => {
  const users = Array.from({ length: 105 }, (_, i) => ({ id: `user-${i}`, publicMetadata: { role: i === 101 || i === 3 ? "veterinarian" : i === 5 ? "dispatcher" : "staff" }, banned: i === 3 }));
  const offsets: number[] = [];
  const recipients = await listVeterinarianRecipients(async (offset) => { offsets.push(offset); return { data: users.slice(offset, offset + 100), totalCount: users.length }; });
  assert.deepEqual(offsets, [0, 100]); assert.deepEqual(recipients, ["user-101"]);
});

it("triggers only from successful backend writes, never queue or notification polling", async () => {
  let calls = 0;
  const app = express(); app.use(veterinaryAlertChanges(async () => { calls++; }));
  app.get("/api/veterinary/queue", (_req, res) => res.json([]));
  app.get("/api/notifications/mine", (_req, res) => res.json({ items: [], unreadCount: 0 }));
  app.post("/api/veterinary/emergency-responses/test", (_req, res) => res.status(201).json({ ok: true }));
  app.post("/api/veterinary/denied", (_req, res) => res.sendStatus(403));
  const server = createServer(app); await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string"); const origin = `http://127.0.0.1:${address.port}`;
    for (const path of ["/api/veterinary/queue", "/api/veterinary/queue", "/api/notifications/mine"]) await fetch(origin + path);
    assert.equal(calls, 0);
    await fetch(origin + "/api/veterinary/denied", { method: "POST" }); assert.equal(calls, 0);
    await fetch(origin + "/api/veterinary/emergency-responses/test", { method: "POST" }); assert.equal(calls, 1);
  } finally { await new Promise<void>((done) => server.close(() => done())); }
});
