# AGENTS.md — ARA (Animal Rescue & Adoption Management System)

Guidance for any AI coding agent working in this repository. This is SPCA
Fiji's Animal Rescue and Adoption Management System, Group 7 (USP). Read this
(plus `Adoption.md` for the adoption module) before generating or editing
code.

> **Source-of-truth note**: three docs in this repo contradict the actual
> codebase and should not be trusted: `STYLE_FORMAT.md` (describes Tailwind /
> `app/globals.css` — neither exists), `ARCHITECTURE.md` ("all server files are
> placeholders" — most server modules are fully implemented), and `Adoption.md`
> (says "Next.js" — it's not). Trust this file and the code itself.

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
| Other | Cloudinary (photo uploads), Leaflet (rescue map) |
| NOT present | Next.js, Tailwind, Stripe (see checklist), plain `.js` when TS works |

- **Backend module pattern**: `server/src/modules/<module>/{routes,service,repository}.ts`.
  Routes validate with **zod** before hitting the service; services hold
  business rules; repositories access the DB. Routes handle HTTP, nothing else.
- **Mounted routers** (`server/src/app.ts`): `/api/animals`, `/api/admin`
  (staff), `/api/rescue`, `/api/adoptions`, `/api/donations`, `/api/reports`
  (manager/admin), `/api/veterinary` (veterinarian), `/api/webhooks` (Clerk
  webhook, mounted before the JSON body parser because it needs the raw body).
- **No frontend router**: `src/App.tsx` switches on a `view` string in local
  state and threads `onNavigate={setView}` into every page. To add a page:
  extend the `View` union + add a branch in `App.tsx`. There are no URL params.
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
npm run dev           # Vite frontend only (port 5173)
npm run server:dev    # Express API only (tsx, port 8787) — needs env (below)
npm run server:check  # typecheck the server package only
npm run db:generate   # create a Drizzle migration from schema.ts
npm run db:migrate    # apply migrations — run AFTER every pull, BEFORE server:dev
npm run build         # tsc -b && vite build (typechecks frontend+server)
npm run lint          # eslint .
npm test             # node:test via tsx — server + frontend suites
```

- **Tests**: `npm test` runs every `*.test.ts` under `server/src/**` and
  `src/**` (94 tests / 6 files): adoptions, donations, reports, rescue, staff,
  plus `src/utils/clerkToken.test.ts`. The script needs
  `--experimental-test-module-mocks` because the suites stub modules with
  `node:test`'s `mock.module` — running `npx tsx --test <file>` directly fails
  with `TypeError: mock.module is not a function`. Add new suites as
  `*.test.ts` anywhere under those two roots; the glob picks them up.
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
  `API_PORT`, `DATABASE_URL`, Cloudinary, `stripe`…).
- **`DEV_BYPASS_AUTH=true`** (server env) skips ONLY the role check — a Clerk
  session is still required. Mirror flag `VITE_DEV_BYPASS_AUTH` in `src/utils/devBypass.ts`
  for the UI. Never enable outside local dev.
- Never commit `.env.local` / `server/.env` (gitignored).

## Database / Neon gotchas

- Shared Neon DB across branches — extra columns/tables from other branches
  are normal and benign. Migrations currently have **two `0004_*` entries**
  (idx 4 and 5) in the journal; when you `db:generate`, make sure you don't
  collide with an existing migration name/index.
- The API prints a **non-fatal** schema-drift warning at boot if `schema.ts`
  columns are missing on the live DB (`server/src/db/drift-check.ts`) — warns,
  never crashes.
- One person should own applying migrations so the journal stays consistent.

## Core functionality status (build/test checklist)

`[x]` done · `[~]` partial · `[ ]` not started. Paths are where to look/verify.

**Animal Profile Management & Search Listings**
- [x] Register animal with unique ID — `animals.service.ts`
  (`generateUniquePublicId`)
- [x] Profile fields (photos, type, breed, age, gender, colour, rescue date,
      behaviour, rescue history) — `schema.ts` `animals`
- [x] Staff/vet view & update — `updateAnimalProfile`, `EditAnimalProfile.tsx`
- [~] Public listing page — `findPublicAnimals` (`animals.repository.ts:14`)
      filters `status != adopted` + not soft-deleted; **medical-clearance gate
      is intentionally OFF** — see Data model guardrails
- [x] Search + filters (type, gender, breed, behaviour, size, colour, vaccination)
- [~] Natural-language search — client-side free-text match over name/breed/
      colour/behaviour/description/size (`AnimalListings.tsx`). Assistive
      filter only — no AI provider, never auto-decides.

**Adoption Application & Rescue Reporting**
- [x] Public rescue report form (photos, location, condition, urgency) —
      `RescueReportForm.tsx`
- [x] Phone-in reports through the *same* form/schema (`source: "phone"`,
      staff variant of the same component)
- [x] Staff review + Dispatcher claim workflow — `RescueOperationsPortal.tsx` (Mission Board / Active Mission / Mission History + `/api/rescue/missions*`), `rescue.service.ts`
- [x] Reporter tracks status — `MyReports.tsx`, `GET /api/rescue/mine`
- [x] Registered user submits adoption application — `AdoptionApplicationForm.tsx`, `POST /api/adoptions`
- [x] Staff review/approve/reject — `ManageAdoptionApplications.tsx`, `PATCH /api/adoptions/:id`
- [x] Applicant tracks application status — `MyApplications.tsx`, `GET /api/adoptions/mine`
- [x] Accepted application removes animal from public listings — partial unique index `adoption_animal_unique_active` on `(animal_id) WHERE status IN ('approved','completed')` + DB-level 23505 check in service

**Veterinary & Health Management** — **BUILT** (merged from `origin/jasprit`
in `672401d`). Module implemented and mounted at `/api/veterinary` in `app.ts`;
UI lives in `src/features/veterinary/` with its own `veterinary.css`. Every
route sits behind `requireVeterinaryAccess` (`["veterinarian"]` only — staff
can read the vet queue but cannot issue clearance).
- [x] Vet clearance routing after intake — 3-stage workflow (initial exam →
      required treatments → clearance), `pages/VeterinaryCarePage.tsx`
- [x] Vet appointments (online + phone) — `VeterinaryAppointmentBooking.tsx`,
      `components/DateTimePicker.tsx`; `vet_appointments.source` distinguishes
      the two
- [x] Treatments / vaccinations / prescriptions — `veterinary_care_plans` +
      `veterinary_treatment_history`, `treatmentOptions.tsx`
- [x] Full medical history on repeat visits — `VeterinaryMedicalHistory.tsx`,
      `components/ExaminationHistory.tsx`, `pages/MedicalHistoryScene.tsx`
- [x] Mark animal medically cleared — `clearAnimal` (repository) behind
      `POST /api/veterinary/animals/:animalId/clearance`; sets
      `medically_cleared`, `medical_clearance_date`,
      `medical_cleared_by_clerk_user_id`, `medical_clearance_notes`

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
    free text, not an enum.
- **`adoptionStatusHistory`** table (migration `0006`): `id`,
  `applicationId` (FK), `fromStatus`, `toStatus`, `notes`, `changedBy`,
  `changedAt`. Joined in detail responses.
- **Partial unique index** `adoption_animal_unique_active` on
  `adoption_applications(animal_id) WHERE status IN ('approved','completed')`
  — prevents two concurrent approvals hitting 23505; service pre-checks via
  `findAdoptionConflict` for friendly 409.
- **Mounted at** `/api/adoptions`. Routes: `POST /`, `GET /mine`, `GET /`,
  `GET /:id`, `PATCH /:id`. Auth: `requireClerkSession`, `requireStaffOrAbove`.
- **Statuses**: `submitted → under_review → approved → completed`, or
  `rejected`. Every transition timestamped in `adoptionStatusHistory` so both
  the adopter stepper and the staff queue show *when*, not just *what*.
- `rejected` requires `reviewNotes` shown to the applicant.
- **Medical-clearance gate**: now a **hard gate**.
  `requireMedicallyCleared` reads `animals.medically_cleared` and throws
  "This animal is not yet medically cleared for adoption." on
  `under_review -> approved`. Because `medically_cleared` is only ever written
  by the vet-only `clearAnimal`, approval is genuinely vet-gated. The same
  flag gates the public listing - see Data model guardrails.
- Notifications on stage change (email or in-app) — not yet wired.

## Entities & role-based access

Every route/action is gated server-side by role, not just hidden in the UI
(see middleware above).

- **Unregistered** — browse listings only, no login required, no actions.
- **Registered user** — browse + adoptions + vet follow-up bookings + track
  report/application status.
- **Donor** — donations via the Donate modal (card/QR; Stripe not wired yet);
  one account may be both user and donor.
- **SPCA staff** — register animals, review/reject
  applications, log phone reports/bookings (same form as online).
- **Dispatcher** — claims available rescue cases and advances only their own
  assigned reports (`requireDispatcher` on mutation routes; works inside the
  `RescueOperationsPortal`). Staff can read the queue but cannot claim or update.
- **Veterinarian** — medical history, treatments, medical clearance.
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
> styles below are the source of truth.

- **No Tailwind.** Plain CSS. Design tokens live in `src/index.css` `:root`;
  component classes live in `src/App.css` (readable, not minified). Always
  reference `var(--token)` — never hard-code hex.
- **⚠️ Token bug**: `--green: #147fb8` is actually **blue** (documented in an
  `index.css` comment). A real green exists as `--success: #1f9d55`. `--gold`
  / `--orange` don't exist in the real `:root`. Check the rendered color
  before assuming a name means what it says; flag fixing at the source.
- **Real class names to reuse** (in `src/App.css`): `.teal-button` (teal→
  `--teal-dark` gradient, `border-radius: 999px`, weight 800), `.ghost-button`
  (and `.light` variant), `.danger-button`, `.chip`, `.mini-button`,
  `.animal-grid`, `.catalog-layout` (`310px 1fr`), `.dashboard-metrics`
  (`repeat(4, 1fr)`), `.user-stat-card`, `.modal` / `.modal-backdrop`,
  `.toast`, `.urgency-dot`. Do NOT reference `.public-nav`, `.metric-grid`,
  `.staff-shell`, `.form-grid`, `.submit-button`, `.animal-status` — those
  don't exist.
- **Urgency dots** (real): `critical→var(--red)`, `high→#ff9500`,
  `moderate→#e5a500`, `low→var(--green)` (the blue one).
- **Z-index scale**: nav 20, modal 100, toast 1000.
- **Breakpoints**: 1180 / 900 / 620 px (plus non-ad-hoc 980 / 720 / 420 in
  use). Mobile-first; don't invent extra media queries arbitrarily.
- **Border radius**: 10–14px inputs/cards, 20–24px buttons/modals, 999px pills.
- **Forms**: 10px radius, `border-color: var(--teal)`, focus ring
  `box-shadow: 0 0 0 3px rgba(21,135,195,.12)`.
- **Font**: Arial/Helvetica stack; weights only 400 or 800.

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
- On adoption acceptance, remove the animal from public listings **in the
  same transaction** as the status update, and use **database-level locking**
  (two applicants for one animal — race risk) so only one application per
  animal can be approved. Not implemented yet — build these into the
  adoptions module.
- Rescue reports and vet bookings can arrive online *or* by phone — one
  schema/form path, distinguished by `source` (both are in
  `rescue_reports`/`vet_appointments`). Same `source` field exists on the
  adoptions flow to add.
- Keep an **audit trail** — `auditLogs` table + `shared/audit/audit.service.ts`
  (used by rescue/donations; reuse for adoption approvals).

## AI search

Natural-language queries map to the same filters (species, breed, age, size,
temperament…). **Assistive only** — it narrows results, never makes or
overrides an adoption decision. Current implementation is a client-side
keyword match, not an external AI provider.

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