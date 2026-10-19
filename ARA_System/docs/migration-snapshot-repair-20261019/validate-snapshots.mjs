import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { readMigrationFiles } from "drizzle-orm/migrator";

// Never loads project environment files, opens a network connection, invokes
// a migration generator, or executes the pending Rapid Triage cleanup.
const audit = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(audit, "../..");
const folder = path.join(app, "server/src/db/migrations");
const meta = path.join(folder, "meta");
const original = JSON.parse(fs.readFileSync(path.join(audit, "original-sha256.json")));
const workspace = path.resolve(app, "..");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const journalBytes = fs.readFileSync(path.join(meta, "_journal.json"));
const journal = JSON.parse(journalBytes);
const sqlFiles = fs.readdirSync(folder).filter((file) => file.endsWith(".sql")).sort();

function checkImmutable() {
  for (const [file, expected] of Object.entries(original)) {
    if (file.endsWith(".sql") || file.endsWith("/_journal.json")) {
      assert.equal(hash(fs.readFileSync(path.join(workspace, file))), expected, `Immutable file changed: ${file}`);
    }
  }
  assert.deepEqual(sqlFiles, journal.entries.map((entry) => `${entry.tag}.sql`).sort());
  assert.deepEqual(fs.readFileSync(path.join(meta, "_journal.json")), journalBytes);
}
checkImmutable();
assert.equal(journal.entries.length, 22);
assert.equal(new Set(journal.entries.map((entry) => entry.idx)).size, 22);
assert.equal(new Set(journal.entries.map((entry) => entry.tag)).size, 22);
for (let i = 1; i < journal.entries.length; i++) {
  assert(journal.entries[i].when > journal.entries[i - 1].when);
  assert(journal.entries[i].idx > journal.entries[i - 1].idx);
}

