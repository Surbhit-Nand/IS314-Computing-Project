import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/isolated_test_only";
process.env.CLERK_SECRET_KEY = "test-clerk-secret-key";
const { publishAnimalProfile, saveAnimalListingDraft } = await import("./animalPublication.service.js");
const { synchronizePublicationNotifications } = await import("../notifications/animalPublication.service.js");
const migration = new URL("../../db/migrations/0028_animal_publication_review.sql", import.meta.url);
const id = "11111111-1111-4111-8111-111111111111";

async function fixture() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE animals(id uuid PRIMARY KEY,name text NOT NULL,description text,
    behaviour text DEFAULT 'Gentle and playful with a calm personality.',veterinary_priority text,rescue_history text DEFAULT 'Rescued and cared for by the shelter team.',search_embedding text,
    photo_urls jsonb NOT NULL DEFAULT '[]',medically_cleared boolean DEFAULT false,
    status text DEFAULT 'intake',deleted_at timestamptz,updated_at timestamptz DEFAULT now());
    CREATE TABLE audit_logs(actor_clerk_user_id text,action text,entity_type text,entity_id text,metadata jsonb);
    CREATE TABLE notifications(recipient_clerk_user_id text,type text,title text,body text,entity_type text,entity_id text,read_at timestamptz);
    CREATE TABLE medical_history(animal_id uuid REFERENCES animals(id),notes text);
    INSERT INTO animals(id,name,description,photo_urls,medically_cleared) VALUES
      ('${id}','Milo','A gentle companion who enjoys quiet walks.','["https://example.com/milo.jpg"]',true);
    INSERT INTO medical_history VALUES ('${id}','Original examination retained');`);
  // Only the new additive migration, only in this disposable in-memory DB.
  await db.exec(readFileSync(migration, "utf8"));
  const transaction: typeof import("../../db/transaction.js").withSqlTransaction = (work) =>
    db.transaction((tx) => work((text, values) => tx.query(text, values)));
  return { db, transaction, access: async () => true };
}

it("additive migration preserves existing public animals, keeps new animals private, and preserves medical records", async () => {
  const { db } = await fixture();
  try {
    assert((await db.query<{ published_at: string | null }>("SELECT published_at FROM animals")).rows[0].published_at);
    await db.exec("INSERT INTO animals(id,name) VALUES (gen_random_uuid(),'New intake')");
    assert.equal((await db.query<{ published_at: string | null }>("SELECT published_at FROM animals WHERE name='New intake'")).rows[0].published_at, null);
    assert.equal((await db.query<{ notes: string }>("SELECT notes FROM medical_history")).rows[0].notes, "Original examination retained");
  } finally { await db.close(); }
});

it("publishes the same cleared profile once, records staff approval, and retires its review notifications", async () => {
  const deps = await fixture();
  try {
    await deps.db.exec("UPDATE animals SET published_at=NULL");
    await deps.transaction((query) => synchronizePublicationNotifications(query, ["staff", "staff", "manager"], id));
    await deps.transaction((query) => synchronizePublicationNotifications(query, ["staff", "manager"], id));
    assert.equal((await deps.db.query("SELECT * FROM notifications")).rows.length, 2);
    const result = await publishAnimalProfile(id, "staff", deps);
    assert.equal(result.id, id);
    assert(result.publishedAt);
    await publishAnimalProfile(id, "staff", deps);
    assert.equal((await deps.db.query("SELECT * FROM animals")).rows.length, 1);
    assert.equal((await deps.db.query("SELECT * FROM audit_logs")).rows.length, 1);
    assert.equal((await deps.db.query("SELECT * FROM notifications WHERE read_at IS NULL")).rows.length, 0);
    assert.equal((await deps.db.query("SELECT * FROM medical_history")).rows.length, 1);
  } finally { await deps.db.close(); }
});

it("denies ordinary users before any database operation", async () => {
  await assert.rejects(publishAnimalProfile(id, "owner", {
    access: async () => false,
    transaction: async () => { throw new Error("Must not open a transaction"); },
  }), (error: unknown) => (error as { status: number }).status === 403);
});

it("blocks uncleared, adopted, closed, deleted, and incomplete profiles", async () => {
  const deps = await fixture();
  try {
    const changes = ["medically_cleared=false", "status='adopted'", "status='closed'", "deleted_at=now()", "description=' '", "behaviour=' '", "rescue_history=' '", "photo_urls='[]'", "photo_urls='[\"javascript:alert(1)\"]'"];
    for (const change of changes) {
      await deps.db.exec("UPDATE animals SET published_at=NULL,medically_cleared=true,status='intake',deleted_at=NULL,description='A gentle companion who enjoys quiet walks.',behaviour='Gentle and playful with a calm personality.',rescue_history='Rescued and cared for by the shelter team.',photo_urls='[\"https://example.com/milo.jpg\"]'");
      await deps.db.exec(`UPDATE animals SET ${change}`);
      await assert.rejects(publishAnimalProfile(id, "staff", deps), (error: unknown) => (error as { status: number }).status === 409);
      assert.equal((await deps.db.query<{ published_at: string | null }>("SELECT published_at FROM animals")).rows[0].published_at, null);
    }
    assert.equal((await deps.db.query("SELECT * FROM audit_logs")).rows.length, 0);
  } finally { await deps.db.close(); }
});

it("rolls back publication when its audit cannot be saved", async () => {
  const deps = await fixture();
  try {
    await deps.db.exec("UPDATE animals SET published_at=NULL; DROP TABLE audit_logs");
    await assert.rejects(publishAnimalProfile(id, "staff", deps));
    assert.equal((await deps.db.query<{ published_at: string | null }>("SELECT published_at FROM animals")).rows[0].published_at, null);
  } finally { await deps.db.close(); }
});

it("new snapshot adds only the publication column and preserves predecessor constraints and indices", () => {
  const parent = JSON.parse(readFileSync(new URL("../../db/migrations/meta/0027_snapshot.json", import.meta.url), "utf8"));
  const child = JSON.parse(readFileSync(new URL("../../db/migrations/meta/0028_snapshot.json", import.meta.url), "utf8"));
  assert.equal(child.prevId, parent.id);
  assert.notEqual(child.id, parent.id);
  delete child.tables["public.animals"].columns.published_at;
  child.id = parent.id; child.prevId = parent.prevId;
  assert.deepEqual(child, parent);
  assert.doesNotMatch(readFileSync(migration, "utf8"), /\b(DROP|DELETE|TRUNCATE)\b/i);
});

it("saves an unfinished listing without requiring or overwriting internal intake fields", async () => {
  const deps = await fixture();
  try {
    await deps.db.exec("UPDATE animals SET published_at=NULL");
    const input = { description: "A draft", behaviour: "", photoUrls: [] as string[], veterinaryPriority: "routine", rescueHistory: "A staff-written rescue journey draft", publishedAt: new Date() };
    await saveAnimalListingDraft(id, "staff", input, { ...deps, refreshEmbedding: async () => false });
    const [animal] = (await deps.db.query<Record<string, unknown>>("SELECT * FROM animals")).rows;
    assert.equal(animal.description, "A draft");
    assert.equal(animal.published_at, null);
    assert.equal(animal.veterinary_priority, null);
    assert.equal(animal.rescue_history, input.rescueHistory);
    assert.equal(animal.medically_cleared, true);
    assert.equal((await deps.db.query("SELECT * FROM medical_history")).rows.length, 1);
    await assert.rejects(publishAnimalProfile(id, "staff", deps));
  } finally { await deps.db.close(); }
});

it("does not allow a draft save to break a public listing or bypass staff authorisation", async () => {
  const deps = await fixture();
  try {
    const input = { description: "", behaviour: "", rescueHistory: "", photoUrls: [] as string[] };
    await assert.rejects(saveAnimalListingDraft(id, "staff", input, { ...deps, refreshEmbedding: async () => false }), /before publishing/);
    await assert.rejects(saveAnimalListingDraft(id, "owner", input, { ...deps, access: async () => false, refreshEmbedding: async () => false }), (error: unknown) => (error as { status: number }).status === 403);
    const [animal] = (await deps.db.query<{ description: string }>("SELECT description FROM animals")).rows;
    assert.equal(animal.description, "A gentle companion who enjoys quiet walks.");
  } finally { await deps.db.close(); }
});

it("keeps an empty rescue journey as a draft, then publishes the manually entered journey", async () => {
  const deps = await fixture();
  try {
    await deps.db.exec("UPDATE animals SET published_at=NULL");
    const input = { description: "A gentle companion who enjoys quiet walks.", behaviour: "Gentle and playful with a calm personality.", photoUrls: ["https://example.com/milo.jpg"], rescueHistory: "" };
    const draftDeps = { ...deps, refreshEmbedding: async () => false };
    await saveAnimalListingDraft(id, "staff", input, draftDeps);
    await assert.rejects(publishAnimalProfile(id, "staff", deps), /Rescue history is required/);
    await assert.rejects(saveAnimalListingDraft(id, "staff", { ...input, rescueHistory: "x".repeat(1001) }, draftDeps));
    input.rescueHistory = "Found near the village and brought to the shelter for care.";
    await saveAnimalListingDraft(id, "staff", input, draftDeps);
    assert((await publishAnimalProfile(id, "staff", deps)).publishedAt);
    assert.equal((await deps.db.query<{ rescue_history: string }>("SELECT rescue_history FROM animals")).rows[0].rescue_history, input.rescueHistory);
  } finally { await deps.db.close(); }
});
