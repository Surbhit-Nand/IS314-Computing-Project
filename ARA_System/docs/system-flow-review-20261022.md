# System logic and flow review — 22 October 2026

Scope: code review of navigation and role gates, rescue reporting and dispatch,
intake handoff, veterinary assessment/treatment/clearance, publication and search,
adoption submission/review/ownership, appointment booking, donations and analytics.
Existing local edits were preserved. No live business records were created or changed.
This is a code and automated-test review, not a completed browser walkthrough of every role.

## Fixes in this review

- Preserve `publishedAt` in navigation's validated animal snapshot. Previously the
  validator discarded this API field while moving between listings, profiles and applications.
  Added a regression test for profile and application navigation.
- Prevent anonymous restoration of a closed animal profile from browser history,
  consistent with the public listing's closed-animal exclusion.
- Show the profile's Adopt button only for published, medically cleared animals
  that are neither adopted nor closed, matching the submission service's checks.
- Hide the veterinary queue shortcut on the staff dashboard for non-veterinarians.
  The summary remains visible; medical record access remains veterinarian-only.

## Outstanding findings

### High: donations report payment success without a payment provider

`src/features/donations/DonateModal.tsx` submits to a record-creation API and then
shows a payment-style success message. `donations.service.ts` creates a database
record without charging a card or verifying a QR payment; the schema defaults
the status to `completed`. Reports aggregate these completed records as donations.
The QR graphic is a placeholder. Before real use, connect verified payment
processing or explicitly implement a pledge flow with pending status and truthful
copy. A UI wording change alone would leave inaccurate financial totals.

### Accepted workflow: staff register animals after shelter arrival

`markIntakeHandoffReceived` marks the handoff received and audits it. Registration
is separate; it does not create or link a profile in this operation. Staff must
manually register the rescued animal after the dispatcher brings it to the shelter.
The user confirmed that this separation is intentional. Automatic profile linkage
is an optional traceability improvement, not a required workflow fix.

### Medium: adoption status writes are not atomic across the workflow

Approval/completion updates the application, then the animal, then history and
audit. Animal-update failure has best-effort compensation, and a unique index
prevents competing approvals. However, later history/audit failures can leave a
changed application while returning an error, and rollback itself can fail.
Use a database transaction for the related writes, with notifications after commit.

### Metric definitions requiring consistent interpretation

- Rescue alerts now count active reports across all submission sources.
- Medical queue counts active animals without medical clearance.
- Applications still counts submitted/under-review applications; the management
  Active tab additionally includes approved applications awaiting completion.
  The card's review wording fits its current definition, but it is not the Active total.
- Animals to intake counts profiles with lifecycle status `intake`, not pending
  rescue handoffs. Veterinary care uses a separate veterinary status, so these
  groups can overlap; the four cards are not mutually exclusive populations.

## Existing safeguards checked

- Public discovery requires publication, medical clearance and an active profile.
- Adoption submission rechecks availability, publication and clearance on the server.
- Approval rejects self-approval and competing approved adoptions; approval transfers
  ownership and removes the animal from public listings, completion finishes the workflow.
- Veterinary clearance requires an examination and resolved care requirements.
- Booking validates ownership/staff access, clinic slots and conflicting appointments.
- Navigation validates session roles/context; server route gates remain authoritative.
- Rescue reporting accepts online/phone sources, validates Fiji coordinates, and
  separates active missions from resolved history.

## Verification and limits

The final full suite passed 549 tests with zero failures. The production build,
lint and diff whitespace checks passed. Regression results are recorded in the
accompanying review run logs at the repository root.
Browser tests may short-circuit when their required browser environment is absent;
a passing suite is not proof of a complete browser walkthrough.

Remaining manual validation: walk through each role with dedicated test accounts,
exercise the rescue-to-registration handoff, complete an adoption and appointment,
and test narrow-screen layouts. Real payments remain unimplemented and should
not be treated as verified by these checks.
