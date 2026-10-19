# Prepared cleanup ? NOT applied

Read-only inspection on 19 October 2026 found **2 Rapid Triage assessments**, 33 animals, and 0 emergency responses.

If separately approved and applied, migration 0021 removes:
- `public.veterinary_triage_assessments` and all its assessment rows: identifiers, animal links, clinical stability, urgency, trend, findings, notes, author IDs and assessment timestamps.
- Its animal foreign key, primary key and animal/assessment-time index (owned by that table).
- `triage_clinical_stability`, `triage_intervention_urgency`, `triage_condition_trend`, `triage_emergency_finding`, including their PostgreSQL array types.

No incoming foreign keys or dependent views were found. All four enums were used only by that table. `RESTRICT` blocks any unexpected dependencies. The coordination table, coordination audits, animals, examinations, treatments, appointments and migration history remain intact.

The application no longer reads or writes the obsolete objects, so deploying the code does not require this cleanup first.

Do not apply this migration until the owner separately approves the exact loss of existing assessments (and any desired export). Recount immediately before application. Migration 0021 deliberately refuses ordinary unattended `db:migrate` execution. A separately approved operator must supply transaction-local `ara.approve_rapid_triage_removal=on` and `ara.approved_rapid_triage_row_count` matching the locked table count. No approval settings have been set on Neon.

Use one persistent PostgreSQL transaction to execute only 0021 and insert its Drizzle history row together. Obtain the timestamp from the journal entry tagged `0021_remove_rapid_triage` (currently `idx: 23`, not entry 21) and SHA-256 from the exact SQL file using the installed migrator conventions. Do not replay older migrations or change existing history. The runtime SQL reader does not require snapshots. The reconstructed pending-cleanup snapshot describes the intended schema only; it does not approve or apply this migration.
