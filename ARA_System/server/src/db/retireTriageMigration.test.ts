import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";

const folder = new URL("./migrations/", import.meta.url);
const cleanup = readFileSync(new URL("0021_remove_rapid_triage.sql", folder), "utf8");
async function fixture() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE animals(id uuid PRIMARY KEY);
    CREATE TABLE audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),metadata jsonb);
    INSERT INTO animals VALUES ('11111111-1111-4111-8111-111111111111');
    INSERT INTO audit_logs(metadata) VALUES ('{"preserved":true}');`);
  for (const file of ["0019_rapid_triage.sql", "0020_veterinary_emergency_responses.sql"]) await db.exec(readFileSync(new URL(file, folder), "utf8"));
  await db.exec(`INSERT INTO veterinary_triage_assessments(animal_id,clinical_stability,intervention_urgency,condition_trend,performed_by_clerk_user_id)
    VALUES ('11111111-1111-4111-8111-111111111111','unstable','immediate_intervention','deteriorating','isolated-vet');
    INSERT INTO veterinary_emergency_responses(animal_id,updated_by_clerk_user_id) VALUES ('11111111-1111-4111-8111-111111111111','isolated-vet');`);
  return db;
}
it("prepares the pending cleanup migration with the exact installed journal/hash conventions", () => {
  const journal = JSON.parse(
    readFileSync(new URL("meta/_journal.json", folder), "utf8"),
  ) as { entries: { idx: number; version: string; when: number; tag: string }[] };
  // Locate the cleanup by tag rather than by position: later migrations may queue
  // behind it while it stays unapproved. It must remain the only guarded
  // destructive step, and every later entry must still be strictly newer.
  const index = journal.entries.findIndex((entry) => entry.tag === "0021_remove_rapid_triage");
  assert(index > 0, "0021_remove_rapid_triage must be present in the journal");
  const previous = journal.entries[index - 1], current = journal.entries[index];
  assert.equal(previous.tag, "0020_veterinary_emergency_responses");
  assert.equal(current.idx, previous.idx + 1); assert.equal(current.version, previous.version);
  assert(current.when > previous.when); assert.equal(current.tag, "0021_remove_rapid_triage");
  for (const entry of journal.entries.slice(index + 1)) {
    assert(entry.idx > current.idx); assert(entry.when > current.when);
  }
  const migrations = readMigrationFiles({ migrationsFolder: "server/src/db/migrations" });
  const cleanupMigration = migrations.find((migration) => migration.folderMillis === current.when);
  assert.equal(cleanupMigration?.hash, createHash("sha256").update(cleanup).digest("hex"));
  assert.equal(cleanupMigration?.sql.length, 1);
});
it("refuses unapproved cleanup and leaves all assessment records intact", async () => {
  const db = await fixture();
  try {
    await assert.rejects(db.exec(cleanup), /not approved/);
    assert.equal((await db.query("SELECT * FROM veterinary_triage_assessments")).rows.length, 1);
    await db.exec("SET ara.approve_rapid_triage_removal='on'; SET ara.approved_rapid_triage_row_count='0'");
    await assert.rejects(db.exec(cleanup), /count changed/);
    assert.equal((await db.query("SELECT * FROM veterinary_triage_assessments")).rows.length, 1);
  } finally { await db.close(); }
});
it("removes only approved obsolete objects on isolated PostgreSQL", async () => {
  const db = await fixture();
  try {
    await db.exec("SET ara.approve_rapid_triage_removal='on'; SET ara.approved_rapid_triage_row_count='1'");
    await db.exec(cleanup);
    assert.equal((await db.query<{ name: string | null }>("SELECT to_regclass('public.veterinary_triage_assessments') AS name")).rows[0].name, null);
    assert.equal((await db.query("SELECT * FROM pg_type WHERE typname LIKE 'triage_%'")).rows.length, 0);
    for (const table of ["animals", "veterinary_emergency_responses", "audit_logs"]) assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length, 1);
  } finally { await db.close(); }
});
it("unexpected dependencies abort cleanup atomically instead of cascading into other records", async () => {
  const db = await fixture();
  try {
    await db.exec("CREATE TABLE protected_reference(id uuid REFERENCES veterinary_triage_assessments(id)); SET ara.approve_rapid_triage_removal='on'; SET ara.approved_rapid_triage_row_count='1'");
    await assert.rejects(db.exec(cleanup), { code: "2BP01" });
    assert.equal((await db.query("SELECT * FROM veterinary_triage_assessments")).rows.length, 1);
    assert.equal((await db.query("SELECT * FROM pg_type WHERE typname IN ('triage_clinical_stability','triage_intervention_urgency','triage_condition_trend','triage_emergency_finding')")).rows.length, 4);
  } finally { await db.close(); }
});
