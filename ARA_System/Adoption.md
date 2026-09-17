# SPCA Fiji — Animal Rescue and Adoption Management System

## Project Context
This is a group university project: a full-stack web (and eventually mobile) platform for SPCA Fiji covering animal profile registration, report/on-call handling, public adoption listings, adoption application processing, and vet appointment scheduling.

This AGENTS.md scopes the agent to **my part only: the Adoption Process module** (adoption application processing). Do not build or modify the search functionality or report generation module — that's being handled by a teammate (Alvin) separately.

## Tech Stack
- Frontend: React, Next.js, TypeScript
- Mobile (if needed): React Native
- Backend: Next.js API routes / Node, TypeScript
- Database: PostgreSQL via Neon
- Auth: Clerk
- Payments (if adoption fees apply): Stripe API
- Architecture: three-tier client-server
- Deployment targets under consideration: Vercel (frontend), Railway (backend), Neon (DB) — local dev is also fine for now

## Scope — Adoption Process Module
Build the end-to-end adoption application flow:
1. **Public adoption listings** — browse/view available animals (read-only consumption of animal profile data; assume animal profile schema already exists or stub it).
2. **Adoption application form** — registered users can apply to adopt a specific animal. Capture applicant details, housing situation, experience with pets, household info, reason for adopting.
3. **Application status tracking (adopter side)** — applicant has a page/dashboard showing exactly which stage their application is at, using the same stage set staff use (see below), with a simple visual (stepper/progress bar) so it's clear what's done and what's next.
4. **Staff review workflow (staff side)** — staff get a dashboard/queue listing all applications with their current stage, filterable/sortable by stage. Staff can open an application, see full details, and move it forward a stage (or reject) with optional notes at each transition.
5. **Notifications** — every stage change should notify the applicant (email or in-app; keep simple, e.g. Clerk + a notifications table).

### Adoption Stages (shared between adopter and staff views)
Define a single enum both sides read from, so the adopter always sees the same stage label staff set:
```
submitted -> under_review -> approved -> (finalized/completed)
                           -> rejected
```
- `submitted`: application received, not yet opened by staff
- `under_review`: staff actively reviewing (interview, reference/home check, etc. — keep sub-notes in reviewNotes rather than new statuses unless required)
- `approved`: staff approved, pending final steps (e.g. fee payment, pickup scheduling)
- `completed`: adoption finalized, animal marked adopted
- `rejected`: staff declined, with reviewNotes explaining why (shown to adopter)

Each stage transition should be timestamped (see `statusHistory` below) so both the adopter's progress view and the staff dashboard can show "when" as well as "what stage."

## User Roles Relevant to This Module
- Non-registered: can view listings only, cannot apply
- Registered (adopter): can submit and track applications
- Staff: can review, approve, reject applications
- (Veterinarian role exists elsewhere in the system — not relevant to this module unless a vet health-check sign-off is required before approval; flag if this comes up)

## Code Standards
- TypeScript strict mode
- Use functional React components with hooks
- API routes should validate input (e.g. zod) before hitting the DB
- Keep DB access in a service/repository layer, not directly in route handlers
- Naming: camelCase for variables/functions, PascalCase for components/types

## Data Model (adoption-related, draft — adjust as needed)
```
AdoptionApplication {
  id
  animalId       (FK -> Animal)
  applicantId    (FK -> User)
  status         enum: submitted | under_review | approved | completed | rejected
  housingInfo    text
  experience     text
  reason         text
  reviewedBy     (FK -> User, nullable)
  reviewNotes    text (nullable)
  createdAt
  updatedAt
}

AdoptionStatusHistory {
  id
  applicationId  (FK -> AdoptionApplication)
  status         enum (same as above)
  changedBy      (FK -> User, nullable — null if system-generated e.g. initial "submitted")
  note           text (nullable)
  createdAt
}
```
Use `AdoptionStatusHistory` to render the adopter's progress stepper and the staff dashboard's "last updated" info — don't rely on `AdoptionApplication.status` alone, since it can't show past transitions.

Adjust field names to match whatever schema the Animal/User tables already use elsewhere in the project — check for an existing Prisma/Drizzle schema before creating a new one.

## What NOT to touch
- Search functionality
- Report generation / dynamic rescue summary page
- On-call/report system for animal intake (unless the adoption flow needs to read animal status from it)

## Open Questions to Flag, Not Guess
- Whether adoption fees go through Stripe or are handled offline
- Whether vet sign-off gates approval
- Final DB schema for Animal/User if not yet established by teammates