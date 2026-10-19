import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

process.env.CLERK_SECRET_KEY = "test-clerk-secret-key";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/isolated_test_only";
const [emergency, { createEmergencyStore }, alerts] = await Promise.all([
  import("../veterinary/emergency.service.js"), import("../veterinary/emergency.repository.js"), import("./veterinaryAlerts.service.js"),
]);
const db = new PGlite();
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const transaction: import("../veterinary/emergency.repository.js").EmergencyTransaction = (work) =>
  db.transaction((tx) => work(createEmergencyStore((sql, values) => tx.query(sql, values))));
const deps = { transaction, recipients: async () => ["vet-a", "vet-b", "vet-b"], name: async (id: string) => id === "vet-a" ? "Dr Maya" : "Dr Ravi" };
async function attend(id: string, actor: string, recipients = deps.recipients) {
  const previous = await transaction((store) => store.openResponse(id));
  return emergency.coordinateEmergencyWithAssistance(id, { action: "attend",
    responseId: previous?.id ?? null, version: previous?.version ?? null }, actor, { ...deps, recipients });
}
const notifications = async () => (await db.query<{ recipient_clerk_user_id: string; body: string; type: string; id: string; read_at: Date | null }>(
  "SELECT * FROM notifications WHERE type='veterinary.emergency.assistance' ORDER BY recipient_clerk_user_id")).rows;
before(async () => {
  await db.exec(`CREATE TABLE animals(id uuid PRIMARY KEY,name text,public_id text,veterinary_priority text DEFAULT 'critical',
    status text DEFAULT 'intake',medically_cleared boolean DEFAULT false,deleted_at timestamptz);
    CREATE TABLE audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_clerk_user_id text NOT NULL,action text NOT NULL,
      entity_type text NOT NULL,entity_id text NOT NULL,metadata jsonb,created_at timestamptz DEFAULT now());
    CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recipient_clerk_user_id text NOT NULL,type text NOT NULL,
      title text NOT NULL,body text,entity_type text,entity_id text,read_at timestamptz,created_at timestamptz DEFAULT now());`);
  for (const file of ["0020_veterinary_emergency_responses.sql"]) await db.exec(readFileSync(new URL(`../../db/migrations/${file}`, import.meta.url), "utf8"));
});
beforeEach(async () => {
  await db.exec("TRUNCATE veterinary_emergency_responses,notifications,audit_logs,animals CASCADE");
  await db.query("INSERT INTO animals(id,name,public_id) VALUES ($1,'Max','SPCA-MAX'),($2,'Bella','SPCA-BELLA')", [A, B]);
});
after(() => db.close());