// The public Kit API does not export its catalog serializer. Expose the
// installed, pinned serializer in memory only; no package file is modified.
const require = createRequire(import.meta.url);
const kitEntry = require.resolve("drizzle-kit/api");
const kitPackage = JSON.parse(fs.readFileSync(path.join(path.dirname(kitEntry), "package.json")));
assert.equal(kitPackage.version, "0.31.10", "Re-review serializer adapter after a Kit upgrade");
const kitSource = fs.readFileSync(kitEntry, "utf8");
const kitModule = new Module(kitEntry);
kitModule.filename = kitEntry;
kitModule.paths = Module._nodeModulePaths(path.dirname(kitEntry));
kitModule._compile(`${kitSource}
init_pgSerializer(); init_pgSchema();
module.exports.auditIntrospect = fromDatabase;
module.exports.auditValidate = pgSchema;
`, kitEntry);
const kit = kitModule.exports;
const zero = "00000000-0000-0000-0000-000000000000";
function snapshotId(entry) {
  const bytes = crypto.createHash("sha1")
    .update(Buffer.from("b9c25721f77548dc84ff150687a5f606", "hex"))
    .update(`ara:snapshot:v7:${entry.idx}:${entry.tag}:${entry.when}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const snapshotName = (entry) => `${String(entry.idx).padStart(4, "0")}_snapshot.json`;
const sorted = (values) => [...values].sort();
const expression = (value) => String(value).replace(/\s+/g, " ").trim();
function unwrap(value) {
  let text = expression(value);
  // PostgreSQL and Kit may emit different redundant outer parentheses. Only
  // remove a pair that encloses the entire expression; preserve precedence.
  while (text.startsWith("(") && text.endsWith(")")) {
    let depth = 0;
    let quote = null;
    let enclosesAll = true;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quote) {
        if (char === quote) {
          if (text[i + 1] === quote) i++;
          else quote = null;
        }
      } else if (char === "'" || char === '"') quote = char;
      else if (char === "(") depth++;
      else if (char === ")" && --depth === 0 && i !== text.length - 1) { enclosesAll = false; break; }
    }
    if (!enclosesAll || depth !== 0 || quote) break;
    text = text.slice(1, -1).trim();
  }
  return text;
}

async function introspect(db) {
  const { internal: _internal, ...schema } = await kit.auditIntrospect({
    query: async (text, params) => (await db.query(text, params)).rows,
  }, () => true, ["public"]);
  // Kit 0.31.10 assumes array defaults use brace literals. PostgreSQL emits
  // ARRAY[] for our empty enum array, which Kit incorrectly turns into RAY.
  // Preserve the catalog's exact SQL expression rather than guessing a value.
  const arrays = (await db.query(`SELECT c.relname AS table_name, a.attname AS column_name,
    pg_get_expr(d.adbin,d.adrelid) AS default_value
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_type t ON t.oid=a.atttypid
    JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND c.relkind='r' AND t.typelem<>0
      AND a.attnum>0 AND NOT a.attisdropped`)).rows;
  for (const column of arrays) {
    schema.tables[`public.${column.table_name}`].columns[column.column_name].default = column.default_value;
  }
  return schema;
}

// Independent catalog checks cover all tables, columns, ordered enum values,
// indexes, FK targets, uniqueness, checks and primary-key declarations.
async function compareCatalog(db, snapshot) {
  const tables = (await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`)).rows;
  assert.deepEqual(sorted(tables.map((row) => `public.${row.tablename}`)), sorted(Object.keys(snapshot.tables)));
  const columns = (await db.query(`SELECT c.relname AS table_name, a.attname AS column_name,
    format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS not_null,
    pg_get_expr(d.adbin,d.adrelid) AS default_value
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped`)).rows;
  let checkedColumns = 0;
  for (const table of Object.values(snapshot.tables)) {
    const actual = columns.filter((column) => column.table_name === table.name);
    assert.deepEqual(sorted(actual.map((column) => column.column_name)), sorted(Object.keys(table.columns)));
    for (const column of actual) {
      const saved = table.columns[column.column_name];
      const normalizeType = (type) => type.replace(/^public\./, "").replaceAll('"', "")
        .replace(/^serial$/, "integer").replace(/^bigserial$/, "bigint").replace(/^smallserial$/, "smallint");
      assert.equal(normalizeType(saved.type), normalizeType(column.type), `${table.name}.${column.column_name} type`);
      assert.equal(saved.notNull, column.not_null, `${table.name}.${column.column_name} nullability`);
      const serial = /^(smallserial|serial|bigserial)$/.test(saved.type);
      assert.equal(saved.default !== undefined || serial, column.default_value !== null, `${table.name}.${column.column_name} default presence`);
      if (column.default_value !== null && !serial) {
        if (/^(now|gen_random_uuid)\(\)$/.test(column.default_value)) {
          // Volatile defaults are compared by expression, never by evaluation.
          assert.equal(unwrap(saved.default), unwrap(column.default_value), `${table.name}.${column.column_name} default expression`);
        } else {
          const result = await db.query(`SELECT (${String(saved.default)})::${column.type}
            IS NOT DISTINCT FROM (${column.default_value})::${column.type} AS matches`);
          assert.equal(result.rows[0].matches, true, `${table.name}.${column.column_name} default value`);
        }
      }
      checkedColumns++;
    }
    const constraints = (await db.query(`SELECT conname, contype, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid=$1::regclass`, [`public.${table.name}`])).rows;
    for (const [type, field] of [["f", "foreignKeys"], ["u", "uniqueConstraints"], ["c", "checkConstraints"]]) {
      assert.deepEqual(sorted(constraints.filter((item) => item.contype === type).map((item) => item.conname)),
        sorted(Object.keys(table[field])), `${table.name} ${field}`);
    }
    for (const constraint of constraints.filter((item) => item.contype === "c")) {
      const saved = table.checkConstraints[constraint.conname].value;
      assert.equal(unwrap(saved), unwrap(constraint.definition.replace(/^CHECK\s*/, "")), `${table.name} ${constraint.conname} expression`);
    }
    for (const constraint of constraints.filter((item) => item.contype === "f")) {
      const saved = table.foreignKeys[constraint.conname];
      assert(constraint.definition.includes(`REFERENCES ${saved.tableTo}(`) || constraint.definition.includes(`REFERENCES ${saved.schemaTo}.${saved.tableTo}(`), `${constraint.conname} target`);
    }
    const keys = constraints.filter((item) => item.contype === "p");
    const declaredKeys = Object.values(table.compositePrimaryKeys).length + Object.values(table.columns).filter((column) => column.primaryKey).length;
    assert.equal(keys.length > 0, declaredKeys > 0, `${table.name} primary key`);
    const indexes = (await db.query(`SELECT i.relname AS name, x.indisunique AS unique,
      pg_get_expr(x.indpred,x.indrelid) AS predicate, am.amname AS method
      FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_am am ON am.oid=i.relam
      WHERE x.indrelid=$1::regclass AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid=x.indexrelid)`, [`public.${table.name}`])).rows;
    assert.deepEqual(sorted(indexes.map((item) => item.name)), sorted(Object.keys(table.indexes)), `${table.name} indexes`);
    for (const index of indexes) {
      const saved = table.indexes[index.name];
      assert.equal(saved.isUnique, index.unique);
      assert.equal(saved.method, index.method);
      assert.equal(expression(saved.where ?? ""), expression(index.predicate ?? ""), `${index.name} predicate`);
    }
  }
  const enums = (await db.query(`SELECT n.nspname AS schema,t.typname AS name,e.enumlabel AS value
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
    WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder`)).rows;
  const grouped = {};
  for (const row of enums) (grouped[`${row.schema}.${row.name}`] ??= []).push(row.value);
  assert.deepEqual(sorted(Object.keys(grouped)), sorted(Object.keys(snapshot.enums)));
  for (const [name, values] of Object.entries(grouped)) assert.deepEqual(snapshot.enums[name].values, values);
  return { tables: tables.length, columns: checkedColumns, enums: Object.keys(grouped).length };
}

