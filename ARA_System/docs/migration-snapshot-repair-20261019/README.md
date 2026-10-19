# Snapshot metadata repair — 19 October 2026

Prepared for review on `redesigned-ui` after local commit `ef16648`.
The approved repair is prepared for a local metadata-only commit. No push is authorized.

## Preserved evidence

- Local-only `original-metadata.zip` contains all 15 original snapshots and the
  original journal, copied before any metadata changes. This temporary backup
  is deliberately excluded from the commit.
- `original-sha256.json` records the original SQL, journal, snapshot and cleanup
  approval-document hashes. The approval document is intentionally corrected;
  SQL and journal bytes must remain unchanged.
- `validation-results.json` records the reconstructed file-to-journal mapping,
  IDs, predecessor IDs, schema counts and validation results.
- Local-only `reconstructed/meta/` retains reviewed candidate metadata and an
  exact journal copy. These disposable validation copies are excluded from
  the commit and recreated by the validator. Runtime metadata remains in
  `server/src/db/migrations/meta/`.

## What changed

All 15 existing snapshots were reconstructed and seven missing snapshots were
added: `0005`, `0007`, `0019`, `0020`, `0021`, `0022` and `0023`.
Snapshot filenames follow the **unchanged journal indices**, not the numeric
prefix of a migration tag. For example, `0021_snapshot.json` represents
`0019_rapid_triage`, `0022_snapshot.json` represents veterinary migration `0020`,
and `0023_snapshot.json` represents the **pending** cleanup migration `0021`.

Each snapshot has a deterministic, unique UUID derived from its journal
index/tag/timestamp, with its predecessor pointing to the previous chronological
entry. The first predecessor is the zero UUID. The journal itself is unchanged,
including its existing unused indices 2/3.

Schema contents were obtained from the installed Drizzle Kit 0.31.10 PostgreSQL
catalog serializer after replaying each migration into an in-memory PGlite
database with pgvector. The script exposes the pinned serializer in memory;
it does not modify Drizzle packages or invoke SQL generation. Independent
catalog assertions check tables, columns/types/nullability, defaults, enums,
indexes/predicates, primary keys, foreign keys and check constraints.

An additional check caught a Kit serializer defect: it converts PostgreSQL's
empty `ARRAY[]` enum-array default into the invalid value `'{"RAY"}'`. The
reconstruction therefore takes array defaults directly from `pg_get_expr` and
validates default values against PostgreSQL. No migration SQL was changed to
work around this serializer issue.

## Pending cleanup is not approved

Only the 21 migrations through `0020_veterinary_emergency_responses` were
executed, exclusively in disposable PGlite. Migration
`0021_remove_rapid_triage.sql` was **never executed**, and its approval settings
were never enabled.

Its snapshot is a static projection of its explicit, RESTRICT-protected DROP
declarations: remove the Rapid Triage table and four enum types from the
verified preceding schema. It describes the intended successful schema state,
as migration snapshots normally do; it is not an applied-history record.
The disposable database still contained the Rapid Triage table after validation.

The cleanup approval document now finds the timestamp by tag
`0021_remove_rapid_triage` (currently index 23), replacing its stale reference
to entry 21. SQL, guard conditions, tag, timestamp and pending status are intact.

## Historical hash mismatches: evidence, not replacement history

The following information comes from the SELECT-only Neon investigation on
19 October 2026, before this repair. **This repair made no Neon connections.**

These current journal migrations have no matching applied hash, even allowing
LF/CRLF variants:

| Journal tag | Original timestamp |
| --- | --- |
| 0000_black_mordo | 1788321306976 |
| 0001_cynical_sheva_callister | 1788324754204 |
| 0007_dispatcher_rescue_workflow | 1789471502808 |

This does not establish that their schema effects are missing. The database
contains historical migrations from other branch lineages. Twelve applied rows
without current-file matches were matched to immutable historical Git blobs
(including recognized line-ending variants):