it("one available vet can attend a Critical animal without claiming assistance is coming", async () => {
  const response = await attend(A, "vet-a", async () => ["vet-a"]);
  assert.ok("assistanceAlert" in response);
  assert.equal(response.assistanceAlert.status, "no_other_vets");
  assert.equal(response.attendingVeterinarianClerkUserId, "vet-a");
  assert.equal((await notifications()).length, 0);
});
it("notifies only other vets, naming attended and waiting Critical animals", async () => {
  const response = await attend(A, "vet-a");
  assert.ok("assistanceAlert" in response);
  assert.deepEqual(response.assistanceAlert, { status: "sent", recipientCount: 1, waitingAnimalIds: [B] });
  const rows = await notifications();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].recipient_clerk_user_id, "vet-b");
  assert.match(rows[0].body, /Dr Maya confirmed attendance for Max/);
  assert.match(rows[0].body, /Bella.*Critical.*awaiting a veterinarian/);
  assert.doesNotMatch(rows[0].body, /treatment area/);
});
it("both Critical cases retain priority; attending the remaining animal resolves the request", async () => {
  await attend(A, "vet-a");
  assert.match((await notifications())[0].body, /Bella.*Critical/);
  const second = await attend(B, "vet-b");
  assert.ok("assistanceAlert" in second); assert.equal(second.assistanceAlert.status, "not_needed");
  assert.equal((await notifications()).length, 0);
  assert.equal((await db.query("SELECT * FROM notifications WHERE type='veterinary.emergency.resolved'")).rows.length, 1);
  assert.deepEqual((await db.query("SELECT DISTINCT veterinary_priority FROM animals")).rows, [{ veterinary_priority: "critical" }]);
});
it("concurrent claims have one winner and cannot duplicate notification delivery", async () => {
  const action = { action: "attend" as const, responseId: null, version: null };
  const results = await Promise.allSettled(["vet-a", "vet-b"].map((actor) => emergency.coordinateEmergencyWithAssistance(A, action, actor, deps)));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await notifications()).length, 1);
  assert.equal((await db.query("SELECT * FROM veterinary_emergency_responses")).rows.length, 1);
});
it("refreshing alerts does not duplicate or re-open read assistance notifications", async () => {
  await attend(A, "vet-a");
  const initial = (await notifications())[0];
  await db.query("UPDATE notifications SET read_at=now() WHERE id=$1", [initial.id]);
  for (let i = 0; i < 3; i++) await db.transaction((tx) => alerts.synchronizeVeterinaryAlerts((sql, values) => tx.query(sql, values), ["vet-a", "vet-b"]));
  assert.equal((await notifications()).length, 1);
  assert.equal((await notifications())[0].id, initial.id);
  assert.ok((await notifications())[0].read_at);
  assert.match((await notifications())[0].body, /Dr Maya confirmed attendance for Max/);
});
it("a genuinely new episode preserves the previous notification and sends a new one", async () => {
  await attend(A, "vet-a"); await attend(B, "vet-b");
  await db.exec("UPDATE animals SET medically_cleared=true");
  await db.transaction((tx) => alerts.synchronizeVeterinaryAlerts((sql, values) => tx.query(sql, values), ["vet-a", "vet-b"]));
  await db.exec("UPDATE animals SET medically_cleared=false");
  await attend(A, "vet-a");
  assert.equal((await notifications()).length, 1);
  assert.equal((await db.query("SELECT * FROM notifications")).rows.length, 2);
});
it("directory outages are reported, and notification write failure rolls attendance back", async () => {
  const response = await attend(A, "vet-a", async () => { throw new Error("Directory unavailable"); });
  assert.ok("assistanceAlert" in response);
  assert.equal(response.assistanceAlert.status, "unavailable");
  assert.equal((await notifications()).length, 0);
  await db.exec("DROP TABLE notifications");
  await assert.rejects(attend(B, "vet-b"));
  assert.equal((await transaction((store) => store.openResponse(B))), undefined);
  await db.exec(`CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recipient_clerk_user_id text NOT NULL,type text NOT NULL,
    title text NOT NULL,body text,entity_type text,entity_id text,read_at timestamptz,created_at timestamptz DEFAULT now())`);
});
it("rejects inactive and non-Critical claims", async () => {
  await db.query("UPDATE animals SET veterinary_priority='high' WHERE id=$1", [A]);
  await assert.rejects(attend(A, "vet-a"), { status: 409 });
  await db.query("UPDATE animals SET medically_cleared=true WHERE id=$1", [B]);
  await assert.rejects(attend(B, "vet-b"), { status: 409 });
});
it("recipient directory excludes all unauthorized, banned and locked accounts", async () => {
  const ids = await alerts.listVeterinarianRecipients(async () => ({ totalCount: 6, data: [
    { id: "vet-a", publicMetadata: { role: "veterinarian" } }, { id: "vet-b", publicMetadata: { role: "veterinarian" } },
    { id: "staff", publicMetadata: { role: "staff" } }, { id: "admin", publicMetadata: { role: "admin" } },
    { id: "banned", publicMetadata: { role: "veterinarian" }, banned: true }, { id: "locked", publicMetadata: { role: "veterinarian" }, locked: true },
  ] }));
  await attend(A, "vet-a", async () => ids);
  assert.deepEqual((await notifications()).map((row) => row.recipient_clerk_user_id), ["vet-b"]);
});
