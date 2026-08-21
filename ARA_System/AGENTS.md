# AGENTS.md — ARA (Animal Rescue & Adoption Management System)

Guidance for any AI coding agent (Claude Code, Copilot, etc.) working in this
repository. This project is SPCA Fiji's Animal Rescue and Adoption Management
System, proposed by Group 7 (USP). Read this before generating or editing code.

## What this system is

ARA connects an animal's entire journey — rescue → intake → medical care →
adoption — into a single record, replacing SPCA Fiji's current phone/email/
in-person process. The three modules below are the whole system; don't build
features outside this scope unless asked.

1. **Animal Profile Management & Search Listings** — staff register a rescued
   animal with a permanent profile and unique ID (photos, species, breed, age,
   sex, colour, rescue history). Other modules attach data to the same profile.
   Once medically cleared, the animal is searchable/filterable publicly,
   including via natural-language AI search (e.g. "a small, calm dog that's
   good with children").
2. **Adoption Application & Rescue Reporting** — public users submit rescue
   reports (photos, location, condition, urgency) online or by phone; staff
   assign a rescuer and the reporter can track status. Registered users submit
   adoption applications; staff approve/reject; the animal listing closes on
   adoption.
3. **Veterinary & Health Management** — vets record treatment, vaccinations,
   and prescriptions against an animal's profile, and issue medical clearance
   — a precondition for the animal appearing in public listings. Users can
   book follow-up vet appointments online or by phone.

## Core functionalities checklist

Discrete features pulled from proposal §2.3 and §4.1, by module. Treat this as
the build/test checklist — a module isn't done until its items work.

**Animal Profile Management & Search Listings**
- [ ] Staff can register a new animal, creating a profile with a unique ID
- [ ] Profile fields: photos, animal type, breed, estimated age, gender,
      colour, rescue date, behaviour, rescue history
- [ ] Staff/vet can view and update an existing profile
- [ ] Public animal listing page, but only for medically cleared animals
- [ ] Search bar with filters (species, breed, age, size, etc.)
- [ ] Natural-language AI search (e.g. "a small, calm dog good with children")
      that maps to the same filters — assistive only, never auto-decides

**Adoption Application & Rescue Reporting**
- [ ] Public rescue report form: photos, location, condition description,
      urgency
- [ ] Phone-in rescue reports logged by staff through the *same* form/schema
- [ ] Staff review a report and assign a rescuer
- [ ] Reporter can track their rescue report's status
- [ ] Registered user can submit an adoption application (home, family,
      existing pets, experience with animals)
- [ ] Staff review, approve, or reject an adoption application
- [ ] Applicant can track their application's status
- [ ] Accepted application removes the animal from public listings

**Veterinary & Health Management**
- [ ] Animal is routed to a vet for medical clearance after intake
- [ ] User can book a vet appointment online, for follow-ups on a rescued pet
- [ ] Staff can log a phone-booked vet appointment through the same form
- [ ] Vet can record treatments, vaccinations, and prescribed medications
- [ ] Vet can view an animal's full medical history on repeat visits
- [ ] Vet can mark an animal as medically cleared for adoption

**Donations (cross-cutting)**
- [ ] Donor can make a financial donation via Stripe hosted checkout

## Frontend styling & design system

Full detail lives in `STYLE_FORMAT.md` at the repo root — read it before
writing or editing any component. Summary:

- **Stack**: Tailwind CSS v4 via the `@tailwindcss/postcss` plugin (no
  separate Tailwind config file), imported with `@import "tailwindcss";` at
  the top of `app/globals.css`. Vite (Cloudflare plugin) is the bundler.
- **Styling approach**: utility-first Tailwind classes for layout/spacing,
  combined with named component classes (`.teal-button`, `.animal-status`,
  `.modal`, etc.) built on CSS custom properties — not inline styles, not
  CSS-in-JS. `app/globals.css` is intentionally minified; don't reformat it,
  add new rules following the same compact style with a `/* section */`
  comment marker.
- **Design tokens live in `:root`** as CSS custom properties — always
  reference `var(--teal)`, `var(--navy)`, etc. rather than hard-coding hex
  values in new CSS. Core palette: `--navy #111820`, `--teal #1587c3`
  (primary accent/buttons), `--teal-dark #0d6da2` (hover), `--aqua #55b8e7`,
  `--bg #f3f6f9`, `--slate #657385` (secondary text), `--line #d7e0e8`
  (borders), `--red #d95050` (urgent/alerts), `--green #147fb8` (success/
  availability), `--shadow 0 18px 45px rgba(15,25,34,.1)`.
- **Font**: Arial/Helvetica system stack, not a custom webfont. Weights are
  400 (regular) or 800 (bold — buttons, headings, labels); nothing in between.
- **Status/urgency colors are semantic, not decorative** — `.animal-status`
  reads its class from `statusClass()` (lowercases + hyphenates the status
  string, e.g. `"In Treatment"` → `in-treatment`); urgency dots map
  critical→`--red`, high→`#ff9500`, moderate→`--gold`, low→`--green`. Reuse
  these mappings rather than inventing new status colors per component.
- **⚠️ Known bug — color variables don't match their names.** In
  `STYLE_FORMAT.md`'s `:root` palette: `--orange` is `#1587c3`, the exact
  same hex as `--teal` (looks like a copy-paste error, not actually orange);
  `--gold` is `#6daed4` and `--green` is `#147fb8` — both are shades of
  **blue**, not gold or green. This means the "moderate" and "low" urgency
  dots above will render as two similar-looking blues, not the
  gold/green distinction the naming implies. Don't assume `var(--green)`
  looks green or `var(--gold)` looks gold when reading or writing code —
  check the actual rendered color, and flag this to the team as a
  design-token bug worth fixing at the source rather than working around
  it per-component.
- **Layout grids to reuse rather than reinvent**: public nav
  (`250px 1fr 250px`), catalog page (`310px 1fr` sidebar + content), staff
  metric grid (`repeat(4, 1fr)`), animal grid (`1fr 1fr 1fr`, dropping to 2
  columns at 1180px and 1 column at 620px).
- **Breakpoints**: 1180px (desktop→2-col), 900px (tablet — nav becomes a
  fixed bottom bar, staff sidebar collapses to 78px), 620px (mobile — single
  column, staff sidebar becomes a fixed 64px bottom bar). Build mobile-first
  patterns to match these three, don't add ad hoc breakpoints.
- **Border radius scale**: 10–14px for inputs/cards, 20–24px for buttons/
  modals, up to 999px for pills — pick from this scale, don't invent new
  radii.
- **Buttons**: primary is the pill-shaped `.teal-button` (`var(--teal)` bg,
  white text, weight 800, 21px radius); `.ghost-button` for outlined/
  translucent variants on dark backgrounds; `.submit-button` (11px radius,
  full width) for form submission specifically.
- **Forms**: inputs/selects/textareas get a 10px border radius and
  `border-color: var(--teal)` + a teal focus ring
  (`box-shadow: 0 0 0 3px rgba(21,135,195,.12)`) on focus — apply this to
  every new form field for consistency and accessibility.
- **Z-index layers**: nav 20, modal 100, toast 1000 — don't improvise new
  z-index values outside this scale.

Note: an earlier exploratory home-page mockup in this conversation used a
different (teal/coral/paper) palette — that was a design exploration, not
this project's actual style. Anything built against the real codebase should
follow `STYLE_FORMAT.md`, not that mockup.

## Tech stack (do not swap without asking)

| Layer | Choice |
|---|---|
| Presentation | React, Next.js, TypeScript, JavaScript |
| Application | Next.js (server-side + frontend/DB communication), Stripe (donations) |
| Data | PostgreSQL, hosted on Neon |
| Mobile (optional) | React Native |
| Auth | Clerk |

**Note**: `STYLE_FORMAT.md` references Vite with a Cloudflare plugin as the
bundler, which sits oddly next to Next.js from the proposal — worth
confirming with the team which is actually in use before assuming either.

Architecture is **three-tier client-server**: presentation layer (UI/input) →
application layer (business logic) → data layer (Postgres via Neon). Keep
business logic out of UI components and out of raw SQL — it belongs in the
application layer (Next.js server functions/API routes).

## Entities & role-based access

Every feature must respect these roles (proposal §3.2, §4.3.2). When
scaffolding auth checks, routes, or UI, gate by role rather than assuming a
single user type:

- **Unregistered user** — browse listings only, no adoption actions, no login.
- **Registered user** — browse + submit adoption applications + book vet
  follow-ups for their rescued pet + track report/application status.
- **Donor** — makes financial donations via Stripe; not the same as a
  registered adopter, though one account could plausibly hold both roles.
- **SPCA staff** — register animals, assign rescuers, review/approve or reject
  applications, log phone-received reports and bookings.
- **Veterinarian** — view profile + medical history, enter prescriptions/
  treatments, medically clear animals for adoption.
- **CEO/Manager** — oversee operations, view data summaries, wage payments.

## Login & authentication

- **Unregistered/public users never log in** — browsing listings and viewing
  animal profiles must work with no account.
- **Every other action requires login** (proposal §4.2.1): registered users
  must authenticate to submit adoption applications, book vet appointments,
  or track a report/application; staff, vets, and managers must authenticate
  to use any of their modules.
- Auth is handled via **Clerk** — don't hand-roll password storage or session
  handling.
- **Role-based access control (RBAC)** is enforced on every route/action, not
  just hidden in the UI — a registered user hitting a staff API route directly
  should be rejected server-side.
- **Staff and admin accounts require multi-factor authentication** (proposal
  §6.1) — this is a named risk mitigation, not optional hardening.
- Credentials are never stored or logged in plaintext, and card details never
  touch SPCA's own servers — use Stripe's hosted checkout.

## Data model guardrails

- One **animal profile** is the anchor entity; rescue reports, medical records,
  and adoption applications all reference it by animal ID — don't duplicate
  animal data across tables (proposal's reliability requirement: no redundancy,
  single source of truth per animal).
- An animal cannot appear in public adoption listings until
  `medically_cleared = true` is set by a veterinarian. Enforce this at the
  application layer, not just in the UI.
- Once an adoption application is accepted, the animal must be removed from
  public listings in the same transaction that updates its status — avoid a
  window where a "cleared" animal looks available after being adopted.
- Rescue reports and vet bookings can arrive online *or* by phone. Staff-entered
  (phone) records must use the same schema/form path as online submissions so
  there's one code path, not two — this is a named risk mitigation in the
  proposal (§6.7), not just a nice-to-have.
- Two people can apply for the same animal at once. Use **database-level
  locking** on adoption approval so only one application per animal can be
  approved (proposal §6.6) — this is an explicit race-condition risk, not a
  hypothetical.
- Keep an **audit trail** for adoption approvals, rescue cases, and donations
  (proposal §6.5, legal compliance) — log who approved/rejected what, and when.

## AI search

The public search bar should accept natural-language queries (e.g. "small,
calm dog good with children") and map them to filterable attributes
(species, breed, age, size, temperament, etc.). Treat AI search as an
**assistive filter only** — it narrows results, it never makes or overrides
an adoption decision; that stays a staff action (proposal §6.6 mitigation).

## Non-functional requirements to keep in mind

- **Security**: role-based access control everywhere (see Login &
  Authentication above); credentials never stored or logged in plaintext.
- **Performance**: listing search/filter should feel instant; design queries
  and indexes (e.g. on species/breed/status/clearance) with that in mind.
- **Availability**: public-facing features (listings, rescue report submission)
  must stay usable outside SPCA's operating hours — don't gate them behind
  staff-only availability.
- **Reliability**: no duplicate or conflicting records for the same animal;
  plan for regular backups.
- **Scalability**: schema and features should tolerate growing record volumes
  without a redesign — avoid hard-coded limits or assumptions of small data.

## Payments

Stripe is scoped **only** for donations, not adoption fees or anything else
unless explicitly requested — don't wire up Stripe elsewhere without asking.

## Third-party dependencies

Stripe, Neon, and the AI search provider are flagged in the proposal as a
vendor lock-in risk (§6.10). Abstract these behind an internal interface/
service layer rather than calling their SDKs directly from deep in the
codebase, so a provider swap doesn't ripple everywhere.

## Build order (matches planned sprints)

If asked to scaffold from scratch, follow this sequence rather than jumping
ahead:
1. Animal Profile Management + Adoption listing/search
2. Adoption Application + Rescue Reporting
3. Veterinary & Health Management

## Conventions

- TypeScript everywhere in the Next.js app; avoid plain `.js` for new files.
- Keep Stripe, Clerk, and DB credentials in environment variables — never
  hard-code or commit secrets.
- This is a student group project (Group 7, USP) — prefer clear, readable
  code and small PRs over clever abstractions; the team needs to be able to
  review each other's work.
