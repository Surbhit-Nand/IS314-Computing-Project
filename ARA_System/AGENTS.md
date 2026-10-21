# AGENTS.md — ARA (Animal Rescue & Adoption Management System)

Guidance for any AI coding agent working in this repository. This is SPCA
Fiji's Animal Rescue and Adoption Management System, Group 7 (USP). Read this
(plus `Adoption.md` for the adoption module) before generating or editing
code.

> **Source-of-truth note**: legacy planning documents such as `Adoption.md`
> may describe a different stack. Trust current code and the maintained
> architecture/backend documentation for implemented animal search behavior.

## What this system is

ARA connects an animal's journey — rescue → intake → medical care → adoption —
into a single record. Three modules, plus cross-cutting donations:

1. **Animal Profile Management & Search Listings** — staff register animals
   with a unique ID and profile; once medically cleared the animal is
   publicly searchable/filterable.
2. **Adoption Application & Rescue Reporting** — public rescue reports
   (online or phone), staff dispatch, reporter tracking; registered users
   submit adoption applications, staff approve/reject.
3. **Veterinary & Health Management** — vets record treatments/vaccinations/
   prescriptions and issue medical clearance (precondition for public
   listings).

## Repo layout & verified stack

| Layer | Reality (verified) |
|---|---|
| Frontend | **Vite 8 + React 19 SPA** in `src/` (NOT Next.js, no router) |
| Backend | **Express 5 + TypeScript** in `server/src/`, Drizzle ORM |
| Data | PostgreSQL on Neon, schema `server/src/db/schema.ts` |
| Auth | Clerk (`@clerk/react` frontend; `@clerk/backend` verifies Bearer tokens) |
| Other | Cloudinary (photo uploads), Leaflet (rescue map), `@electric-sql/pglite` (dev-only in-process Postgres for DB-backed suites) |
| NOT present | Next.js, Tailwind, Stripe (see checklist), plain `.js` when TS works |

- **Backend module pattern**: `server/src/modules/<module>/{routes,service,repository}.ts`.
  Routes validate with **zod** before hitting the service; services hold
  business rules; repositories access the DB. Routes handle HTTP, nothing else.
- **Mounted routers** (`server/src/app.ts`): `/api/animals`, `/api/admin`
  (staff), `/api/rescue`, `/api/adoptions`, `/api/donations`, `/api/reports`
  (manager/admin), `/api/veterinary` (veterinarian, incl. `/emergency-responses`),
  `/api/my-animals` (signed-in owner, scoped to their approved/completed
  adoption), `/api/notifications`, `/api/webhooks` (Clerk webhook, mounted
  before the JSON body parser because it needs the raw body). Global middleware
  `veterinaryAlertChanges()` (`modules/notifications/veterinaryAlerts.middleware.ts`)
  runs after `express.json()` and syncs veterinary alerts on successful writes.
