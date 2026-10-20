# Animal publication review

One animal record is used throughout intake, veterinary care, and publication.

- Registration saves the animal's details and photos once, with no publication timestamp.
- Veterinary clearance completes the medical workflow, removes the animal from the active medical queue, and sends a best-effort staff/manager/admin inbox notification. A directory or delivery failure never reverses clearance: the database-backed review queue still contains the animal. Repeating clearance retries delivery without duplicating existing recipient notifications.
- The staff dashboard lists medically cleared, unpublished, active animals under **Ready to publish**, linking to a focused publication editor. Registration details are read-only; **Edit animal record** opens the full intake form separately.
- Staff can choose the main photo, remove/upload photos, improve the public description and temperament, and see a live listing preview. **Save draft** permits unfinished listing content without validating or changing unrelated intake fields. **Publish listing** requires an authorised, unlocked account, medical clearance, a name, valid description and temperament, and one to three valid photo URLs. Adopted, closed, and deleted animals cannot be published. Publication and its audit event are atomic; repeated publication is idempotent.
- The listing-only PATCH endpoint accepts only description, behaviour, rescue history, and photos. Staff enter the rescue journey manually in publication review; it is not imported from rescue alerts. Registration does not require rescue history. Publication requires a valid rescue journey. The endpoint cannot change medical clearance, veterinary priority, ownership, or publication state. Already published profiles must retain valid listing content when saved.
- Public listings and AI search require both medical clearance and a publication timestamp. Adoption submission enforces the same publication prerequisite against direct API calls. Public profile navigation continues to use the existing listing/profile flow.

## Migration and rollout

`0028_animal_publication_review.sql` was applied to the configured database after separate owner approval (history row 34). All 33 animals and the 15 then-public listings were preserved. It adds only nullable `animals.published_at`, then backfills animals that are already cleared, active, and not deleted so existing public listings remain visible. It neither duplicates animals nor modifies medical records, adoption ownership, or general animal status. The focused editor needs no additional migration.

For other environments, the application code requires this column. Arrange a separately approved application of this additive migration before enabling the updated code. Inspect each environment's actual schema/history first. Do not run the blanket migration command: it can include other pending changes, including historical destructive cleanup. This work does not authorise or execute `0021`, edit its approval guard, or change applied migration history.

The new snapshot extends `0027_snapshot.json` with only this column. Existing constraints, indexes, foreign keys, snapshots, and historical SQL are preserved. The new journal entry is appended without changing existing entries.

## Validation

`animalPublication.test.ts` uses disposable, in-memory PGlite databases and only the new additive migration. It covers preservation of existing visibility and medical history, draft defaults, staff approval, idempotency, notifications, invalid publication attempts, transaction rollback, and exact snapshot scope. Listing repository tests check publication gating for both normal and AI listings. Veterinary and adoption service tests cover clearance handoff and direct submission before publication. No shared database is used by these tests.
