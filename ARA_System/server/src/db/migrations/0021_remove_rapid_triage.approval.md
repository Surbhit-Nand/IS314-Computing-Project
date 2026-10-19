# Applied cleanup: migration 0021 (19 October 2026)

Read-only inspection on 19 October 2026 found **2 Rapid Triage assessments**, 33 animals, and 0 emergency responses.

Migration 0021 removed:
- `public.veterinary_triage_assessments` and all its assessment rows: identifiers, animal links, clinical stability, urgency, trend, findings, notes, author IDs and assessment timestamps.
- Its animal foreign key, primary key and animal/assessment-time index (owned by that table).
- `triage_clinical_stability`, `triage_intervention_urgency`, `triage_condition_trend`, `triage_emergency_finding`, including their PostgreSQL array types.

No incoming foreign keys or dependent views were found. All four enums were used only by that table. `RESTRICT` blocks any unexpected dependencies. The coordination table, coordination audits, animals, examinations, treatments, appointments and migration history remain intact.

The application no longer reads or writes the obsolete objects, so deploying the code does not require this cleanup first.

## Approval and application record

The owner separately approved the exact loss of the stored assessments on 19 October 2026, so the cleanup was applied that day, exactly as this document prescribed.

- **Export taken first.** The two `veterinary_triage_assessments` rows (every column, plus the four enum label sets and the table's index definitions) were written to `%TEMP%\opencode\rapid-triage-assessments-2026-10-19.json` before anything was dropped.
- **Recount immediately before application:** 2 rows, matching the approved count.
- **Applied in one persistent PostgreSQL transaction** that executed only 0021 and inserted its Drizzle history row together, using the transaction-local settings `ara.approve_rapid_triage_removal=on` and `ara.approved_rapid_triage_row_count=2`.
- **History row inserted:** id 32, `created_at` 1792336355002 (the timestamp of the journal entry tagged `0021_remove_rapid_triage`, `idx: 23`, not entry 21), `hash` `2168cb7663f69754d4d1cbb5758bee30c6aa2c88fd01f7477fa488eb9ade6206` (SHA-256 of the exact SQL file using the installed migrator conventions).
- **Verified afterwards:** `public.veterinary_triage_assessments` and its four `triage_*` enum types are gone; animals (33), adoption applications and their 29 status-history rows, `veterinary_emergency_responses` and the pre-existing migration history were unaffected.
- `0024_adoption_status_check` then applied normally on the next `npm run db:migrate` (history row id 33, `created_at` 1792379152338), so no journal entry is pending.

The migration continues to refuse ordinary unattended `db:migrate` execution: it raises unless the transaction-local approval settings above match the locked table count, which is why the application was a deliberate, separately approved, single-transaction operation. No older migration was replayed and no existing history row was changed. The reconstructed pending-cleanup snapshot describes the intended schema only; it never approved or applied this migration.