function projectPendingCleanup(previous, sql) {
  // Static metadata projection only. Never execute the DO block or approval
  // settings, even against the disposable database.
  const drops = [...sql.matchAll(/^\s*DROP (TABLE|TYPE) public\.(\w+) RESTRICT;/gm)].map((match) => [match[1], match[2]]);
  assert.deepEqual(drops, [
    ["TABLE", "veterinary_triage_assessments"], ["TYPE", "triage_clinical_stability"],
    ["TYPE", "triage_intervention_urgency"], ["TYPE", "triage_condition_trend"], ["TYPE", "triage_emergency_finding"],
  ], "Cleanup changed: stop and review the pending projection");
  assert(sql.includes("ara.approve_rapid_triage_removal") && sql.includes("ara.approved_rapid_triage_row_count"));
  const projected = structuredClone(previous);
  for (const [kind, name] of drops) {
    const collection = kind === "TABLE" ? projected.tables : projected.enums;
    assert(collection[`public.${name}`], `Missing projected object ${name}`);
    delete collection[`public.${name}`];
  }
  // RESTRICT makes successful cleanup impossible if another object depends on
  // the removed table/types; verify the source metadata has no such links.
  for (const table of Object.values(projected.tables)) {
    assert(!Object.values(table.foreignKeys).some((key) => key.tableTo === "veterinary_triage_assessments"));
    assert(!Object.values(table.columns).some((column) => /triage_(clinical_stability|intervention_urgency|condition_trend|emergency_finding)/.test(column.type)));
  }
  return projected;
}