- **Frontend navigation (history-state store, no URL router)**: `src/App.tsx`
  renders the view from `useAraNavigation` (`src/navigation/`), which keeps a
  zod-validated `NavigationDestination` (view + selected ids/snapshots) in
  `history.state` so browser back/forward works. The URL path/query never
  changes (Clerk's hash is preserved). Pages navigate via `navigate(view)` for
  plain views or `navigateTo({...})` for detail contexts. To add a page:
  extend the `views` list in `src/navigation/araNavigation.ts` (+ `canVisit`
  gate + `resolveNavigation` context if it carries detail state) and add a
  branch in `App.tsx`. Anonymous Adopt across sign-in resumes via the
  `pendingAdoption` localStorage stash in `App.tsx`; invitees get their role
  via the `invitations/reconcile` effect there. Owner-side animal views
  (`my-animals`, `my-animal-record`, `my-animal-booking`) are visitable by any
  signed-in user and validate their `selectedAnimalId`; `App.tsx` also drives a
  `#root.ara-route-transition` class per navigation and a one-shot
  `pendingAboutStoryScroll` for the homepage "Our story" link.
- **Auth middleware**: `requireClerkSession` (`server/src/middleware/auth.ts`)
  resolves the token into `request.clerkUserId`; `requireStaffOrAbove` /
  `requireRescueQueueAccess` / `requireDispatcher` / `requireManagerOrAdmin`
  (`middleware/rbac.ts`) check Clerk `publicMetadata.role` = `staff |
  veterinarian | manager | admin | dispatcher` (`shared/types/roles.ts`). Public endpoints use
  `resolveOptionalClerkUserId` so anonymous visitors still work (rescue
  reports).
- **Role rename (`rescuer` → `dispatcher`)**: roles live **only** in Clerk
  `publicMetadata.role` — there is no role column in Postgres, so the rename
  needs no migration. Accounts created before the rename still carry
  `rescuer`, so every server-side read goes through `normalizeRole()`
  (`shared/types/roles.ts`, which owns `legacyRoleAliases`) and the frontend
  uses `isDispatcherRole()` (`src/utils/roles.ts`). `normalizeRole` returns
  `undefined` for missing/unknown values, and the request schemas
  (`z.enum(staffRoles)`) mean `rescuer` can never be **written** back. Once
  the remaining legacy Clerk accounts are updated, delete `legacyRoleAliases`
  and the alias arm in `isDispatcherRole`. Locked in by
  `modules/staff/staff.service.test.ts`.

## Commands (all verified)

```sh
npm install           # REQUIRED after a pull — new dev deps (e.g. @electric-sql/pglite)
npm run dev           # Vite frontend only (port 5173)
npm run server:dev    # Express API only (node --use-system-ca --import tsx, port 8787) — needs env (below)
npm run server:check  # typecheck the server package only
npm run db:generate   # create a Drizzle migration from schema.ts
npm run db:migrate    # apply migrations — run AFTER every pull, BEFORE server:dev
npm run db:seed:breeds  # idempotent breed lists for the `breeds` table (after 0015 + 0017)
npm run build         # tsc -b && vite build (typechecks frontend+server)
npm run lint          # eslint .
npm test             # node:test via tsx — server + frontend suites
```

- **`npm run db:migrate` is fully applied on Neon as of 19 Oct 2026.** The one
  hold-out was the deliberately guarded destructive cleanup
  (`0021_remove_rapid_triage.sql` + `.approval.md`), which raises unless
  transaction-local `ara.approve_rapid_triage_removal=on` and a matching row
  count are set. It was applied with explicit approval (assessment rows exported
  first), so a plain unattended `db:migrate` now succeeds. Read
  `docs/kara-merge-migration-review.md` before touching migrations.
- `npm run server:dev` runs through `node --use-system-ca --import tsx` so the
  system certificate store is used for Neon/Clerk TLS.
- **`db:seed:breeds`** (idempotent, `ON CONFLICT DO NOTHING`) fills the `breeds`
  table that the Breed dropdowns read. **`db:seed:animals` writes demo profiles
  to whatever `DATABASE_URL` points at** (uploading photos to Cloudinary) — the
  team shares one Neon database, so don't run it against the shared instance.

- **Tests**: `npm test` runs every `*.test.ts` under `server/src/**` and
  `src/**` (~39 suites / 341 cases at the redesign merge). The script needs
  `--experimental-test-module-mocks` because several suites (adoptions, rescue,
  staff, notifications) stub modules with `node:test`'s `mock.module` — running
  `npx tsx --test <file>` directly fails with
  `TypeError: mock.module is not a function`. Add new suites as
  `*.test.ts` anywhere under those two roots; the glob picks them up.
- **DB-backed suites** (veterinary emergency, veterinary alerts/assistance,
  `db/retireTriageMigration`) use `@electric-sql/pglite` — an in-process
  Postgres seeded with the raw migration SQL. They never touch Neon, so they
  need `npm install` first (the dependency is dev-only).
- **Browser suite**: `src/features/veterinary/emergency.browser.test.ts` is a
  full-stack test that boots Vite, a pglite database and a Chromium build (env
  var `EMERGENCY_TEST_BROWSER`). It must **never** start the project API or
  connect to its database; skip it rather than pointing it at real services.
- **⚠️ `mock.module` does not work on Node v22.20.0** (verified with an isolated
  probe, with and without `tsx`): the mocks are ignored and every mock-based
  suite dies at import time with
  `SyntaxError: The requested module '...' does not provide an export named
  '...'`. On that Node version `npm test` therefore fails **adoptions, rescue and
  staff** — pre-existing and unrelated to any current work. Donations, reports,
  clerkToken and animals all pass.
  **Do not write new suites with `mock.module`.** Take the collaborator
  functions as an optional parameter instead (see the `SearchDependencies`
  parameter on the animals service, which is what `animals.service.test.ts`
  stubs). Also set `process.env.CLERK_SECRET_KEY` / `DATABASE_URL` to dummies at
  the top of the file before importing anything, so the suite doesn't need a
  real `.env` or a live database.
- **Required order**: `db:migrate` → `server:dev`. A missing column is the #1
  cause of `column "xxx" of relation "animals" does not exist` crashes.
- `npm run dev` does NOT start the API — run both `dev` and `server:dev`.

## Environment & secrets

- `server/src/config/env.ts` loads root **`.env.local` first, then
  `server/.env`** — dotenv first-load wins, so root `.env.local` overrides
  `server/.env` for `DATABASE_URL` / `CLERK_SECRET_KEY`. `drizzle.config.ts`
  reads only `.env.local`.
- Frontend vars are `VITE_*` in `.env.local` (`VITE_CLERK_PUBLISHABLE_KEY`,
  `VITE_DEV_BYPASS_AUTH`). Server vars in `server/.env` (`CLERK_SECRET_KEY`,
  `API_PORT`, `DATABASE_URL`, Cloudinary, `stripe`…) — but a single root
  `.env.local` holding both is supported and currently used locally, since
  root wins on conflicts and `drizzle.config.ts` reads only `.env.local`.
- **`DEV_BYPASS_AUTH=true`** (server env) skips ONLY the role check — a Clerk
  session is still required. Mirror flag `VITE_DEV_BYPASS_AUTH` in `src/utils/devBypass.ts`
  for the UI. Never enable outside local dev.
- Never commit `.env.local` / `server/.env` (gitignored).

## Database / Neon gotchas

- Shared Neon DB across branches — extra columns/tables from other branches
  are normal and benign. Migration **number prefixes are already duplicated**:
  two `0004_*`, two `0015_*` (`0015_adoption_simplified_questionnaire`,
  `0015_breeds_and_rabbit_species`), two `0016_*`
  (`0016_adoption_id_verification`, `0016_animal_species_name`), two `0017_*`
  (`0017_adoption_next_of_kin`, `0017_breeds_for_other_species`), two `0018_*`
  (`0018_rescue_takeover_requests`, `0018_owner_veterinary_bookings`) and two
  `0019_*` (`0019_notification_action_id`, `0019_rapid_triage`). Journal indices
  `2` and `3` are unused. Entries are disambiguated by tag + `when`, never by the
  number, and the journal is kept **in `when` order** — the two `0015`-`0017`
  lineages interleave as idx 15 `0015_adoption_simplified_questionnaire`,
  16 `0015_breeds_and_rabbit_species`, 17 `0016_adoption_id_verification`,
  18 `0016_animal_species_name`, 19 `0017_breeds_for_other_species`,
  20 `0017_adoption_next_of_kin`. So when you pick a fresh number/idx, check
  `server/src/db/migrations/meta/_journal.json` for collisions. The approved
  reconciliation is written up in `docs/kara-merge-migration-review.md`.
- **`db:generate` cannot produce a clean migration on this repo.** Kit 0.31.10's
  catalog serializer renders expressions differently from `schema.ts`, so a
  plain `npm run db:generate` re-emits unrelated drops/recreates (FK names
  gaining a `_fk` suffix, partial unique indexes, the veterinary CHECKs) next to
  your real change — verify this yourself before trusting any generated file.
  Add migrations by hand, keep journal + snapshot consistent, and check with
  `node node_modules/drizzle-kit/bin.cjs check --dialect postgresql --out ./server/src/db/migrations`.
  Snapshot ids are deterministic — sha1 over the 16-byte namespace
  `b9c25721f77548dc84ff150687a5f606` concatenated with
  `ara:snapshot:v7:<idx>:<tag>:<when>`, then the version/variant bits patched —
  so a hand-written snapshot can match what the tool itself would have emitted.
  `docs/migration-snapshot-repair-20261019/` holds the reconstruction record
  (its `validate-snapshots.mjs` still asserts the pre-0024 22-entry baseline).
- The journal's tip is `0024_adoption_status_check` (**idx 27**), which adds the
  `adoption_status_valid` CHECK. Both it and `0021_remove_rapid_triage` were
  applied on 19 Oct 2026, so the live schema now matches the journal.
  `retireTriageMigration.test.ts` locates `0021` by tag instead of by position,
  because the cleanup is no longer the journal tip. The merged journal is
  idx 0, 1, 4–27; after a merge renumbers indices, every `meta/*_snapshot.json`
  has to move with them (filename = `{idx:04d}_snapshot.json`, `id` = the
  deterministic hash above, `prevId` = the previous entry's id). The chain was
  rebuilt by replaying all 26 migrations in journal order into `@electric-sql/pglite`
  and serializing each state with drizzle-kit's own catalog serializer, then
  checked with the `drizzle-kit check` command above — reuse that approach rather
  than editing snapshots by hand.
- **Species / breeds (migrations `0015_breeds_and_rabbit_species`,
  `0016_animal_species_name`, `0017_breeds_for_other_species` — all applied on
  Neon)**: staff register **Dog**, **Cat** or **Other** only. `rabbit` stays in
  the `animal_type` enum (dropping an enum value means rebuilding the type on a
  shared DB) but the API rejects it and no row should carry it. For
  `type = 'other'` the typed species lives in `animals.species_name` ("Rabbit",
  "Guinea Pig") and `breed` is free text ("Holland Lop", "Unknown"); dogs/cats
  always have `species_name` NULL. **Display species via `speciesLabel()` in
  `src/utils/format.ts`** (listing cards use `breedLineLabel()`), never
  `capitalize(animal.type)` — that prints "Other" for every rabbit. Typing
  "dog"/"cat" (any case, plural) as an Other species switches back to Dog/Cat in
  the form, and the API stores such a request as a real dog/cat
  (`resolveSpeciesAndBreed`, `server/src/modules/animals/speciesBreed.ts`).
  Breed lists live in the `breeds` table (seeded by `db:seed:breeds`): dog/cat
  rows have `species_name` NULL; typed-species rows are `species = 'other'` +
  `species_name`, unique per (species, species_name, name) case-insensitively. A
  species with a list gets a Breed dropdown ending in a form-only "Other" that
  opens a typed box; a species without one (e.g. Snake) always types its breed.
  A typed breed is stored only if it passes `validateTypedBreedName` (no digits,
  junk, "Other" or species words like "cat") and is never added to the table.
- **Veterinary priority** is set by staff on the Register/Edit forms
  (`VeterinaryPriorityField.tsx`, default Moderate on Register). Kept
  self-contained so it can move to the vet module later — that file's header
  lists every piece to remove.
- The API prints a **non-fatal** schema-drift warning at boot if `schema.ts`
  columns are missing on the live DB (`server/src/db/drift-check.ts`) — warns,
  never crashes. Its table list is fixed (`animals`, `rescueReports`,
  `adoptionApplications`, `vetAppointments`, `auditLogs`, `donations`,
  `notifications`), so the newer `veterinary_emergency_responses` and
  `rescue_takeover_requests` tables are **not** covered and will not warn.
- One person should own applying migrations so the journal stays consistent.
- **Skipped-migration trap (hit Oct 2026 with `0012`)**: drizzle's migrator
  applies only migrations with a journal `when` NEWER than the single latest
  applied row — on this shared DB a teammate's newer migration makes yours
  silently skipped while `db:migrate` still reports success. If the boot
  drift warning names your columns after a migrate, your file was skipped:
  run its statements manually against the live DB, then record the journal
  row exactly as the migrator would (`hash` = sha256 of the raw `.sql` file,
  `created_at` = the journal `when`) into `drizzle.__drizzle_migrations`.

## Core functionality status (build/test checklist)

`[x]` done · `[~]` partial · `[ ]` not started. Paths are where to look/verify.

**Animal Profile Management & Search Listings**
- [x] Register animal with unique ID — `animals.service.ts`
  (`generateUniquePublicId`)
- [x] Profile fields (photos, type, breed, age, gender, colour, rescue date,
      behaviour, rescue history) — `schema.ts` `animals`
- [x] Staff/vet view & update — `updateAnimalProfile`, `EditAnimalProfile.tsx`
- [x] Public listing and AI search share `publicAnimalVisibility()`: status is
      not adopted, `deleted_at IS NULL`, and `medically_cleared = true`
- [x] Search + filters (type, gender, breed, behaviour, size, colour, vaccination)
- [x] Natural-language search — backend Gemini embeddings + Neon pgvector.
      `POST /api/animals/ai-search` (public) → `searchAnimalsWithAI`
      (`animals.service.ts`) → `findSimilarPublicAnimals`
      (`animals.repository.ts`, cosine `<=>` over `animals.search_embedding`).
      Provider isolated in `services/aiSearchClient.ts`, keyed by
      `GEMINI_API_KEY` (backend only), 768-dim `gemini-embedding-001`. Text fed
      to the provider comes from `animalSearchText.ts` — public profile fields
      only, never rescue history/medical/staff data. Embeddings are written on
      register and on edits that touch a searchable field. Missing embeddings
      are retried on eligible profile updates and successful medical clearance,
      and backfilled with
      `npm run ai:backfill` (migration `0013_*` adds the `vector` extension +
      column; it must be applied before searching). Assistive filter only — the
      provider never decides anything, and `publicAnimalVisibility()` is the same
      predicate the normal listing uses, so an adopted/uncleared/deleted animal
      can never be returned. `AnimalListings.tsx` only reorders the profiles it
      already loaded; if the provider is down it falls back to the full listing.

**Adoption Application & Rescue Reporting**
- [x] Public rescue report form (photos, location, condition, urgency) —
      `RescueReportForm.tsx`
- [x] Phone-in reports through the *same* form/schema (`source: "phone"`,
      staff variant of the same component)
- [x] Staff review + Dispatcher claim workflow — `RescueOperationsPortal.tsx` (Mission Board / Active Mission / Mission History + `/api/rescue/missions*`), `rescue.service.ts`
- [x] Mission takeover requests — a dispatcher asks to take over another's
      mission (`rescue_takeover_requests`, migration `0018`; partial unique
      pending index), the owner approves/declines atomically, competing pending
      requests are cancelled, and each event raises a notification carrying
      `action_id` so the bell deep-links to the exact request
      (`src/utils/takeoverReview.ts` + `RescueOperationsPortal`).
- [x] Reporter tracks status — `MyReports.tsx`, `GET /api/rescue/mine`
- [x] Registered user submits adoption application — `AdoptionApplicationForm.tsx`, `POST /api/adoptions`
- [x] Staff review/approve/reject — `ManageAdoptionApplications.tsx`, `PATCH /api/adoptions/:id`
- [x] Applicant tracks + withdraws their application — `MyApplications.tsx`,
      `GET /api/adoptions/mine` (rows carry `history`), `POST /api/adoptions/:id/withdraw`
- [x] Accepted application removes animal from public listings — partial unique index `adoption_animal_unique_active` on `(animal_id) WHERE status IN ('approved','completed')` + DB-level 23505 check in service
- [x] My Animals owner portal — `/api/my-animals` (`myAnimals` module): an
      approved/completed applicant sees their animal's veterinary history and
      books or cancels owner appointments. Ownership is derived from the
      adoption application and re-checked on every read and booking
      (`findOwnedAnimal` joins `adoption_applications` in
      `myAnimals.repository.ts`); `bookAppointment` additionally lets
      staff-or-above book on any animal's behalf. Owner writes are stamped
      `source = owner_booked`. The schedule is Fiji time, Mon–Fri 08:00–17:00,
      Sat 08:00–13:00, in 30-minute slots, and the slot unique index is
      **partial** (`WHERE status = 'booked'`) so a cancellation frees it.
- [x] Notifications on stage change — in-app rows (`notifications` module) plus
      email through `services/email.ts`, both best-effort: a provider outage
      never blocks a submit or a transition
      (`adoptions.service.test.ts`, cases AD-17/18/19/33/34).

**Veterinary & Health Management** — **BUILT** (merged from `origin/jasprit`
in `672401d`). Module implemented and mounted at `/api/veterinary` in `app.ts`;
UI lives in `src/features/veterinary/` with its own `veterinary.css`. Every
route sits behind `requireVeterinaryAccess` (`["veterinarian"]` only — staff
can read the vet queue but cannot issue clearance).
- [x] Vet clearance routing after intake — 3-stage workflow (initial exam →
      required treatments → clearance), `pages/VeterinaryCarePage.tsx`
- [x] Vet appointments (online + phone) — `VeterinaryAppointmentBooking.tsx`,
      `components/DateTimePicker.tsx`; `vet_appointments.source` distinguishes
      `online` / `phone` / `owner_booked`. Booking is authorised in
      `modules/veterinary/veterinary.booking.ts` (`bookAppointment`): staff-or-above
      can book for any animal, everyone else only for an animal they own, and
      the write is rejected with 409 when the partial unique index
      `vet_appointment_slot_unique` (`WHERE status = 'booked'`) is taken.
- [x] Treatments / vaccinations / prescriptions — `veterinary_care_plans` +
      `veterinary_treatment_history`, `treatmentOptions.tsx`
- [x] Full medical history on repeat visits — `VeterinaryMedicalHistory.tsx`,
      `components/ExaminationHistory.tsx`, `pages/MedicalHistoryScene.tsx`
- [x] Mark animal medically cleared — `clearAnimal` (repository) behind
      `POST /api/veterinary/animals/:animalId/clearance`; sets
      `medically_cleared`, `medical_clearance_date`,
      `medical_cleared_by_clerk_user_id`, `medical_clearance_notes`
- [x] Emergency response coordination — `emergency.{service,repository,routes,lifecycle}.ts`
      over the `veterinary_emergency_responses` table (migration `0020`): one
      open episode per animal (partial unique index), actions `attend` /
      `release` / `take_over` / `support` at
      `POST /api/veterinary/emergency-responses/:animalId`, with `GET` for the
      queue. All behind `requireVeterinaryAccess`, coordinated under
      `pg_advisory_xact_lock(7314,2021)` plus an animal `FOR UPDATE` row lock,
      optimistic `version` checks, and DB error codes (`23505`, `40001`,
      `40P01`, `55P03`) mapped to 409. Episodes close automatically — batched
      into `clearAnimal`, `updateAnimal` and `softDeleteAnimal` — whenever the
      animal leaves active Critical care; every action writes an `audit_logs`
      row with `entity_type = 'veterinary_emergency_response'`.
- [x] Veterinary alert notifications — `notifications/veterinaryAlerts.service.ts`
      and `veterinaryAssistance.service.ts`. Alerts reach unbanned, unlocked
      `veterinarian` accounts only, dedup per recipient per episode, and
      `hasVeterinaryAccess` **fails closed**. Emergency notification types are
      filtered out for non-vets and sorted first for vets. Think of these as
      best-effort: a directory outage degrades delivery, never care.
- [x] **Rapid Triage was removed** in favour of the coordination model above.
      The code no longer reads or writes `veterinary_triage_assessments`; the
      table and its four enum types were dropped by
      `0021_remove_rapid_triage.sql`, applied on 19 Oct 2026 after the two
      assessment rows were exported (see the sibling `.approval.md`).

**Donations (cross-cutting)**
- [~] Donation flow works as **card/QR data-entry** (validate + insert,
      `donations.service.ts`); **no Stripe SDK / hosted checkout exists** —
      `stripe_checkout_session_id` is a reserved column only.

**Reports & analytics (cross-cutting)**
- [x] Manager/Admin analytics + PDF report — `server/src/modules/reports/{routes,service,repository}.ts`
      mounted at `/api/reports`; `GET /api/reports/analytics?range=30d|90d|12m|all`
      (default `90d`), gated `requireClerkSession` + `requireManagerOrAdmin`.
      Live KPIs + recharts trends/breakdowns + `window.print()` PDF export in
      `src/components/ReportsPage.tsx`; "reports" nav link is manager/admin-only
      (`SiteHeader.tsx`). Data is read-only over `animals` / `rescue_reports` /
      `adoption_applications` / `donations` (completed only).

## Adoption module (spec: `Adoption.md`)

`Adoption.md` is the working scoping doc for this module — honor it, but its
*draft* schema names differ from reality:

- **Existing table** (`schema.ts` `adoptionApplications`):
  `id`, `animalId` (FK), `applicantClerkUserId` (Clerk id, not UUID),
  `homeDetails`, `familyDetails`, `existingPets`, `animalExperience`,
  `status` (text, default `"submitted"`), `createdAt`.
  - Adoption.md's `housingInfo`→`homeDetails`, `experience`→`animalExperience`,
    `applicantId`→`applicantClerkUserId`.
  - **`reviewNotes`** (text, nullable) + **`updatedAt`** (timestamp, notNull,
    defaultNow) added by migration `0006_lumpy_sabretooth.sql`. Statuses are
    free text, not an enum - but `schema.ts` declares a `check`
    (`adoption_status_valid`) over the six known statuses, added by the
    hand-written migration `0024_adoption_status_check.sql` (see Database / Neon
    gotchas). Both it and `0021_remove_rapid_triage` were applied on Neon on
    19 Oct 2026.
- **`adoptionStatusHistory`** table (migration `0006`): `id`,
  `applicationId` (FK), `fromStatus`, `toStatus`, `notes`, `changedBy`,
  `changedAt`. Joined in detail responses.
- **Partial unique index** `adoption_animal_unique_active` on
  `adoption_applications(animal_id) WHERE status IN ('approved','completed')`
  — prevents two concurrent approvals hitting 23505; the service pre-checks via
  `findAdoptionConflict` for a friendly 409 and translates a genuine 23505 race
  into the same 409 (`adoptionErrors.ts`).
- **Mounted at** `/api/adoptions`. Routes: `POST /` (submit), `GET /mine`
  (applicant's own - each row carries its `history`), `GET /` (staff queue),
  `GET /:id`, `PATCH /:id` (staff status move), `POST /:id/withdraw`
  (applicant-only), `POST /id-document` (ID photo upload). `GET /`, `GET /:id`
  and `PATCH /:id` add `requireStaffOrAbove`; `/mine`, `/id-document` and
  `/withdraw` are session-only.
- **Statuses**: `submitted → under_review → approved → completed`, plus the
  terminal branch states `rejected` and `withdrawn`. `ALLOWED_TRANSITIONS` in
  `adoptions.service.ts` allows exactly `submitted → {under_review, rejected,
  withdrawn}`, `under_review → {approved, rejected, withdrawn}`,
  `approved → {completed}`, and nothing out of `completed` / `rejected` /
  `withdrawn`. Every transition is timestamped in `adoptionStatusHistory` so
  both the adopter stepper and the staff queue show *when*, not just *what*.
  `withdrawn` is written only by the applicant's `POST /:id/withdraw`, so it is
  not a reviewer status (`transitionSchema` = `z.enum(REVIEWER_STATUSES)`).
- `rejected` requires `reviewNotes` shown to the applicant. A supplied review
  note is preserved on same-status saves (a note-only save used to write a
  history row with the note dropped).
- **Typed business errors**: `modules/adoptions/adoptionErrors.ts` owns
  `AdoptionBusinessError(status, message)` (400/403/404/409) and
  `isUniqueViolation`; `businessErrorStatus` maps them to HTTP codes. Do not
  reintroduce string-matched status mapping — it silently turned a reworded 409
  (and the real 23505 double-approval) into a 500.
- **Self-review guard**: `transitionAdoptionApplication` returns 403 when the
  actor is the applicant and the move is `approved`/`completed`.
- **Medical-clearance gate**: now a **hard gate**.
  `requireMedicallyCleared` reads `animals.medically_cleared` and throws
  "This animal is not yet medically cleared for adoption." on
  `under_review -> approved`; `submitAdoptionApplication` applies the same gate
  at submission. Because `medically_cleared` is only ever written by the
  vet-only `clearAnimal`, approval is genuinely vet-gated. The same flag gates
  the public listing - see Data model guardrails.
- **ID documents**: `applicationSchema.idDocumentUrl` must be `https://`, and
  `POST /id-document` checks the image magic bytes (JPEG/PNG), not just the
  claimed mimetype. Rejected/withdrawn applications have their hosted document
  deleted best-effort (`deleteIdDocumentBestEffort`, only when Cloudinary is
  configured).
- Both list endpoints accept optional `?limit=&offset=` (limit bounded 1–500);
  absent limit keeps the "all rows" behaviour.
- **Ownership transfer on approval**: `approved` and `completed` both call
  `updateAnimalProfile(animalId, { status: "adopted" })`, which removes the
  animal from public listings and hands it to the adopter (the My Animals
  portal reads ownership from the application). Approval is the real transfer;
  completion re-asserts it so applications approved before this rule still end
  up correct. neon-http has **no transactions**, so the two statements run in
  order, the partial unique index is what actually blocks a second approval, and
  a failed animal write restores the previous application status (best-effort
  compensation).
- Notifications on stage change are wired best-effort (in-app row + email) for
  submit, every staff transition **and** the applicant's own withdrawal
  (`withdrawAdoptionApplication`, which used to notify nobody). Submission
  (`adoption.application.submitted`), every status change and the withdrawal
  are written to the audit trail. Notification copy for `withdrawn` lives in
  `notifications.service.ts` and `services/email.ts`.
- **One active application per applicant per animal**: `findActiveAdoptionApplication`
  (`adoptions.repository.ts`) counts an application as "active" unless its status
  is terminal — `rejected`, `completed` or `withdrawn`. `withdrawn` matters: an
  applicant who cancels may apply again for the same animal, so do not remove it
  from that list. The list is deliberately derived from the terminal statuses of
  `ALLOWED_TRANSITIONS` (exported from `adoptions.service.ts` for exactly this
  reason) and pinned by `adoptions.repository.test.ts`, which runs the real
  Drizzle query with only the transport intercepted. This is a read-then-write
  pre-check, not a DB constraint — there is no unique index on
  `(animal_id, applicant_clerk_user_id)`, so a genuine concurrent double-submit
  is technically possible (only the *approval* race is index-backed, by
  `adoption_animal_unique_active`).
- **Withdrawal is shown to the applicant as a cancellation, not a status.** The
  stored status stays `withdrawn`, and the staff queue keeps the "Withdrawn"
  label, tab and filter (staff must find and count those rows), but the
  applicant's own views route every label through `applicantClosureLabel` /
  `applicantClosureShortLabel` (`src/types/adoption.ts`) so no applicant-facing
  status list shows "withdrawn". Add new applicant labels there, not by editing
  the shared staff labels.
- **Test coverage**: adoption is covered by
  `server/src/modules/adoptions/adoptions.service.test.ts` (lifecycle,
  guarantees and notification side-effects), `adoptions.validation.test.ts`
  (request schemas + `businessErrorStatus`), `adoptions.repository.test.ts` (the
  duplicate-application predicate as real SQL), `src/features/adoptions/adoptionQueue.test.ts`
  (queue tabs) and `src/types/adoption.test.ts` (applicant status wording). The
  written-up case list, expected results and traceability are
  in `docs/adoption-test-cases.md`; the browser-level companion that needs real
  Clerk sessions and a live database is `TestCases_Gr7.md` plus
  `docs/adoption-manual-test-runbook.md`.

## Entities & role-based access

Every route/action is gated server-side by role, not just hidden in the UI
(see middleware above).

- **Unregistered** — browse listings only, no login required, no actions.
- **Registered user** — browse + adoptions + vet follow-up bookings + track
  report/application status; after an application is approved they also own the
  animal in **My Animals** (`/api/my-animals`) where they see its veterinary
  history and book or cancel appointments.
- **Donor** — donations via the Donate modal (card/QR; Stripe not wired yet);
  one account may be both user and donor.
- **SPCA staff** — register animals, review/reject
  applications, log phone reports/bookings (same form as online).
- **Dispatcher** — claims available rescue cases and advances only their own
  assigned reports (`requireDispatcher` on mutation routes; works inside the
  `RescueOperationsPortal`). Staff can read the queue but cannot claim or update.
  A dispatcher can also request a **takeover** of another dispatcher's mission
  and only the current owner can approve or decline it
  (`/api/rescue/missions*`, `rescue_takeover_requests`).
- **Veterinarian** — medical history, treatments, medical clearance, and
  **emergency coordination** (claim `attend`, `release`, `take_over` or request
  `support` on a Critical animal), which drives the veterinary alert
  notifications. All of it behind `requireVeterinaryAccess`.
- **Manager/Admin** — staff invitations (`staff` module, `/api/admin`),
  edit staff member roles, revoke member access / pending invitations
  (admins rule managers/admin; no self-changes), metrics, wage payments.
  The assignable-role list lives once in the UI (`INVITABLE_ROLES`,
  `ManagerDashboard.tsx`) and is rendered by both the invite form and the
  per-member role editor; a test in `modules/staff/staff.service.test.ts`
  asserts it still matches the server's `invitationalStaffRoles`.

## Login & authentication

- Public listing/browsing must work with **no account**.
- Everything else requires Clerk auth; RBAC enforced server-side — a
  registered user hitting a staff route must get 403.
- **Staff-first landing**: staff-type accounts (manager/admin/staff/vet/
  dispatcher) are routed straight to their own dashboard: `App.tsx` derives a
  fresh `home` landing into the matching dashboard (a pure render derivation,
  once per session per user id — also applies on reload since `view` resets to
  `home`). Registered users stay on the public Home page.
- `SiteHeader.tsx` renders **team navigation** (Dashboard, Rescue queue,
  Animals, Register, Adoptions + "View public site") on internal pages
  (`dashboard`, `staff-dashboard`, `dispatcher-dashboard`, `register-animal`,
  `manage-animals`, `edit-animal`, `reports`); public pages keep the normal nav (Adopt/
  Donate prompts hidden for staff-type accounts). Dispatchers see only the
  rescue queue, not animal/adoption modules.
- Staff/admin accounts need **MFA** (named risk mitigation). Never store/log
  credentials in plaintext. Card details never touch SPCA's own servers.

## Frontend styling & design system (verified against real CSS)

> `STYLE_FORMAT.md` is aspirational, not accurate for this repo — the real
> styles below are the source of truth. **Updated after the UI redesign** (see
> `docs/ui-redesign-walkthrough.md`).

- **No Tailwind, no `@layer`, no `@import`** — plain CSS where *import order is
  the only layering mechanism*. `src/main.tsx` loads `index.css` → `App.tsx`
  (which pulls `App.css` + `veterinary.css`) → `visual-system.css` →
  `workspace.css` → `workspace-minimal.css` → `rescue-workspace.css` →
  `features/veterinary/veterinary-minimal.css`. The new sheets come **after**
  `App.css` on purpose so they win by source order.
- **There are now 15 stylesheets, not 2.** Base tokens live in `src/index.css`
  `:root`; `App.css` (12.6k lines) is the catch-all for internal/app pages and
  now also stacks several legacy redesign layers, so "which rule wins" depends
  on line position. Feature styles moved to their own files:
  `components/{HomePage,UserDashboard,MyProfilePage,NotificationBell}.css`,
  `features/rescue/MyReports.css`,
  `features/veterinary/{my-animals-banner,my-animal-records,veterinary-minimal}.css`,
  plus the global `visual-system.css` / `workspace.css` /
  `workspace-minimal.css` / `rescue-workspace.css`. **Put a feature's styles in
  its own file, not in `App.css`.**
- **Scoped palettes** (no single source): `--spca-brand #115cba` / `--spca-*`,
  two `--home-*` blocks, `--about-*` in `App.css`; `--ara2-*` in
  `HomePage.css`; `--surface-radius` / `--control-radius` in
  `visual-system.css`; `--workspace-card-*` in `workspace-minimal.css`. Always
  reference `var(--token)` — never hard-code hex.
- **⚠️ Token bug**: `--green: #147fb8` is actually **blue** (documented in an
  `index.css` comment) and is still consumed by `.urgency-dot.low` etc. A real
  green exists as `--success: #1f9d55` — use that in new code. `--gold` /
  `--orange` don't exist in the real `:root`.
- **Real class names to reuse** (in `src/App.css`): `.teal-button`,
  `.ghost-button` (and `.light`), `.danger-button`, `.chip`, `.mini-button`,
  `.animal-grid`, `.catalog-layout`, `.dashboard-metrics`, `.user-stat-card`,
  `.modal` / `.modal-backdrop`, `.toast`, `.urgency-dot` — all still exist, but
  `visual-system.css` restyles the buttons/cards (navy, 6–10px radius, flat).
  Redesign prefixes: `ara2-*` (public homepage), `about2-*` (About),
  `workspace-*` (internal sidebar shell), `vm-*` (veterinary), `ops-*` /
  `mission-*` (rescue), `account-*`, `my-alert-*`, `companion-*`,
  `notification-*`. Do NOT reference `.public-nav`, `.metric-grid`,
  `.staff-shell`, `.form-grid`, `.submit-button`, `.animal-status` — those
  don't exist.
- **Page roots changed**: the public homepage root is **`.ara2-home`**, not
  `.home-page`; `.home-page` now denotes the catalogue/rescue/about/account
  pages. The public header/sidebar carries both `.site-header` and
  `.workspace-sidebar` when internal.
- **Urgency dots** (real): `critical→var(--red)`, `high→#ff9500`,
  `moderate→#e5a500`, `low→var(--green)` (the blue one).
- **Z-index scale**: nav 20, public header / workspace sidebar **40**, modal
  100, veterinary notification panel **110**, toast 1000. (Feature sheets also
  use small local values 0–10; don't invent new top-level tiers.)
- **Breakpoints**: 1180 / 1120 / 1050 / 980 / 900 / 800 / 760 / 720 / 700 /
  620 / 540 / 520 / 500 / 420 / 370 px are all in use. Mobile-first — extend the
  existing set rather than inventing arbitrary new cuts.
- **Border radius**: controls/inputs **6–10px** (`--control-radius: 6px`),
  cards 14–16px, pills 999px. The old "20–24px buttons" guidance is obsolete.
- **Forms**: 10px radius, `border-color: var(--teal)`, focus ring
  `box-shadow: 0 0 0 3px rgba(21,135,195,.12)`.
- **Font**: base is Arial/Helvetica (weights 400/800), but the redesigned public
  and workspace surfaces override it — `"Segoe UI Variable"` / `"Avenir Next"` /
  `Inter`, Georgia serif for workspace headings — and use intermediate weights
  (550–820). Match the surrounding page rather than assuming the base stack.

## Data model guardrails

- One **animal profile** is the anchor; rescue reports, adoptions, and vet
  appointments reference `animals.id`. Don't duplicate animal data. Animals
  soft-delete via `deletedAt` (NOT `status = closed`) because those tables use
  NOT-ACTION FKs to `animals.id` — a hard DELETE would fail or destroy the
  audit trail.
- **Medical clearance gate**: the proposal rule is *no public listing until
  `medically_cleared = true`*. The team originally **shipped with this OFF**
  (because the Veterinary module didn't exist yet) and the guardrail carried an
  annex to re-enable it when that module landed. **The Veterinary module has
  now shipped, so the gate is ON**: `findPublicAnimals` filters on
  `medically_cleared = true` as well as `status != adopted` + not deleted, and
  `animals.routes.ts` documents the listing as cleared-only. The flag has a
  single writer - `clearAnimal` in the veterinary repository, reachable only
  via `POST /api/veterinary/animals/:animalId/clearance` behind
  `requireVeterinaryAccess`; `registerAnimal` hard-codes it to `false`, and
  neither the registration nor the edit zod schema accepts it, so clearance is
  genuinely vet-only. Do not add a staff path to set it.
- On adoption acceptance the animal is removed from public listings by marking
  it `adopted` — approval performs the transfer and completion re-asserts it —
  **and** the DB-level guard is in place: the partial unique index
  `adoption_animal_unique_active` on `(animal_id) WHERE status IN
  ('approved','completed')` makes a second approval fail with `23505`, and the
  service pre-checks with `findAdoptionConflict` for a friendly 409 (a genuine
  race is translated into the same 409 by `adoptionErrors.ts`). **Still open**:
  the two writes (application status, then animal) are *not* one transaction —
  neon-http has no interactive transactions here — and no row lock is taken, so
  the unique index is the only concurrency guarantee. The writes are
  compensated: an animal-update failure restores the previous application
  status, and a failed first-history write on submission deletes the
  application row. If you touch this path, keep the ordering (status first,
  animal second) or move it onto `server/src/db/transaction.ts`
  (`withSqlTransaction`).
- Rescue reports and vet bookings can arrive online *or* by phone — one
  schema/form path, distinguished by `source` (both are in
  `rescue_reports`/`vet_appointments`). The adoption request schema still has no
  `source` field (Adoption.md's `source` add-on is not built).
- Keep an **audit trail** — `auditLogs` table + `shared/audit/audit.service.ts`.
  Adoption submission and every status change (including applicant withdrawal)
  write to it.

## AI search

Normalize whitespace, then run conservative local spelling correction before
intent parsing, trait extraction and full-query embedding. Derive spelling terms
from the shared vocabulary; protect public names/breeds/species/colours with one
batched public lookup. Preserve negations and ambiguous words. Keep original text
for transparency and return optional `didYouMean` only on a meaningful correction.
The listing accepts the suggestion by searching again and clears stale suggestions.

Search combines deterministic explicit type/size/gender/vaccination constraints,
shared card-trait priority, and a Gemini embedding of the full normalized query.
Public visibility and structured predicates are applied in SQL before ranking.
Trait queries fetch all eligible candidates, rank full then partial requested
trait matches ahead of semantic-only matches, deduplicate by ID, and limit last.
Only semantic-only matches require the configured similarity threshold; tag
matches can qualify below it or with NULL vectors. With no requested traits,
the existing SQL semantic ordering/threshold/LIMIT path is retained.
`server/src/shared/animalTraits.ts` owns the pure vocabulary/extractor; the
frontend `src/utils/animalTags.ts` re-exports it and retains card-building logic.
The parser hard-filters only the `dog`/`cat` types, size, gender and
vaccination; every other species word (rabbit, hamster, …) stays in the
embedding text and is matched semantically, because those animals are stored as
`type = 'other'` with the species in `species_name`/`breed`. Recognized compatibility
and temperament traits influence ranking; other descriptions remain semantic.

See [backend search documentation](server/README.md) for the exact flow,
visibility rule, supported vocabulary, lifecycle, configuration, and limitations.
Current development uses Gemini gemini-embedding-001, 768 dimensions, an
explicit environment threshold of 0.60, result limit 10, and a 10-second timeout.
The code's threshold fallback remains 0; recalibrate with substantially larger
datasets rather than treating 0.60 as universal.

NULL embeddings are excluded from semantic-only results and can be retried by an eligible
profile save, successful veterinary clearance, or missing-only backfill.
Provider failures must not block registration, updates, or clearance. Valid
embeddings must be preserved on unrelated edits. Keep provider credentials
backend-only, send only public profile text, and return only ranked IDs to the
browser. Provider failure is an availability error; a successful empty result
must remain a no-match state. Search is assistive and never decides adoption.

## Payments & third-party dependencies

- Stripe is scoped **only** for donations (hosted checkout is the plan, not
  yet wired). Don't add Stripe for adoption fees or anything else without
  asking.
- Stripe, Neon, and any AI-search provider are vendor-lock-in risks — abstract
  behind a service layer (`server/src/services/`), don't call SDKs from deep
  in the code.

## Non-functional requirements

- **Security**: RBAC everywhere, credentials env-only.
- **Performance**: listing search/filter should feel instant — index
  species/breed/status/clearance.
- **Availability**: public features (listings, rescue reports) must work
  outside SPCA hours.
- **Reliability**: no duplicate/conflicting animal records; regular backups.
- **Scalability**: no hard-coded limits; tolerate growing record volumes.

## Conventions

- TypeScript everywhere; avoid plain `.js` for new files.
- Secrets live in env files, never committed or logged.
- Student group project — prefer clear, readable code and small PRs over
  clever abstractions; teammates must be able to review your work.
- Branches are per-teammate (`main`, `alvin`, `dante-feature`, `jas`, `kara`,
  `surbhit`) and merged into the working branch — keep `Adoption.md`'s "what
  NOT to touch" (search module, report generation) off your plate unless asked.
  **Reconcile at merge**: the reports/analytics module (`server/src/modules/reports/*`,
  `src/components/ReportsPage.tsx`) overlaps `Adoption.md`'s "report generation"
  but was built on `surbhit` deliberately **at the user's request** — QA it in
  that context, not as an Alvin duplicate.
- **Maintained docs** (trust these over legacy planning files):
  `docs/adoption-test-cases.md` (adoption test cases + traceability),
  `docs/ui-redesign-walkthrough.md` (what the redesigned UI is, page by page),
  `docs/kara-merge-migration-review.md` (migration/journal reconciliation) and
  `server/README.md` (AI search internals).
