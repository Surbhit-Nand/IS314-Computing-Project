# Kara merge: journal reconciliation review

Inspected on 19 October 2026. Database inspection used SELECT queries only.
No SQL migrations, history writes, data deletion, or snapshot generation were run.

## Confirmed applied history

The configured shared database records these migrations, with exact SHA-256
matches to the current SQL files:

| Database history ID | SQL file | Recorded timestamp |
| --- | --- | --- |
| 27 | 0018_rescue_takeover_requests.sql | 1791430000000 |
| 28 | 0019_notification_action_id.sql | 1791431000000 |
| 29 | 0018_owner_veterinary_bookings.sql | 1791707400000 |
| 30 | 0019_rapid_triage.sql | 1792207367112 |
| 31 | 0020_veterinary_emergency_responses.sql | 1792328869000 |

The takeover table and notifications.action_id column both exist. Prepared
0021_remove_rapid_triage has no history row. Its separately required approval
has not been granted by this merge request.

## Approved journal-only resolution

Both branches assigned journal indices 18 and 19 to different migrations.
The filenames differ; neither pair should replace the other. Keep every SQL
filename, SQL byte sequence, original tag, and original timestamp intact.
Do not modify any applied database history row.

The owner approved combining both journal tails in recorded timestamp order,
using these unique journal indices:

| Journal index | Existing tag (unchanged) |
| --- | --- |
| 18 | 0018_rescue_takeover_requests |
| 19 | 0019_notification_action_id |
| 20 | 0018_owner_veterinary_bookings |
| 21 | 0019_rapid_triage |
| 22 | 0020_veterinary_emergency_responses |
| 23 | 0021_remove_rapid_triage |

These are journal indices, not a proposal to rename SQL files. The installed
Drizzle runtime reads each full tag and timestamp and hashes the SQL contents;
it does not use the filename's numeric prefix as the applied-history identity.

The installed neon-http migrator selects the latest applied timestamp and
only executes entries newer than that row. This database already contains
both branches' entries, so no replay/backfill is needed here. Other databases
must be audited separately: a missing older migration can be silently skipped
even if present in a combined journal. Never assume one database's history
proves that every environment is reconciled.

Do not run db:migrate after this metadata reconciliation: 0021 is deliberately
guarded and destructive. Retiring stored assessments requires separate owner
approval and the procedure in 0021_remove_rapid_triage.approval.md.

## Snapshot findings

No snapshots were changed. Existing metadata has a missing parent for
0004_snapshot.json and a duplicate snapshot ID in 0011_snapshot.json and
0013_snapshot.json. The latest snapshot is 0018_snapshot.json; it includes
neither rescue_takeover_requests nor veterinary_triage_assessments nor
veterinary_emergency_responses. Thus snapshots are not a reliable combined
schema baseline.

Snapshot repair should be reviewed separately using the retained schema and
applied SQL history, with schema-generation output inspected in isolation.
Do not generate migrations against this broken lineage as an automatic merge
step, and do not make database history match a guessed snapshot chain.

## Validation and retained limits

The journal now contains all 22 SQL files exactly once, with unique tags and
indices and strictly increasing timestamps. Each original timestamp, version,
tag, and breakpoint setting is preserved. SQL contents and snapshots were
verified unchanged by SHA-256 comparison before and after reconciliation.

The older journal also placed 0001_cynical_sheva_callister before
0004_lyrical_black_tom despite the latter having an earlier timestamp. Their
journal positions and index slots (1 and 4) were reordered chronologically;
neither SQL file nor timestamp changed. These independent ALTER statements
affect rescue-report coordinates and animal soft-deletion respectively.
Existing unused index slots 2/3 remain unused; indices are unique and increasing.

Snapshot lineage remains a separate pre-existing issue described above. No
applied database history was changed, and no migration was executed.

## Image warning investigation

App.css still references ./assets/rescue-journey.webp in the auth spotlight,
but the approved checkpoint intentionally deleted that file. Vite leaves the
URL unresolved, causing a missing image at runtime. The safest small fix is
to replace that one URL with an existing tracked image such as
./assets/spca-hero.webp, after confirming the intended sign-in artwork. This
would preserve the intentional deletion and avoid adding duplicate assets.
The image reference has not been changed as part of journal reconciliation.