const migrations = readMigrationFiles({ migrationsFolder: folder });
const candidates = [];
const stages = [];
const db = new PGlite({ extensions: { vector } });
let prevId = zero;
try {
  for (let i = 0; i < journal.entries.length; i++) {
    const entry = journal.entries[i];
    let schema;
    let checks;
    if (entry.tag === "0021_remove_rapid_triage") {
      assert.equal(i, journal.entries.length - 1);
      schema = projectPendingCleanup(candidates.at(-1).snapshot, fs.readFileSync(path.join(folder, `${entry.tag}.sql`), "utf8"));
      checks = { pending: true, execution: "NOT EXECUTED; schema projected from explicit DROP declarations" };
    } else {
      await db.transaction(async (tx) => { for (const statement of migrations[i].sql) await tx.exec(statement); });
      schema = await introspect(db);
      checks = await compareCatalog(db, schema);
    }
    // Compare serialized metadata, not serializer-only undefined properties
    // (JSON intentionally omits those optional fields).
    const snapshot = JSON.parse(JSON.stringify({ ...schema, id: snapshotId(entry), prevId }));
    kit.auditValidate.parse(snapshot);
    candidates.push({ file: snapshotName(entry), snapshot });
    stages.push({ tag: entry.tag, idx: entry.idx, when: entry.when, file: snapshotName(entry), id: snapshot.id, prevId, ...checks });
    prevId = snapshot.id;
    console.log(`PASS ${entry.tag}: ${checks.pending ? "pending static projection" : `${checks.tables} tables / ${checks.columns} columns`}`);
  }
  assert((await db.query("SELECT to_regclass('public.veterinary_triage_assessments') AS table_name")).rows[0].table_name);
} finally { await db.close(); }

assert.equal(new Set(candidates.map((item) => item.snapshot.id)).size, 22);
const staged = path.join(audit, "reconstructed");
fs.mkdirSync(path.join(staged, "meta"), { recursive: true });
fs.writeFileSync(path.join(staged, "meta/_journal.json"), journalBytes);
for (const candidate of candidates) fs.writeFileSync(path.join(staged, "meta", candidate.file), `${JSON.stringify(candidate.snapshot, null, 2)}\n`);
// Kit 0.31.10 mishandles absolute Windows output paths; use a relative path.
const checkOutput = execFileSync(process.execPath, [path.join(path.dirname(kitEntry), "bin.cjs"), "check", "--dialect", "postgresql", "--out", path.relative(app, staged).replaceAll("\\", "/")], { encoding: "utf8", cwd: app });
console.log(checkOutput.trim());
checkImmutable();
if (process.argv.includes("--write")) {
  assert(fs.existsSync(path.join(audit, "original-metadata.zip")), "Backup missing");
  const expected = new Set(candidates.map((item) => item.file));
  const existing = fs.readdirSync(meta).filter((file) => file.endsWith("_snapshot.json"));
  assert(existing.every((file) => expected.has(file)), "Unexpected active snapshot: stop instead of deleting metadata");
  for (const candidate of candidates) fs.copyFileSync(path.join(staged, "meta", candidate.file), path.join(meta, candidate.file));
} else {
  for (const candidate of candidates) assert.deepEqual(JSON.parse(fs.readFileSync(path.join(meta, candidate.file))), candidate.snapshot, `${candidate.file} differs from reconstructed state`);
}
checkImmutable();
fs.writeFileSync(path.join(audit, "validation-results.json"), `${JSON.stringify({
  drizzleKitVersion: kitPackage.version, serializerSha256: hash(kitSource),
  executedMigrations: 21, pendingCleanupExecuted: false,
  schemaComparisons: 21, snapshotCount: 22, sqlHashesUnchanged: true,
  columnDefaultsCompared: true,
  serializerArrayDefaultCorrection: "Array defaults use exact pg_get_expr catalog SQL; Kit 0.31.10 misserializes ARRAY[]",
  journalBytesUnchanged: true, networkConnections: 0, drizzleKitCheck: checkOutput.trim(), stages,
}, null, 2)}\n`);
console.log("PASS immutable SQL/journal hashes; 21 catalog comparisons; 22 unique, linked snapshots. No Neon access or cleanup execution.");