| Database row ID | Historical migration | Git blob |
| --- | --- | --- |
| 1 | 0000_true_madame_masque.sql | be496411d015e180da8a670d515640767b838639 |
| 2 | 0001_living_hammerhead.sql | 94852c390e1e90bdd0fca39aca9c08d01d834c62 |
| 4 | 0002_high_deathbird.sql | e9a09c898805175fe9fef633f0e450450ea2033e |
| 5 | 0003_outgoing_raider.sql | c577f98751adbb510e7499b36d6b288da21c6112 |
| 9 | 0007_fearless_red_skull.sql | 55cbc1cd7da336a3681f6f1e3ab7edbd7de52637 |
| 10 | 0008_remarkable_boom_boom.sql | 7da63f410e11dc1029650a032a6ffcb905a7b805 |
| 12 | 0010_illegal_bruce_banner.sql | a93ee7e32a9448e0cf56828c685a83bf7a1f6988 |
| 13 | 0011_chubby_freak.sql | b1dba31173d92550463377d48db7a0619ec3263e |
| 16 | 0011_bumpy_hellfire_club.sql | af89d3fe0329ecc64f33b1595fc4c1c58a3fc305 |
| 22 | 0015_breeds_and_rabbit_species.sql | 3e9b388a6039d12440fd715c9d6cbd587a622cec |
| 24 | 0016_animal_species_name.sql | d8d28c4dcf899a7a5bda147e378fcc3a25b2dd31 |
| 25 | 0017_breeds_for_other_species.sql | 87b238a6c641ecf3af59a4081acbafcf2d548014 |

Database row **3** remains unidentified:

- `created_at`: `1788307739781`
- SHA-256: `16b50acfbe8dbe5363cf15d42278402d5cedc9c2e1cd3dee2604246c7f81a6b7`

No replacement SQL, history row, timestamp, or hash was invented. Applied
history remains an audit record and must not be edited to match current files.

## Reproduce validation without updating active snapshots

From `ARA_System`:

```powershell
node docs/migration-snapshot-repair-20261019/validate-snapshots.mjs
node node_modules/drizzle-kit/bin.cjs check --dialect postgresql --out ./server/src/db/migrations
```

The first command creates a fresh disposable PGlite database, replays through
0020, compares all active snapshots to the reconstructed states and rewrites
only review artifacts. It never loads project environment files, connects to
Neon, applies 0021 or generates SQL. The `--write` flag is reserved for the
explicitly approved repair; omitting it validates active metadata only.

## Remaining operational risks

- Repairing snapshots does not repair the unidentified historical migration
  or prove every database environment has the same schema.
- The installed Neon HTTP migrator selects pending work by the latest applied
  timestamp. It can skip a missing older migration without noticing its hash.
- Ordinary migration execution no longer encounters a guarded pending 0021: it
  was applied on 19 October 2026 after separate owner approval (see the addendum
  below). Metadata validation must never be treated as that approval.
- Metadata introspection can serialize expressions differently from the
  TypeScript schema. Any future generated migration needs review in isolation;
  passing `drizzle-kit check` alone is not approval to apply generated changes.

## Final validation results

- Fresh replay through 0020 and all 21 catalog/schema comparisons: passed.
- A second fresh replay compared all 22 saved snapshots with reconstructed
  states: passed (the pending cleanup state was projected, not executed).
- Active-directory `drizzle-kit check`: passed.
- Journal/hash metadata regression test: 1 passed, 0 failed. Cleanup-executing
  tests were deliberately excluded by the test-name filter.
- Backup archive: all 16 original metadata files matched their recorded hashes.
- All 22 migration SQL hashes and the exact journal bytes: unchanged.
- Snapshot IDs: 22 unique; all 22 predecessor links and journal slots verified.
- Validation baseline was `ef16648`. Only approved snapshot metadata, the
  cleanup approval-document correction, and validation documentation/scripts
  are included in the repair commit. No push or Neon connection occurred.

## Addendum — `0024_adoption_status_check` (19 October 2026)

A later change added an eighth queued migration, `0024_adoption_status_check`
(journal idx 24), adding only `ALTER TABLE "adoption_applications" ADD CONSTRAINT
"adoption_status_valid" CHECK (...)`.

Both it and the previously queued cleanup were then applied to the shared Neon
database later on 19 October 2026, after the owner separately approved retiring
the stored assessments. `0021_remove_rapid_triage` ran in one persistent
transaction together with its history row (row 32, `1792336355002`); the next
ordinary `npm run db:migrate` applied `0024` (row 33, `1792379152338`). The
procedure and outcome are recorded in
`server/src/db/migrations/0021_remove_rapid_triage.approval.md`, and the
post-application state in `docs/kara-merge-migration-review.md`.

The reconstruction above remains valid for the 22 entries it covered, but
`validate-snapshots.mjs` no longer runs unchanged: it asserts a 22-entry journal
(`journal.entries.length === 22`) and treats `0021_remove_rapid_triage` as the
last entry (`assert.equal(i, journal.entries.length - 1)`). Both assumptions
predate `0024`, and `validation-results.json` still records 22 snapshots. Read
this document as the record of the 19 October repair, not as a description of the
current journal tip. The validator's immutability check still guards the SQL
files and journal bytes, so applying the cleanup changed no migration SQL and no
journal byte.
