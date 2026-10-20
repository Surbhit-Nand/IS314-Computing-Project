# Adoption Module: Test Cases

> **Status:** Implemented and passing.
> **Module:** Adoption Application & Rescue Reporting, adoption half.
> **System:** ARA — Animal Rescue & Adoption Management System, SPCA Fiji (Group 7, IS314 Computing Project).
> **Date:** 2026-10-19

## Summary

| Item                    | Value                                                                    |
| ----------------------- | ------------------------------------------------------------------------ |
| Backend suite           | `server/src/modules/adoptions/adoptions.service.test.ts` (46 cases)      |
| HTTP-layer suite        | `server/src/modules/adoptions/adoptions.validation.test.ts` (32 cases)   |
| Repository suite        | `server/src/modules/adoptions/adoptions.repository.test.ts` (3 cases)    |
| Frontend queue suite    | `src/features/adoptions/adoptionQueue.test.ts` (3 cases)                 |
| Applicant-labels suite  | `src/types/adoption.test.ts` (3 cases)                                   |
| Total test cases        | **87**                                                                   |
| Runner                  | `node --import tsx --experimental-test-module-mocks --test` (via `npm test`) |
| Environment             | Node v24.21.0, tsx, no database / Clerk / mail provider required          |
| Where tested            | Local development workstation, branch `main` @ `8493fb2`                  |
| Date of run             | 2026-10-19, 15:17 (Fiji Standard Time, UTC+12)                           |
| Verified result         | **87 tests, 13 suites, 87 pass, 0 fail**                                 |
| Whole suite at that commit | **465 tests, 57 suites, 465 pass, 0 fail**                            |

The suites divide the module by layer: `adoptions.service.ts` (business
rules, with every collaborator stubbed), `adoptions.routes.ts` (the zod request
schemas and the business-error → HTTP status mapping), the duplicate-application
predicate in `adoptions.repository.ts` (the real SQL, run against the Drizzle
builder with only the transport intercepted), the pure frontend queue helper
`adoptionQueue.ts`, and the applicant-facing status wording in
`src/types/adoption.ts`.

> Two defects were fixed on 2026-10-19, both missed because the service suite
> stubs their collaborators away. First, the "one active application per animal"
> check excluded only `rejected` and `completed`, so a **withdrawn** application
> blocked re-applying for that animal for ever (see AD-80 to AD-82). Second,
> `withdrawAdoptionApplication` notified nobody, so "notified on any status
> change" was false for a self-cancellation (see AD-83 and AD-84).

## Environment (test rig)

| Item                    | Value                                                                 |
| ----------------------- | --------------------------------------------------------------------- |
| Device                  | Lenovo IdeaPad Slim 5 16IRL8 (machine type `82XF`), x64-based PC       |
| Processor               | 13th Gen Intel Core i5-1335U — 10 cores / 12 logical processors, 1.30 GHz reported base |
| Installed memory (RAM)  | 16 GB (2 x 8 GB Micron DDR5-6400); 15.73 GB usable                     |
| Graphics                | Intel Iris Xe (integrated)                                            |
| Operating system        | Microsoft Windows 11 Home, build 10.0.26300, 64-bit                    |
| BIOS                    | LENOVO `LACN41WW`                                                     |
| Where tested            | Local development workstation above - repository at `C:\Users\surbh\SWE\IS314-Computing-Project\ARA_System`, branch `main`, commit `8493fb2` (this report is committed immediately after it and changes no code) |
| Connection type         | Wi-Fi (Intel Wi-Fi 6 AX203, 802.11); IPv4 and IPv6 Internet connectivity |
| Date of run             | 2026-10-19, 15:17 (Fiji Standard Time, UTC+12)                         |
| Toolchain               | Node v24.21.0, npm 11.19.0, PowerShell 7.6.6, tsx                      |

The adoption suites run fully offline against stubbed collaborators or pure
schemas: no database, Clerk instance, mail provider or network access is
required, so connection type and latency do not affect the results. The Wi-Fi
network name is deliberately omitted. Node's test reporter does not print a
timestamp, so the date above is the wall-clock time the run was executed.

## How to run

```sh
npm install
npm test
```

`npm install` is required before the first run: the whole-suite dev dependency
`@electric-sql/pglite` must be present (five unrelated suites import it), and
`npm test` needs `--experimental-test-module-mocks`. The `test` script globs
`server/src/**/*.test.ts` and `src/**/*.test.ts`, so all three adoption suites
are picked up automatically. To run only the adoption cases:

```sh
node --import tsx --experimental-test-module-mocks --test `
  server/src/modules/adoptions/adoptions.service.test.ts `
  server/src/modules/adoptions/adoptions.validation.test.ts `
  src/features/adoptions/adoptionQueue.test.ts
```

## Test strategy

- **No live infrastructure (service suite).** Every collaborator of
  `adoptions.service.ts` is replaced with `node:test`'s `mock.module` *before*
  the service is imported: the adoptions repository (`adoptions.repository.js`),
  `animals.service.js`, `shared/audit/audit.service.js`,
  `notifications/notifications.service.js`, `services/email.js`,
  `services/staffDirectory.js` and `services/clerkClient.js`. Each stub forwards
  to a test-provided implementation held in an `impls` map, so individual cases
  swap behaviour per test while the module-namespace functions stay stable.
- **No mocks at all (validation suite).** `adoptions.validation.test.ts` imports
  the real schemas with plain `import`s after setting dummy
  `CLERK_SECRET_KEY` / `DATABASE_URL` / Cloudinary variables. It deliberately
  avoids `mock.module`, which is why it runs on any Node version (see the
  caveat in Appendix B).
- **Rules, not framework.** Cases assert the business rules at the service
  boundary — illegal transitions, the veterinary-clearance gate at both submit
  and approval, the single-approval conflict guard, terminal-state locking,
  review-note enforcement, applicant-only withdrawal, self-review refusal, the
  compensating writes, and best-effort notification behaviour.
- **Stateful fakes.** `statefulApplication()` wires a mutable in-memory
  application row so transition tests behave like the real database: the service
  fetches the row, the status update mutates it, and the final re-fetch returns
  the fresh state. `resetImpls()` runs before every test, so cases cannot leak
  state into each other.
- **Frontend helper.** `adoptionQueue.ts` is a pure module backing the staff
  review queue's Active/History tabs and their status dropdowns; it has no DOM
  dependency, so it is covered directly.

## Regression sensitivity

The following cases map to the module's load-bearing guarantees and will fail if
the rule is weakened:

- `AD-12` / `AD-13` — cat adoptions are screened for applicant respiratory
  conditions; dog adoptions are not.
- `AD-26` — approval is gated on `animals.medically_cleared`, on no other
  approval existing for the animal, and it **marks the animal `adopted` in the
  same action** (ownership transfer, removing it from public listings).
- `AD-27` — the hard veterinary-clearance gate refuses `under_review -> approved`
  when the animal is not cleared. `AD-21` applies the same gate at submission.
- `AD-28` — completion re-asserts `adopted`, kept idempotent for applications
  approved before the ownership rule existed.
- `AD-35` — concurrent-approval guard: a second approval for the same animal is
  refused (`findAdoptionConflict`), and `AD-39` maps the *real* `23505` race
  (the partial unique index `adoption_animal_unique_active`) to the same 409.
- `AD-36`–`AD-32` — no illegal jumps and no escape from `completed` /
  `rejected` / `withdrawn`.
- `AD-33` / `AD-34` — `rejected` requires `reviewNotes`, and the note is
  preserved on the record for the applicant.
- `AD-40` — a reviewer cannot approve their own application (403).
- `AD-41` / `AD-23` — the two non-transactional write pairs are compensated: a
  failed animal update restores the previous application status, and a failed
  first history write deletes the application row.
- `AD-20` / `AD-38` — notification and email failures must never abort a submit
  or a transition.
- `AD-25` — every transition writes an `adoptionStatusHistory` row and an audit
  entry with actor and from/to status; `AD-22` covers the submission audit.
- `AD-45`–`AD-76` — the request-schema contract (every required field and
  conditional rule) and the typed-error → HTTP status mapping that stops a
  reworded 409 becoming a 500.

## Test cases — Lifecycle and queries

`adoptions.service.test.ts`, `adoptions.service` / `listAdoptionApplications` /
`listMyAdoptionApplications` / `getAdoptionApplicationDetail`.

| ID    | Test case                                                                    | Rule under test                                     | Preconditions / stubs                                                          | Expected result                                                                                     | Actual | Status |
| ----- | ---------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------ | ------ |
| AD-01 | Declares the full lifecycle statuses                                          | The six lifecycle states are fixed and ordered      | None                                                                           | `ADOPTION_STATUSES` deep-equals `submitted, under_review, approved, completed, rejected, withdrawn`  | As expected | Pass |
| AD-02 | `listAdoptionApplications` returns everything the repository finds             | Staff queue is a straight pass-through of stored rows | `findAllAdoptionApplications` returns two rows                                | Result is the same two rows                                                                          | As expected | Pass |
| AD-03 | `listMyAdoptionApplications` queries by the caller's Clerk user id and attaches each application's history | Applicants only see their own applications, and the list carries their timelines | `findAdoptionApplicationsByApplicant` asserts the id; `findAdoptionStatusHistoryByApplications` asserts the id list and returns two entries | Queried with `APPLICANT_ID`; one row returned carrying its two-entry `history`                        | As expected | Pass |
| AD-04 | `listMyAdoptionApplications` skips the history lookup when the applicant has no applications | An empty queue costs no second query | `findAdoptionApplicationsByApplicant` returns `[]`                             | Result is `[]`                                                                                       | As expected | Pass |
| AD-05 | `getAdoptionApplicationDetail` returns the application joined with its status history | Detail view carries the timeline            | `findAdoptionApplicationById` returns an application; history returns one entry | `result.id` matches and `result.history` is the history array                                         | As expected | Pass |
| AD-06 | `getAdoptionApplicationDetail` returns `undefined` when the application does not exist | Missing records are not an error       | `findAdoptionApplicationById` returns `undefined`                               | `undefined`                                                                                          | As expected | Pass |

## Test cases — Submit application (`submitAdoptionApplication`)

`adoptions.service.test.ts`. All rows below submit `input` with `APPLICANT_ID` as
the caller.

| ID    | Test case                                                             | Rule under test                                                       | Preconditions / stubs                                                                                   | Input                                                        | Expected result                                                                                   | Actual | Status |
| ----- | --------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------ | ------ |
| AD-07 | Creates a submitted application and its first history entry           | A new application starts `submitted` and is timeline-tracked          | Animal exists; no active application; `createAdoptionApplication` echoes the input                         | Valid full application payload                                | Row returned with `status: "submitted"`, applicant id, and all submitted fields; exactly one history entry with `status: "submitted"`, `changedByClerkUserId: null`, `note: null` | As expected | Pass |
| AD-08 | Throws when the animal does not exist                                 | Cannot apply for a non-existent animal                                | `getAnimalById` returns `undefined`                                                                       | Valid payload                                                 | Rejects with `/no longer available/`                                                              | As expected | Pass |
| AD-09 | Throws when the animal has been soft-deleted                          | Soft-deleted animals are not adoptable                                | `getAnimalById` returns an animal with `deletedAt` set                                                    | Valid payload                                                 | Rejects with `/no longer available/`                                                              | As expected | Pass |
| AD-10 | Throws when the animal is already adopted                             | Adopted animals are not adoptable                                     | `getAnimalById` returns an animal with `status: "adopted"`                                                | Valid payload                                                 | Rejects with `/no longer available/`                                                              | As expected | Pass |
| AD-11 | Throws when the applicant already has an active application for the animal | One active application per applicant per animal                 | `findActiveAdoptionApplication` returns an existing application                                           | Valid payload                                                 | Rejects with `/already applied/`                                                                  | As expected | Pass |
| AD-12 | Blocks a cat adoption for an applicant with a respiratory condition   | Allergen screening for cats                                           | Animal `type: "cat"`                                                                                      | Payload with `respiratoryIssues: "yes"`                       | Rejects with `/respiratory condition/`                                                            | As expected | Pass |
| AD-13 | Allows a dog adoption for an applicant with a respiratory condition   | Screening is cat-specific, not a blanket block                        | Animal `type: "dog"`; no active application; create echoes input                                           | Payload with `respiratoryIssues: "yes"`                       | Application created (`id` present)                                                                | As expected | Pass |
| AD-14 | Stores guardian details for a minor applicant                         | Minors require a consenting guardian                                  | Animal exists; no active application; create captures the payload                                         | `ageBracket: "minor"` + guardian name, contact, relationship, consent | Stored row has `guardianName: "Jone Koro"` and `guardianConsent: true`                            | As expected | Pass |
| AD-15 | Stores the identification document on submit                          | ID verification is captured at application time                        | Animal exists; no active application; create captures the payload                                         | `idDocumentType: "voter_card"` + Cloudinary `idDocumentUrl`   | Stored row has the matching document type and URL                                                 | As expected | Pass |
| AD-16 | Stores the next-of-kin backup contact on submit                       | A secondary contact is recorded                                        | Animal exists; no active application; create captures the payload                                         | Next-of-kin name and contact                                  | Stored row has `nextOfKinName: "Jone Koro"` and `nextOfKinContact: "+679 9900001"`                | As expected | Pass |
| AD-17 | Uploads an ID photo through the injected uploader                     | Upload provider is injected, not hard-wired                           | Uploader stub injected as a parameter                                                                     | A `Buffer` of fake image bytes                                | Returns the stub URL and the uploader was called exactly once                                     | As expected | Pass |
| AD-18 | Notifies the applicant in-app and by email on submit                  | Applicant gets an acknowledgement                                     | Animal exists; create echoes input; notification and email spies                                          | Valid payload                                                 | One in-app notification to `APPLICANT_ID` with `toStatus: "submitted"`; one email to the applicant's address | As expected | Pass |
| AD-19 | Notifies the review team in-app and by email on submit                | Staff are alerted to a new application                                | `listStaffContacts` returns a staffer with an email and a manager without one                             | Valid payload                                                 | One staff notification listing both Clerk ids; exactly one staff email, to the staffer who has an address | As expected | Pass |
| AD-20 | Still completes the submit when staff notification fails              | Notifications are best-effort, never blocking                         | `listStaffContacts` throws `"clerk down"`                                                                 | Valid payload                                                 | Application still created; applicant notified; zero staff notifications                            | As expected | Pass |
| AD-21 | Rejects an application for an animal that is not medically cleared     | **The clearance gate also runs at submission**, not only at approval  | `getAnimalById` returns an animal with `medicallyCleared: false`                                          | Valid payload                                                 | Rejects with `/not yet medically cleared/`; no application created                                 | As expected | Pass |
| AD-22 | Audits the submission                                                 | Every submission is recorded on the audit trail                       | Animal exists; no active application; create echoes input; `auditSpy` captures calls                      | Valid payload                                                 | One audit entry `adoption.application.submitted` with metadata `{ animalId: ANIMAL_ID }`            | As expected | Pass |
| AD-23 | Removes the application if its first history entry cannot be written  | A half-written application is never left behind                       | `createAdoptionStatusHistoryEntry` throws `"history insert failed"`                                       | Valid payload                                                 | Rejects with `/history insert failed/`; `deleteAdoptionApplication` called once with `APPLICATION_ID` | As expected | Pass |

## Test cases — Status transition (`transitionAdoptionApplication`)

`adoptions.service.test.ts`. All rows call the service with `ACTOR_ID` as the
acting staff member.

| ID    | Test case                                                              | Rule under test                                                            | Preconditions / stubs                                                                    | Input                                                        | Expected result                                                                                                    | Actual | Status |
| ----- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------ | ------ |
| AD-24 | Returns `undefined` when the application does not exist                | Unknown ids are a no-op, not a crash                                        | `findAdoptionApplicationById` returns `undefined`                                         | `{ status: "under_review" }`                                 | `undefined`                                                                                                        | As expected | Pass |
| AD-25 | Moves `submitted -> under_review` and records actor history + audit    | First staff action is tracked with actor and audit trail                    | Stateful row starting `submitted`                                                         | `{ status: "under_review" }`                                 | Status becomes `under_review`; one history row (`changedByClerkUserId: ACTOR_ID`); one audit entry `adoption.application.status_changed` with `{ animalId, fromStatus, toStatus }`; animal untouched | As expected | Pass |
| AD-26 | Approves the application and assigns the animal to the adopter         | Approval transfers ownership and removes the animal from public listings     | Stateful row `under_review`; animal `medicallyCleared: true`; no conflict                 | `{ status: "approved" }`                                      | Status becomes `approved`; animal updated with `{ status: "adopted" }`                                              | As expected | Pass |
| AD-27 | Blocks approval when the animal is not medically cleared               | **Veterinary-clearance hard gate**                                          | Stateful row `under_review`; `getAnimalById` returns `medicallyCleared: false`            | `{ status: "approved" }`                                      | Rejects with `/not yet medically cleared/`; row stays `under_review`; animal untouched                              | As expected | Pass |
| AD-28 | Moves `approved -> completed` and keeps the animal adopted             | Completion is idempotent for the ownership rule                              | Stateful row `approved`                                                                   | `{ status: "completed" }`                                     | Status becomes `completed`; animal updated with `{ status: "adopted" }` (re-asserted)                               | As expected | Pass |
| AD-29 | Rejects `submitted -> approved` as a direct jump                       | No skipping the review step                                                 | Application row `submitted`                                                               | `{ status: "approved" }`                                      | Rejects with `/cannot move from "submitted" to "approved"/`                                                         | As expected | Pass |
| AD-30 | Rejects `approved -> rejected` (no stepping backwards)                 | Decided applications cannot be reversed through this path                   | Application row `approved`                                                                | `{ status: "rejected" }`                                      | Rejects with `/cannot move from "approved" to "rejected"/`                                                          | As expected | Pass |
| AD-31 | Rejects any move out of the terminal `completed` state                 | `completed` is terminal                                                      | Application row `completed`                                                               | `{ status: "under_review" }`                                  | Rejects with `/terminal state/`                                                                                     | As expected | Pass |
| AD-32 | Rejects any move out of the terminal `rejected` state                  | `rejected` is terminal                                                       | Application row `rejected`                                                                | `{ status: "submitted" }`                                     | Rejects with `/terminal state/`                                                                                     | As expected | Pass |
| AD-33 | Requires a review note when rejecting                                  | Applicants must be told why                                                   | Application row `submitted`                                                               | `{ status: "rejected" }` (no note)                            | Rejects with `/review note/i`                                                                                       | As expected | Pass |
| AD-34 | Rejects with a review note and preserves the note on the application   | The rejection reason is stored and shown to the applicant                    | Stateful row `submitted`                                                                  | `{ status: "rejected", reviewNotes: "Home visit found no fenced yard" }` | Status becomes `rejected`; `reviewNotes` stored on the record; history row carries the same note                    | As expected | Pass |
| AD-35 | Blocks approval when another application for the animal is already approved | Only one application per animal can be approved (race guard)          | Row `under_review`; `findAdoptionConflict` returns an already-approved application         | `{ status: "approved" }`                                      | Rejects with `/Another applicant has already been approved/`                                                        | As expected | Pass |
| AD-36 | Allows a same-status no-op transition but still records it             | Idempotent writes are still auditable                                        | Stateful row `submitted`                                                                  | `{ status: "submitted" }`                                     | Status stays `submitted`; one history row (`note: null`); one audit entry with `fromStatus` = `toStatus`             | As expected | Pass |
| AD-37 | Notifies the applicant in-app and by email on every transition         | Status changes reach the applicant                                           | Stateful row `submitted`                                                                  | `{ status: "under_review" }`                                  | One in-app notification to the applicant with `toStatus: "under_review"`; one email with the same `toStatus`        | As expected | Pass |
| AD-38 | Still completes the transition when notification and email fail        | Notification failures never roll back a status change                        | `createAdoptionStatusNotification` and `sendAdoptionStatusEmail` both throw               | `{ status: "under_review" }`                                  | Status becomes `under_review`; history and audit entries still written                                              | As expected | Pass |
| AD-39 | Turns a unique-violation from a concurrent approval into a conflict    | The **real** double-approval race returns 409, not 500                       | Row `under_review`; `updateAdoptionApplicationStatus` throws an error with `code: "23505"` | `{ status: "approved" }`                                      | Rejects with `/Another applicant has already been approved/` (typed `AdoptionBusinessError(409)`)                    | As expected | Pass |
| AD-40 | Refuses to let a reviewer approve their own application                | Separation of applicant and reviewer cannot be bypassed                     | Stateful row `under_review`; acting user **is** `APPLICANT_ID`                             | `{ status: "approved" }`                                      | Rejects with `/your own adoption application/`; row stays `under_review`                                            | As expected | Pass |
| AD-41 | Restores the previous status if marking the animal adopted fails       | The two non-transactional writes are compensated                             | Stateful row `approved`; `updateAnimalProfile` throws `"animal update failed"`             | `{ status: "completed" }`                                     | Rejects with `/animal update failed/`; the row is restored to `approved`                                            | As expected | Pass |

## Test cases — Applicant withdrawal (`withdrawAdoptionApplication`)

`adoptions.service.test.ts`. Withdrawal is a separate service entry point behind
`POST /api/adoptions/:id/withdraw`, never a reviewer status move.

| ID    | Test case                                                     | Rule under test                                                        | Preconditions / stubs                              | Expected result                                                                                       | Actual | Status |
| ----- | ------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------ | ------ |
| AD-42 | Withdraws the applicant's own submitted application            | The applicant may cancel their own live application                    | Stateful row `submitted`; caller is `APPLICANT_ID` | Status becomes `withdrawn`; history row with `status: "withdrawn"`; audit entry `adoption.application.withdrawn` | As expected | Pass |
| AD-43 | Refuses to withdraw someone else's application                 | Only the owner can withdraw                                            | Stateful row `submitted`; caller is another Clerk id | Rejects with `/your own adoption application/`                                                       | As expected | Pass |
| AD-44 | Refuses to withdraw an application that is already decided     | Decided applications are immutable through this path                   | Stateful row `rejected`                            | Rejects with `/terminal state/`                                                                       | As expected | Pass |

## Test cases — Request validation (`adoptions.validation.test.ts`)

The zod schemas and the error → HTTP status mapping that the adoption routes
apply. Each rejected row asserts the **first zod issue's message verbatim**, so
the copy the applicant sees is part of the contract.

### `applicationSchema` (`POST /api/adoptions`)

| ID    | Test case                                                                                  | Rule under test                                            | Input (over a valid adult application)                                | Expected result                                   | Actual | Status |
| ----- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------- | ------ | ------ |
| AD-45 | Accepts a complete adult application                                                       | The happy path parses                                      | Full valid payload                                                    | `safeParse().success` is `true`                   | As expected | Pass |
| AD-46 | Accepts a minor application when all four guardian answers are present                     | Guardian block is complete for minors                      | `ageBracket: "minor"` + name, contact, relationship, `consent: true`  | Parses successfully                               | As expected | Pass |
| AD-47 | Accepts a dog application declaring a respiratory condition (gate is species-specific)      | The allergen gate is **not** in the schema                 | `respiratoryIssues: "yes"`                                            | Parses successfully (the species check is a service rule, AD-12/AD-13) | As expected | Pass |
| AD-48 | Normalizes an empty optional text field to `undefined`                                     | Blank optional text is not stored as whitespace            | `previousPetOutcome: "   "` with `ownedPetsBefore: "no"`              | Parses; `data.previousPetOutcome` is `undefined`  | As expected | Pass |
| AD-49 | Treats a whitespace-only previous-pet outcome as missing                                   | Whitespace does not satisfy a required field               | `ownedPetsBefore: "yes"`, `previousPetOutcome: "   "`                 | `"Tell us what happened to your previous pet(s)"` | As expected | Pass |
| AD-50 | Rejects a non-UUID `animalId`                                                              | The animal link must be a real id                          | `animalId: "not-a-uuid"`                                              | `"Link a valid animal"`                           | As expected | Pass |
| AD-51 | Rejects a missing full name                                                                | Applicant identity is required                             | `fullName: ""`                                                        | `"Tell us your full name"`                        | As expected | Pass |
| AD-52 | Rejects a missing contact number                                                           | A reachable phone number is required                       | `contactNumber: ""`                                                   | `"Tell us your contact number"`                   | As expected | Pass |
| AD-53 | Rejects an invalid email address                                                           | Email must be well-formed                                  | `applicantEmail: "mere@"`                                             | `"Enter a valid email address"`                   | As expected | Pass |
| AD-54 | Rejects an invalid age bracket                                                             | Only `adult` / `minor` are accepted                        | `ageBracket: "child"`                                                 | `"Tell us whether you are 18 or older"`           | As expected | Pass |
| AD-55 | Rejects a missing identification document type                                             | Which ID was shown must be recorded                        | `idDocumentType: ""`                                                  | `"Choose your identification document type"`      | As expected | Pass |
| AD-56 | Rejects a missing identification document photo URL                                        | The ID photo is mandatory                                  | `idDocumentUrl: ""`                                                   | `"Upload your identification document photo"`     | As expected | Pass |
| AD-57 | Rejects a missing vet cost plan                                                            | The applicant must say how vet care is funded              | `vetCostPlan: ""`                                                     | `"Tell us how you will cover veterinary costs"`   | As expected | Pass |
| AD-58 | Rejects a missing next-of-kin name                                                         | A backup contact is mandatory                              | `nextOfKinName: ""`                                                   | `"Tell us who looks after the animal when you are unavailable"` | As expected | Pass |
| AD-59 | Rejects a missing next-of-kin contact                                                      | The backup contact needs a number                          | `nextOfKinContact: ""`                                                | `"Tell us your next of kin's contact number"`     | As expected | Pass |
| AD-60 | Rejects a missing `adoptionFor` choice                                                     | Who the animal is for must be stated                       | `adoptionFor: ""`                                                     | `"Choose who this adoption is for"`               | As expected | Pass |
| AD-61 | Rejects a minor application missing guardian consent                                       | Minor applications require explicit consent                | `ageBracket: "minor"`, guardian details but no consent                | `"Your parent or guardian must consent to this adoption"` | As expected | Pass |
| AD-62 | Rejects a minor application missing the guardian relationship                              | Consent alone is not enough                                | `ageBracket: "minor"`, consent `true`, no relationship                | `"Choose their relationship to you"`              | As expected | Pass |
| AD-63 | Rejects guardian details supplied by an adult applicant                                    | Guardian fields are minor-only (no silent acceptance)      | `ageBracket: "adult"` + `guardianName`                                | `"Guardian details are only needed for applicants under 18"` | As expected | Pass |
| AD-64 | Requires a previous-pet outcome when the applicant has owned pets before                   | Conditional required field                                 | `ownedPetsBefore: "yes"` (no outcome)                                 | `"Tell us what happened to your previous pet(s)"` | As expected | Pass |
| AD-65 | Requires current-pet details when the applicant has current pets                           | Conditional required field                                 | `hasCurrentPets: "yes"` (no details)                                  | `"Tell us about your current pets"`               | As expected | Pass |

### `transitionSchema` (`PATCH /api/adoptions/:id`)

| ID    | Test case                                                                     | Rule under test                                                 | Input                                   | Expected result                              | Actual | Status |
| ----- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------- | -------------------------------------------- | ------ | ------ |
| AD-66 | Accepts a status-only transition                                              | A reviewer may move status without a note                       | `{ status: "under_review" }`            | Parses successfully                          | As expected | Pass |
| AD-67 | Accepts every reviewer status                                                 | The five reviewer statuses are all writable                     | Each of `submitted, under_review, approved, completed, rejected` | All parse successfully              | As expected | Pass |
| AD-68 | Rejects withdrawal: only the applicant can withdraw, via its own route        | `withdrawn` is **not** a reviewer status                        | `{ status: "withdrawn" }`               | Rejected                                     | As expected | Pass |
| AD-69 | Rejects an unknown status                                                     | No free-text statuses                                           | `{ status: "canceled" }`                | Rejected                                     | As expected | Pass |
| AD-70 | Normalizes an empty review note to `undefined`                                | A blank note is not stored                                      | `{ status: "rejected", reviewNotes: "   " }` | Parses; `data.reviewNotes` is `undefined` | As expected | Pass |

### `businessErrorStatus` (error → HTTP status mapping)

| ID    | Test case                                                                          | Rule under test                                                          | Input                                                                 | Expected result | Actual | Status |
| ----- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- | --------------- | ------ | ------ |
| AD-71 | Maps a typed conflict to 409                                                       | `AdoptionBusinessError` carries its own status                            | `AdoptionBusinessError(409, …)`                                       | `409`           | As expected | Pass |
| AD-72 | Maps typed lifecycle and permission rejections to their own status                 | 400 and 403 survive the mapping                                           | `AdoptionBusinessError(400, …)`; `AdoptionBusinessError(403, …)`      | `400`; `403`    | As expected | Pass |
| AD-73 | Maps a Postgres unique violation (the real double-approval race) to 409            | A raw `23505` becomes a conflict, not a 500                               | `Error` with `code: "23505"`                                          | `409`           | As expected | Pass |
| AD-74 | Maps a unique violation wrapped in a cause chain to 409                            | Driver-wrapped violations are unwrapped                                   | `Error({ cause: <23505 error> })`                                     | `409`           | As expected | Pass |
| AD-75 | Returns `null` for an unrecognized error (falls through to the 500 handler)        | Only known shapes are translated                                          | `new Error("something unexpected")`                                   | `null`          | As expected | Pass |
| AD-76 | Returns `null` for a non-`Error` value                                             | Thrown non-errors are not misread as business errors                      | `"boom"`                                                              | `null`          | As expected | Pass |

## Test cases — Staff queue tabs (frontend helper)

`src/features/adoptions/adoptionQueue.test.ts`.

| ID    | Test case                                              | Rule under test                                                 | Preconditions / stubs | Expected result                                                                                                     | Actual | Status |
| ----- | ------------------------------------------------------ | --------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| AD-77 | Treats `completed`, `rejected` and `withdrawn` as terminal | Finished applications move out of the live queue            | None                  | `isTerminalAdoptionStatus` is true for `completed` / `rejected` / `withdrawn`, false for `submitted`, `under_review`, `approved` | As expected | Pass |
| AD-78 | Splits every lifecycle status across exactly one tab   | No status is orphaned or shown in both tabs                     | None                  | Active + History tab statuses sorted equal `approved, completed, rejected, submitted, under_review, withdrawn`        | As expected | Pass |
| AD-79 | Matches dropdown options to their tab                  | Filter options cannot drift from the tabs                       | None                  | `ACTIVE_STATUS_FILTERS` matches the Active tab; `HISTORY_STATUS_FILTERS` matches the History tab                       | As expected | Pass |

## Test cases — Duplicate-application predicate (repository)

`server/src/modules/adoptions/adoptions.repository.test.ts`. These run the real
Drizzle query builder for `findActiveAdoptionApplication` and intercept only the
database transport, so the SQL and its bound parameters are asserted without a
live database (the same technique as `animals.repository.test.ts`). They exist
because the service suite stubs this function out entirely.

| ID    | Test case                                                        | Rule under test                                                        | Preconditions / stubs        | Expected result                                                                                     | Actual | Status |
| ----- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------- | ------ | ------ |
| AD-80 | Treats `rejected`, `completed` and `withdrawn` as closed          | Only live applications block a second application for the same animal  | Transport intercepted        | The `status NOT IN` clause binds exactly `completed`, `rejected`, `withdrawn`; no live status appears | As expected | Pass |
| AD-81 | Keeps the closed-status list equal to the lifecycle's terminal statuses | The duplicate check cannot drift from `ALLOWED_TRANSITIONS`         | Transport intercepted        | The bound status list equals every status whose `ALLOWED_TRANSITIONS` entry is empty                  | As expected | Pass |
| AD-82 | Scopes the check to one animal and one applicant                  | A duplicate is per-applicant and per-animal, never global               | Transport intercepted        | SQL constrains `animal_id` and `applicant_clerk_user_id` with the given values, limited to one row   | As expected | Pass |

> **Regression this caught.** Before the fix, `findActiveAdoptionApplication`
> excluded only `rejected` and `completed`, so a withdrawn application blocked
> re-applying for that animal permanently — the opposite of the FAQ's "only one
> **active** application". AD-80 fails against the old predicate and passes
> against the corrected one. `ALLOWED_TRANSITIONS` is now exported from the
> service so AD-81 can pin the two lists together instead of leaving a fourth
> hard-coded copy to drift.

## Test cases — Withdrawal notification and applicant status wording

Withdrawal is a status change the applicant triggers themselves, so it must
reach them the same way a staff transition does (AD-83, AD-84, extending the
service suite). The applicant's own views never present `withdrawn` as a
lifecycle status — it reads as a cancellation — while staff queues keep the
"Withdrawn" wording, pinned by `src/types/adoption.test.ts` (AD-85 to AD-87).

| ID    | Test case                                                      | Rule under test                                                   | Preconditions / stubs                        | Expected result                                                                                                    | Actual | Status |
| ----- | -------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| AD-83 | Notifies the applicant that their withdrawal was recorded      | A self-cancellation is a status change like any other             | Stateful row `submitted`; caller is `APPLICANT_ID` | One notification row (`toStatus: "withdrawn"`, recipient = applicant) and one email attempted (`toStatus: "withdrawn"`) | As expected | Pass |
| AD-84 | Still records the withdrawal when notification or email fails  | Notification is best-effort, never blocking the write             | Notification store and mail provider both throw | Withdrawal still commits: status becomes `withdrawn`; audit entry `adoption.application.withdrawn` written              | As expected | Pass |
| AD-85 | Presents a withdrawal as a cancellation                        | The applicant never sees `withdrawn` as a lifecycle status        | None                                          | `applicantClosureShortLabel("withdrawn")` = "Cancelled"; `applicantClosureLabel("withdrawn")` = "Cancelled by you"   | As expected | Pass |
| AD-86 | Delegates every other status to the shared labels              | Cancellation wording changes withdrawal only, nothing else        | None                                          | Both helpers equal `adoptionStatusShortLabel` / `adoptionStatusLabel` for the other five statuses                    | As expected | Pass |
| AD-87 | Never leaks "withdrawn" to the applicant                       | Staff wording cannot reach the applicant's own view               | None                                          | No applicant label (short or long) contains "withdrawn" for any of the six statuses                                 | As expected | Pass |

> **Gap this closed.** `withdrawAdoptionApplication` wrote the status, history
> and audit rows but never called `notifyApplicantBestEffort`, so "you are
> notified on any status change" was quietly false for a withdrawal. The `withdrawn`
> copy in `notifications.service.ts` and `services/email.ts` was also missing, so
> it fell through to the generic "moved to withdrawn" text.

## Status transition matrix

The matrix the suite enforces (`ALLOWED_TRANSITIONS` in `adoptions.service.ts`).
"No-op" rows are permitted and are still written to `adoptionStatusHistory`.

| from \ to    | submitted       | under_review    | approved                                                    | completed | rejected            | withdrawn                          |
| ------------ | --------------- | --------------- | ----------------------------------------------------------- | --------- | ------------------- | ---------------------------------- |
| submitted    | Allowed (no-op) | Allowed         | Blocked (illegal jump)                                      | Blocked   | Allowed (needs note) | Allowed (applicant, own route only) |
| under_review | Blocked         | Allowed (no-op) | Allowed (needs vet clearance + no conflicting approval; marks the animal `adopted`) | Blocked | Allowed (needs note) | Allowed (applicant, own route only) |
| approved     | Blocked         | Blocked         | Blocked (no-op)                                             | Allowed (re-asserts `adopted`) | Blocked | Blocked               |
| completed    | Blocked (terminal) | Blocked      | Blocked                                                     | Blocked   | Blocked             | Blocked                            |
| rejected     | Blocked (terminal) | Blocked      | Blocked                                                     | Blocked   | Blocked             | Blocked                            |
| withdrawn    | Blocked (terminal) | Blocked      | Blocked                                                     | Blocked   | Blocked             | Blocked                            |

Two notes the matrix depends on:

- **Ownership**: approval marks the animal `adopted` (removing it from public
  listings and transferring it to the adopter); completion re-asserts the same
  state so applications approved before that rule still end up correct. Covered
  by AD-26 and AD-28, with compensation covered by AD-41.
- **`withdrawn` is not a reviewer move.** It is written only by
  `withdrawAdoptionApplication` through `POST /api/adoptions/:id/withdraw`, so it
  is excluded from `REVIEWER_STATUSES` and from `transitionSchema` (AD-68), and
  `adoptionStatusHistory` records it with the applicant as the actor (AD-42).

## Appendix A — Combined test source (single listing)

The suites are reproduced below as one continuous listing, so the report
carries a single code artifact. The runnable copies remain split by package,
because the repository typechecks them under two different TypeScript projects
(`server/tsconfig.json` with `rootDir: "src"`, and `tsconfig.app.json`), and
merging them into one physical file would move test code outside a project root
and break `npm run server:check` and `npm run build`.

```ts
// ===== server/src/modules/adoptions/adoptions.service.test.ts =====
import { beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

// Tests for the adoption module's business rules, run without a database.
//
// Every dependency of adoptions.service.ts (the adoptions repository, the
// animals service it calls to load/mark animals, and the shared audit
// service) is replaced with a stub via node:test's mock.module BEFORE the
// service is imported. Each stub forwards to a test-provided implementation
// held in the `impls` map, so individual tests swap behaviour per case while
// the module-namespace functions stay stable.
//
// Run: node --import tsx --experimental-test-module-mocks --test
//   server/src/modules/adoptions/adoptions.service.test.ts

// The stubs share one signature (they never agree on the exact repository
// types), so they're held as untyped callables.
type AnyFunction = (...args: any[]) => unknown; // eslint-disable-line @typescript-eslint/no-explicit-any

const impls = new Map<string, AnyFunction>();

function repo(name: string, impl?: AnyFunction) {
	if (impl) {
		impls.set(name, impl);
	}
	return impls.get(name) ?? null;
}

function currentImpl(name: string) {
	const fn = impls.get(name);
	if (!fn) {
		throw new Error(`Unexpected call to unmocked "${name}"`);
	}
	return fn;
}

// node:test's mock.module exposes ESM named exports through `namedExports`.
function moduleMock(specifier: string | URL, namedExports: Record<string, unknown>) {
	mock.module(specifier, { namedExports });
}

moduleMock("./adoptions.repository.js", {
	findAllAdoptionApplications: () => currentImpl("findAllAdoptionApplications")(),
	findAdoptionApplicationsByApplicant: (id: string) => currentImpl("findAdoptionApplicationsByApplicant")(id),
	findAdoptionApplicationById: (id: string) => currentImpl("findAdoptionApplicationById")(id),
	findActiveAdoptionApplication: (animalId: string, applicant: string) =>
		currentImpl("findActiveAdoptionApplication")(animalId, applicant),
	findAdoptionConflict: (animalId: string, excludeId: string) =>
		currentImpl("findAdoptionConflict")(animalId, excludeId),
	createAdoptionApplication: (input: unknown) => currentImpl("createAdoptionApplication")(input),
	deleteAdoptionApplication: (id: string) => currentImpl("deleteAdoptionApplication")(id),
	updateAdoptionApplicationStatus: (id: string, input: unknown) =>
		currentImpl("updateAdoptionApplicationStatus")(id, input),
	createAdoptionStatusHistoryEntry: (input: unknown) => currentImpl("createAdoptionStatusHistoryEntry")(input),
	findAdoptionStatusHistoryByApplication: (applicationId: string) =>
		currentImpl("findAdoptionStatusHistoryByApplication")(applicationId),
	findAdoptionStatusHistoryByApplications: (applicationIds: string[]) =>
		currentImpl("findAdoptionStatusHistoryByApplications")(applicationIds),
});

moduleMock("../animals/animals.service.js", {
	getAnimalById: (id: string) => currentImpl("getAnimalById")(id),
	updateAnimalProfile: (id: string, input: unknown) => currentImpl("updateAnimalProfile")(id, input),
});

moduleMock("../../shared/audit/audit.service.js", {
	logAuditEntry: (input: unknown) => currentImpl("logAuditEntry")(input),
});

// Notification + email side-effects of submit/transition are stubbed the same
// way: the service must notify best-effort, so tests assert the calls happen
// without ever touching a database, Clerk, or mail provider.
moduleMock("../notifications/notifications.service.js", {
	createAdoptionStatusNotification: (input: unknown) =>
		currentImpl("createAdoptionStatusNotification")(input),
	createAdoptionSubmittedStaffNotifications: (input: unknown) =>
		currentImpl("createAdoptionSubmittedStaffNotifications")(input),
});

moduleMock("../../services/email.js", {
	sendAdoptionStatusEmail: (input: unknown) => currentImpl("sendAdoptionStatusEmail")(input),
	sendAdoptionSubmittedStaffEmail: (input: unknown) =>
		currentImpl("sendAdoptionSubmittedStaffEmail")(input),
});

moduleMock("../../services/staffDirectory.js", {
	listStaffContacts: () => currentImpl("listStaffContacts")(),
});

moduleMock("../../services/clerkClient.js", {
	clerkClient: {
		users: {
			getUser: (id: string) => currentImpl("clerkGetUser")(id),
		},
	},
});


const {
	ADOPTION_STATUSES,
	getAdoptionApplicationDetail,
	listAdoptionApplications,
	listMyAdoptionApplications,
	submitAdoptionApplication,
	transitionAdoptionApplication,
	uploadAdoptionIdDocument,
	withdrawAdoptionApplication,
} = await import("./adoptions.service.js");

const APPLICATION_ID = "11111111-1111-1111-1111-111111111111";
const ANIMAL_ID = "22222222-2222-2222-2222-222222222222";
const APPLICANT_ID = "user-applicant";
const ACTOR_ID = "user-staff";

const historySpy: Array<Record<string, unknown>> = [];
const auditSpy: Array<Record<string, unknown>> = [];
const animalUpdateSpy: Array<Record<string, unknown>> = [];
const notificationSpy: Array<Record<string, unknown>> = [];
const emailSpy: Array<Record<string, unknown>> = [];
const staffNotificationSpy: Array<Record<string, unknown>> = [];
const staffEmailSpy: Array<Record<string, unknown>> = [];
const deletedApplicationSpy: string[] = [];

function baseApplication(overrides: Record<string, unknown> = {}) {
	return {
		id: APPLICATION_ID,
		animalId: ANIMAL_ID,
		applicantClerkUserId: APPLICANT_ID,
		homeDetails: null,
		familyDetails: null,
		existingPets: null,
		animalExperience: null,
		fullName: "Mere Koro",
		contactNumber: "9900000",
		applicantEmail: "mere@example.com",
		residentialAddress: "Suva",
		ageBracket: "adult",
		guardianName: null,
		guardianContact: null,
		guardianRelationship: null,
		guardianConsent: false,
		idDocumentType: "voter_card",
		idDocumentUrl: "https://res.cloudinary.com/demo/id.jpg",
		housingType: "house",
		fencedYard: "yes",
		petAllergies: "no",
		respiratoryIssues: "no",
		ownedPetsBefore: "no",
		previousPetOutcome: null,
		hasCurrentPets: "no",
		currentPetsDetails: null,
		aloneHours: null,
		primaryCaregiver: null,
		dailyRoutine: null,
		vetCostPlan: "Savings",
		travelCarePlan: null,
		nextOfKinName: "Jone Koro",
		nextOfKinContact: "+679 9900001",
		adoptionFor: "self",
		householdAgreement: "yes",
		consentHomeVisit: true,
		agreeReturnToSpca: true,
		confirmAccurate: true,
		status: "submitted",
		reviewNotes: null,
		createdAt: new Date("2026-01-01T00:00:00Z"),
		updatedAt: new Date("2026-01-01T00:00:00Z"),
		animal: { id: ANIMAL_ID, publicId: "SPCA-2026-1000", name: "Bella", type: "dog", medicallyCleared: true },
		...overrides,
	};
}

function baseAnimal(overrides: Record<string, unknown> = {}) {
	return {
		id: ANIMAL_ID,
		publicId: "SPCA-2026-1000",
		name: "Bella",
		type: "dog",
		breed: null,
		status: "intake",
		deletedAt: null,
		// Most submit tests use this directly; the clearance gate is exercised
		// explicitly by tests that override it to false.
		medicallyCleared: true,
		...overrides,
	};
}

// Wires a mutable in-memory application row so transition tests behave like
// the real DB: the service fetches the row (start of the call), the status
// update mutates the same row, and the final re-fetch returns the fresh state.
function statefulApplication(status: string, overrides: Record<string, unknown> = {}) {
	const current = baseApplication({ status, ...overrides });
	repo("findAdoptionApplicationById", async () => current);
	repo("updateAdoptionApplicationStatus", async (_id, data: Record<string, unknown>) => {
		Object.assign(current, data);
		return { ...current };
	});
	return current;
}

function resetImpls() {
	impls.clear();
	historySpy.length = 0;
	auditSpy.length = 0;
	animalUpdateSpy.length = 0;
	notificationSpy.length = 0;
	emailSpy.length = 0;
	staffNotificationSpy.length = 0;
	staffEmailSpy.length = 0;
	deletedApplicationSpy.length = 0;

	repo("findAllAdoptionApplications", async () => []);
	repo("findAdoptionApplicationsByApplicant", async () => []);
	repo("findAdoptionApplicationById", async () => undefined);
	repo("findActiveAdoptionApplication", async () => undefined);
	repo("findAdoptionConflict", async () => undefined);
	repo("findAdoptionStatusHistoryByApplication", async () => []);
	repo("findAdoptionStatusHistoryByApplications", async () => []);
	repo("deleteAdoptionApplication", async (id: string) => {
		deletedApplicationSpy.push(id);
	});
	// Approval is gated on veterinary clearance, so the default animal is
	// cleared. Tests that exercise the gate stub this out explicitly.
	repo("getAnimalById", async () => baseAnimal({ medicallyCleared: true }));
	repo("createAdoptionStatusHistoryEntry", async (entry: Record<string, unknown>) => {
		historySpy.push(entry);
		return entry;
	});
	repo("updateAnimalProfile", async (_id, input: Record<string, unknown>) => {
		animalUpdateSpy.push(input);
		return {};
	});
	repo("logAuditEntry", async (entry: Record<string, unknown>) => {
		auditSpy.push(entry);
	});
	repo("createAdoptionStatusNotification", async (entry: Record<string, unknown>) => {
		notificationSpy.push(entry);
		return entry;
	});
	repo("createAdoptionSubmittedStaffNotifications", async (entry: Record<string, unknown>) => {
		staffNotificationSpy.push(entry);
		return [];
	});
	repo("sendAdoptionSubmittedStaffEmail", async (entry: Record<string, unknown>) => {
		staffEmailSpy.push(entry);
		return { sent: true };
	});
	repo("listStaffContacts", async () => [
		{ clerkUserId: "user-staff-1", email: "staff1@example.com", role: "staff" },
		{ clerkUserId: "user-manager-1", email: null, role: "manager" },
	]);
	repo("sendAdoptionStatusEmail", async (entry: Record<string, unknown>) => {
		emailSpy.push(entry);
		return { sent: true };
	});
	repo("clerkGetUser", async () => ({
		primaryEmailAddress: { emailAddress: "applicant@example.com" },
		emailAddresses: [],
	}));
}

beforeEach(resetImpls);

describe("adoptions.service", () => {
	it("declares the full lifecycle statuses", () => {
		assert.deepEqual(ADOPTION_STATUSES, [
			"submitted",
			"under_review",
			"approved",
			"completed",
			"rejected",
			"withdrawn",
		]);
	});

	describe("listAdoptionApplications", () => {
		it("returns everything the repository finds", async () => {
			const rows = [baseApplication(), baseApplication({ id: "other-id" })];
			repo("findAllAdoptionApplications", async () => rows);

			const result = await listAdoptionApplications();
			assert.equal(result, rows);
		});
	});

	describe("listMyAdoptionApplications", () => {
		it("queries by the caller's clerk user id and attaches each application's history", async () => {
			const rows = [baseApplication()];
			const history = [
				{ applicationId: APPLICATION_ID, status: "submitted", createdAt: new Date() },
				{ applicationId: APPLICATION_ID, status: "under_review", createdAt: new Date() },
			];
			repo("findAdoptionApplicationsByApplicant", async (id: string) => {
				assert.equal(id, APPLICANT_ID);
				return rows;
			});
			repo("findAdoptionStatusHistoryByApplications", async (ids: string[]) => {
				assert.deepEqual(ids, [APPLICATION_ID]);
				return history;
			});

			const result = await listMyAdoptionApplications(APPLICANT_ID);

			assert.equal(result.length, 1);
			assert.equal(result[0].id, APPLICATION_ID);
			assert.deepEqual(result[0].history, history);
		});

		it("skips the history lookup when the applicant has no applications", async () => {
			repo("findAdoptionApplicationsByApplicant", async () => []);

			const result = await listMyAdoptionApplications(APPLICANT_ID);

			assert.deepEqual(result, []);
		});
	});

	describe("getAdoptionApplicationDetail", () => {
		it("returns the application joined with its status history", async () => {
			const app = baseApplication();
			const history = [{ status: "submitted", createdAt: new Date() }];
			repo("findAdoptionApplicationById", async () => app);
			repo("findAdoptionStatusHistoryByApplication", async () => history);

			const result = await getAdoptionApplicationDetail(APPLICATION_ID);
			assert.equal(result?.id, app.id);
			assert.equal(result?.history, history);
		});

		it("returns undefined when the application does not exist", async () => {
			repo("findAdoptionApplicationById", async () => undefined);

			const result = await getAdoptionApplicationDetail(APPLICATION_ID);
			assert.equal(result, undefined);
		});
	});

	describe("submitAdoptionApplication", () => {
		const input: Parameters<typeof submitAdoptionApplication>[0] = {
			animalId: ANIMAL_ID,
			fullName: "Mere Koro",
			contactNumber: "9900000",
		applicantEmail: "mere@example.com",
		ageBracket: "adult",
		idDocumentType: "voter_card",
		idDocumentUrl: "https://res.cloudinary.com/demo/id.jpg",
		petAllergies: "no",
		respiratoryIssues: "no",
		ownedPetsBefore: "no",
		previousPetOutcome: undefined,
		hasCurrentPets: "no",
		currentPetsDetails: undefined,
		vetCostPlan: "Savings",
		nextOfKinName: "Jone Koro",
		nextOfKinContact: "+679 9900001",
		adoptionFor: "self",
	};

		it("creates a submitted application and its first history entry", async () => {
			repo("getAnimalById", async () => baseAnimal());
			repo("findActiveAdoptionApplication", async () => undefined);
			repo("createAdoptionApplication", async (data: Record<string, unknown>) => ({ id: APPLICATION_ID, ...data }));

			const app = await submitAdoptionApplication(input, APPLICANT_ID);

			assert.equal(app.id, APPLICATION_ID);
			assert.equal(app.animalId, ANIMAL_ID);
			assert.equal(app.applicantClerkUserId, APPLICANT_ID);
			assert.equal(app.status, "submitted");
			assert.equal(app.fullName, "Mere Koro");
			assert.equal(app.adoptionFor, "self");
			assert.equal(app.vetCostPlan, "Savings");
			assert.equal(app.nextOfKinName, "Jone Koro");
			assert.equal(historySpy.length, 1);
			assert.deepEqual(historySpy[0], {
				applicationId: APPLICATION_ID,
				status: "submitted",
				changedByClerkUserId: null,
				note: null,
			});
		});

		it("throws when the animal does not exist", async () => {
			repo("getAnimalById", async () => undefined);

			await assert.rejects(submitAdoptionApplication(input, APPLICANT_ID), /no longer available/);
		});

		it("throws when the animal has been soft-deleted", async () => {
			repo("getAnimalById", async () => baseAnimal({ deletedAt: new Date() }));

			await assert.rejects(submitAdoptionApplication(input, APPLICANT_ID), /no longer available/);
		});

		it("throws when the animal is already adopted", async () => {
			repo("getAnimalById", async () => baseAnimal({ status: "adopted" }));

			await assert.rejects(submitAdoptionApplication(input, APPLICANT_ID), /no longer available/);
		});

		it("throws when the applicant already has an active application for the animal", async () => {
			repo("getAnimalById", async () => baseAnimal());
			repo("findActiveAdoptionApplication", async () => baseApplication());

			await assert.rejects(submitAdoptionApplication(input, APPLICANT_ID), /already applied/);
		});

		it("blocks a cat adoption for an applicant with a respiratory condition", async () => {
			repo("getAnimalById", async () => baseAnimal({ type: "cat" }));

			await assert.rejects(
				submitAdoptionApplication({ ...input, respiratoryIssues: "yes" }, APPLICANT_ID),
				/respiratory condition/,
			);
		});

		it("allows a dog adoption for an applicant with a respiratory condition", async () => {
			repo("getAnimalById", async () => baseAnimal({ type: "dog" }));
			repo("findActiveAdoptionApplication", async () => undefined);
			repo("createAdoptionApplication", async (data: Record<string, unknown>) => ({ id: APPLICATION_ID, ...data }));

			const app = await submitAdoptionApplication(
				{ ...input, respiratoryIssues: "yes" },
				APPLICANT_ID,
			);

			assert.equal(app.id, APPLICATION_ID);
		});

		it("stores guardian details for a minor applicant", async () => {
			repo("getAnimalById", async () => baseAnimal());
			repo("findActiveAdoptionApplication", async () => undefined);
			let stored: Record<string, unknown> = {};
			repo("createAdoptionApplication", async (data: Record<string, unknown>) => {
				stored = data;
				return { id: APPLICATION_ID, ...data };
			});

			await submitAdoptionApplication(
				{
					...input,
					ageBracket: "minor",
					guardianName: "Jone Koro",
					guardianContact: "9900001",
					guardianRelationship: "parent",
					guardianConsent: true,
				},
				APPLICANT_ID,
			);

			assert.equal(stored.guardianName, "Jone Koro");
			assert.equal(stored.guardianConsent, true);
		});

		it("stores the identification document on submit", async () => {
			repo("getAnimalById", async () => baseAnimal());
			repo("findActiveAdoptionApplication", async () => undefined);
			let stored: Record<string, unknown> = {};
			repo("createAdoptionApplication", async (data: Record<string, unknown>) => {
				stored = data;
				return { id: APPLICATION_ID, ...data };
			});

			await submitAdoptionApplication(input, APPLICANT_ID);

			assert.equal(stored.idDocumentType, "voter_card");
			assert.equal(stored.idDocumentUrl, "https://res.cloudinary.com/demo/id.jpg");
		});

		it("stores the next-of-kin backup contact on submit", async () => {
			repo("getAnimalById", async () => baseAnimal());
			repo("findActiveAdoptionApplication", async () => undefined);
			let stored: Record<string, unknown> = {};
			repo("createAdoptionApplication", async (data: Record<string, unknown>) => {
				stored = data;
				return { id: APPLICATION_ID, ...data };
			});

			await submitAdoptionApplication(input, APPLICANT_ID);

			assert.equal(stored.nextOfKinName, "Jone Koro");
			assert.equal(stored.nextOfKinContact, "+679 9900001");
		});

		it("uploads an ID photo through the injected uploader", async () => {
			const seen: Buffer[] = [];
			const url = await uploadAdoptionIdDocument(Buffer.from("fake-image"), async (file) => {
				seen.push(file);
				return "https://res.cloudinary.com/demo/uploaded.jpg";
			});

			assert.equal(url, "https://res.cloudinary.com/demo/uploaded.jpg");
			assert.equal(seen.length, 1);
		});

		it("notifies the applicant in-app and by email on submit", async () => {
			repo("getAnimalById", async () => baseAnimal());
			repo("findActiveAdoptionApplication", async () => undefined);
			repo("createAdoptionApplication", async (data: Record<string, unknown>) => ({ id: APPLICATION_ID, ...data }));

			await submitAdoptionApplication(input, APPLICANT_ID);

			assert.equal(notificationSpy.length, 1);
			assert.equal(notificationSpy[0].recipientClerkUserId, APPLICANT_ID);
			assert.equal(notificationSpy[0].toStatus, "submitted");
			assert.equal(emailSpy.length, 1);
			assert.equal(emailSpy[0].to, "applicant@example.com");
		});

		it("notifies the review team in-app and by email on submit", async () => {
			repo("getAnimalById", async () => baseAnimal());
			repo("findActiveAdoptionApplication", async () => undefined);
			repo("createAdoptionApplication", async (data: Record<string, unknown>) => ({ id: APPLICATION_ID, ...data }));

			await submitAdoptionApplication(input, APPLICANT_ID);

			assert.equal(staffNotificationSpy.length, 1);
			assert.deepEqual(staffNotificationSpy[0].staffClerkUserIds, ["user-staff-1", "user-manager-1"]);
			assert.equal(staffNotificationSpy[0].applicationId, APPLICATION_ID);
			// Only the staffer with an email address gets mail.
			assert.equal(staffEmailSpy.length, 1);
			assert.equal(staffEmailSpy[0].to, "staff1@example.com");
		});

		it("still completes the submit when staff notification fails", async () => {
			repo("getAnimalById", async () => baseAnimal());
			repo("findActiveAdoptionApplication", async () => undefined);
			repo("createAdoptionApplication", async (data: Record<string, unknown>) => ({ id: APPLICATION_ID, ...data }));
			repo("listStaffContacts", async () => {
				throw new Error("clerk down");
			});

			const app = await submitAdoptionApplication(input, APPLICANT_ID);

			assert.equal(app.id, APPLICATION_ID);
			assert.equal(notificationSpy.length, 1);
			assert.equal(staffNotificationSpy.length, 0);
		});

		it("rejects an application for an animal that is not medically cleared", async () => {
			repo("getAnimalById", async () => baseAnimal({ medicallyCleared: false }));

			await assert.rejects(
				submitAdoptionApplication(input, APPLICANT_ID),
				/not yet medically cleared/,
			);
		});

		it("audits the submission", async () => {
			repo("getAnimalById", async () => baseAnimal());
			repo("findActiveAdoptionApplication", async () => undefined);
			repo("createAdoptionApplication", async (data: Record<string, unknown>) => ({ id: APPLICATION_ID, ...data }));

			await submitAdoptionApplication(input, APPLICANT_ID);

			assert.equal(auditSpy.length, 1);
			assert.equal(auditSpy[0].action, "adoption.application.submitted");
			assert.deepEqual(auditSpy[0].metadata, { animalId: ANIMAL_ID });
		});

		it("removes the application if its first history entry cannot be written", async () => {
			repo("getAnimalById", async () => baseAnimal());
			repo("findActiveAdoptionApplication", async () => undefined);
			repo("createAdoptionApplication", async (data: Record<string, unknown>) => ({ id: APPLICATION_ID, ...data }));
			repo("createAdoptionStatusHistoryEntry", async () => {
				throw new Error("history insert failed");
			});

			await assert.rejects(
				submitAdoptionApplication(input, APPLICANT_ID),
				/history insert failed/,
			);
			assert.deepEqual(deletedApplicationSpy, [APPLICATION_ID]);
		});
	});

	describe("transitionAdoptionApplication", () => {
		it("returns undefined when the application does not exist", async () => {
			repo("findAdoptionApplicationById", async () => undefined);

			const result = await transitionAdoptionApplication(APPLICATION_ID, { status: "under_review" }, ACTOR_ID);
			assert.equal(result, undefined);
		});

		it("moves submitted -> under_review and records actor history + audit", async () => {
			const current = statefulApplication("submitted");

			const result = await transitionAdoptionApplication(APPLICATION_ID, { status: "under_review" }, ACTOR_ID);

			assert.equal(result?.status, "under_review");
			assert.equal(historySpy.length, 1);
			assert.equal(historySpy[0].status, "under_review");
			assert.equal(historySpy[0].changedByClerkUserId, ACTOR_ID);
			assert.equal(auditSpy.length, 1);
			assert.equal(auditSpy[0].action, "adoption.application.status_changed");
			assert.deepEqual(auditSpy[0].metadata, {
				animalId: ANIMAL_ID,
				fromStatus: "submitted",
				toStatus: "under_review",
			});
			// Nothing below the lifecycle covers, so the animal is untouched.
			assert.equal(animalUpdateSpy.length, 0);
			assert.equal(current.status, "under_review");
		});

		it("approves the application and assigns the animal to the adopter", async () => {
			const current = statefulApplication("under_review");

			const result = await transitionAdoptionApplication(APPLICATION_ID, { status: "approved" }, ACTOR_ID);

			assert.equal(result?.status, "approved");
			assert.equal(current.status, "approved");
			assert.deepEqual(animalUpdateSpy, [{ status: "adopted" }]);
		});

		it("blocks approval when the animal is not medically cleared", async () => {
			const current = statefulApplication("under_review");
			repo("getAnimalById", async () => baseAnimal({ medicallyCleared: false }));

			await assert.rejects(
				transitionAdoptionApplication(APPLICATION_ID, { status: "approved" }, ACTOR_ID),
				/not yet medically cleared/,
			);

			assert.equal(current.status, "under_review");
			assert.equal(animalUpdateSpy.length, 0);
		});

		it("moves approved -> completed and keeps the animal adopted", async () => {
			const current = statefulApplication("approved");

			const result = await transitionAdoptionApplication(APPLICATION_ID, { status: "completed" }, ACTOR_ID);

			assert.equal(result?.status, "completed");
			assert.equal(current.status, "completed");
			assert.deepEqual(animalUpdateSpy, [{ status: "adopted" }]);
		});

		it("rejects submitted -> approved as a direct jump", async () => {
			repo("findAdoptionApplicationById", async () => baseApplication());

			await assert.rejects(
				transitionAdoptionApplication(APPLICATION_ID, { status: "approved" }, ACTOR_ID),
				/cannot move from "submitted" to "approved"/,
			);
		});

		it("rejects approved -> rejected (no stepping backwards)", async () => {
			repo("findAdoptionApplicationById", async () => baseApplication({ status: "approved" }));

			await assert.rejects(
				transitionAdoptionApplication(APPLICATION_ID, { status: "rejected" }, ACTOR_ID),
				/cannot move from "approved" to "rejected"/,
			);
		});

		it("rejects any move out of the terminal completed state", async () => {
			repo("findAdoptionApplicationById", async () => baseApplication({ status: "completed" }));

			await assert.rejects(
				transitionAdoptionApplication(APPLICATION_ID, { status: "under_review" }, ACTOR_ID),
				/terminal state/,
			);
		});

		it("rejects any move out of the terminal rejected state", async () => {
			repo("findAdoptionApplicationById", async () => baseApplication({ status: "rejected" }));

			await assert.rejects(
				transitionAdoptionApplication(APPLICATION_ID, { status: "submitted" }, ACTOR_ID),
				/terminal state/,
			);
		});

		it("requires a review note when rejecting", async () => {
			repo("findAdoptionApplicationById", async () => baseApplication());

			await assert.rejects(
				transitionAdoptionApplication(APPLICATION_ID, { status: "rejected" }, ACTOR_ID),
				/review note/i,
			);
		});

		it("rejects with a review note and preserves the note on the application", async () => {
			const current = statefulApplication("submitted");

			const result = await transitionAdoptionApplication(
				APPLICATION_ID,
				{ status: "rejected", reviewNotes: "Home visit found no fenced yard" },
				ACTOR_ID,
			);

			assert.equal(result?.status, "rejected");
			assert.equal(current.status, "rejected");
			assert.equal(current.reviewNotes, "Home visit found no fenced yard");
			assert.equal(historySpy[0].status, "rejected");
			assert.equal(historySpy[0].note, "Home visit found no fenced yard");
		});

		it("blocks approval when another application for the animal is already approved", async () => {
			repo("findAdoptionApplicationById", async () => baseApplication({ status: "under_review" }));
			repo("findAdoptionConflict", async () => baseApplication({ status: "approved" }));

			await assert.rejects(
				transitionAdoptionApplication(APPLICATION_ID, { status: "approved" }, ACTOR_ID),
				/Another applicant has already been approved/,
			);
		});

		it("allows a same-status no-op transition but still records it", async () => {
			statefulApplication("submitted");

			const result = await transitionAdoptionApplication(APPLICATION_ID, { status: "submitted" }, ACTOR_ID);

			assert.equal(result?.status, "submitted");
			assert.equal(historySpy.length, 1);
			assert.equal(historySpy[0].note, null);
			assert.equal(auditSpy.length, 1);
			assert.deepEqual(auditSpy[0].metadata, { animalId: ANIMAL_ID, fromStatus: "submitted", toStatus: "submitted" });
		});

		it("notifies the applicant in-app and by email on every transition", async () => {
			statefulApplication("submitted");

			await transitionAdoptionApplication(APPLICATION_ID, { status: "under_review" }, ACTOR_ID);

			assert.equal(notificationSpy.length, 1);
			assert.equal(notificationSpy[0].recipientClerkUserId, APPLICANT_ID);
			assert.equal(notificationSpy[0].toStatus, "under_review");
			assert.equal(emailSpy.length, 1);
			assert.equal(emailSpy[0].toStatus, "under_review");
		});

		it("still completes the transition when notification and email fail", async () => {
			statefulApplication("submitted");
			repo("createAdoptionStatusNotification", async () => {
				throw new Error("db down");
			});
			repo("sendAdoptionStatusEmail", async () => {
				throw new Error("mail down");
			});

			const result = await transitionAdoptionApplication(APPLICATION_ID, { status: "under_review" }, ACTOR_ID);

			assert.equal(result?.status, "under_review");
			assert.equal(historySpy.length, 1);
			assert.equal(auditSpy.length, 1);
		});

		it("turns a unique-violation from a concurrent approval into a conflict", async () => {
			statefulApplication("under_review");
			repo("updateAdoptionApplicationStatus", async () => {
				throw Object.assign(
					new Error("duplicate key value violates unique constraint admission_animal"),
					{ code: "23505" },
				);
			});

			await assert.rejects(
				transitionAdoptionApplication(APPLICATION_ID, { status: "approved" }, ACTOR_ID),
				/Another applicant has already been approved/,
			);
		});

		it("refuses to let a reviewer approve their own application", async () => {
			statefulApplication("under_review");

			await assert.rejects(
				transitionAdoptionApplication(APPLICATION_ID, { status: "approved" }, APPLICANT_ID),
				/your own adoption application/,
			);
		});

		it("restores the previous status if marking the animal adopted fails", async () => {
			const current = statefulApplication("approved");
			repo("updateAnimalProfile", async () => {
				throw new Error("animal update failed");
			});

			await assert.rejects(
				transitionAdoptionApplication(APPLICATION_ID, { status: "completed" }, ACTOR_ID),
				/animal update failed/,
			);
			assert.equal(current.status, "approved");
		});
	});

	describe("withdrawAdoptionApplication", () => {
		it("withdraws the applicant's own submitted application", async () => {
			const current = statefulApplication("submitted");

			const result = await withdrawAdoptionApplication(APPLICATION_ID, APPLICANT_ID);

			assert.equal(result?.status, "withdrawn");
			assert.equal(current.status, "withdrawn");
			assert.equal(historySpy[0].status, "withdrawn");
			assert.equal(auditSpy[0].action, "adoption.application.withdrawn");
		});

		it("notifies the applicant that their withdrawal was recorded", async () => {
			statefulApplication("submitted");

			await withdrawAdoptionApplication(APPLICATION_ID, APPLICANT_ID);

			// Withdrawal is a status change, so it must reach the applicant the
			// same way every staff transition does: an in-app row plus email.
			assert.equal(notificationSpy.length, 1);
			assert.equal(notificationSpy[0].recipientClerkUserId, APPLICANT_ID);
			assert.equal(notificationSpy[0].toStatus, "withdrawn");
			assert.equal(emailSpy.length, 1);
			assert.equal(emailSpy[0].toStatus, "withdrawn");
		});

		it("still records the withdrawal when the notification or email fails", async () => {
			const current = statefulApplication("submitted");
			repo("createAdoptionStatusNotification", async () => {
				throw new Error("notification store down");
			});
			repo("sendAdoptionStatusEmail", async () => {
				throw new Error("mail down");
			});

			const result = await withdrawAdoptionApplication(APPLICATION_ID, APPLICANT_ID);

			assert.equal(result?.status, "withdrawn");
			assert.equal(current.status, "withdrawn");
			assert.equal(auditSpy[0].action, "adoption.application.withdrawn");
		});

		it("refuses to withdraw someone else's application", async () => {
			statefulApplication("submitted");

			await assert.rejects(
				withdrawAdoptionApplication(APPLICATION_ID, "user-someone-else"),
				/your own adoption application/,
			);
		});

		it("refuses to withdraw an application that is already decided", async () => {
			statefulApplication("rejected");

			await assert.rejects(
				withdrawAdoptionApplication(APPLICATION_ID, APPLICANT_ID),
				/terminal state/,
			);
		});
	});
});// ===== server/src/modules/adoptions/adoptions.validation.test.ts =====
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Pure validation tests for the adoption HTTP layer: the request schemas the
// routes parse and the business-error -> status mapping they apply. Nothing
// here touches a database, Clerk, Cloudinary or mail, so the suite runs with
// dummy credentials and no .env (see AGENTS.md). Deliberately no mock.module -
// these are plain imports, which is why this suite is safe on any Node version.
//
// The schemas live in adoptions.routes.ts, so this imports that module (which
// pulls in express/the service chain at import time). The env vars are set
// before the dynamic import so the module graph loads without real secrets.
process.env.CLERK_SECRET_KEY ??= "sk_test_dummy";
process.env.DATABASE_URL ??= "postgres://dummy:dummy@localhost:5432/dummy";
process.env.CLOUDINARY_CLOUD_NAME ??= "dummy";
process.env.CLOUDINARY_API_KEY ??= "dummy";
process.env.CLOUDINARY_API_SECRET ??= "dummy";

const { applicationSchema, transitionSchema, businessErrorStatus } = await import(
	"./adoptions.routes.js"
);
const { AdoptionBusinessError } = await import("./adoptionErrors.js");

// A complete, valid adult application. Tests clone and break one field at a time.
function validApplication(overrides: Record<string, unknown> = {}) {
	return {
		animalId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
		fullName: "Mere Koro",
		contactNumber: "+679 9900000",
		applicantEmail: "mere@example.com",
		ageBracket: "adult",
		idDocumentType: "voter_card",
		idDocumentUrl: "https://res.cloudinary.com/demo/id.jpg",
		petAllergies: "no",
		respiratoryIssues: "no",
		ownedPetsBefore: "no",
		hasCurrentPets: "no",
		vetCostPlan: "Savings",
		nextOfKinName: "Jone Koro",
		nextOfKinContact: "+679 9900001",
		adoptionFor: "self",
		...overrides,
	};
}

// Mirrors the route: surface the first zod issue's message to the client.
function firstMessage(payload: unknown): string {
	const parsed = applicationSchema.safeParse(payload);
	assert.equal(parsed.success, false, "expected the payload to be rejected");
	return parsed.error.issues[0]!.message;
}

describe("applicationSchema", () => {
	it("accepts a complete adult application", () => {
		const parsed = applicationSchema.safeParse(validApplication());
		assert.equal(parsed.success, true, JSON.stringify(parsed));
	});

	it("accepts a minor application when all four guardian answers are present", () => {
		const parsed = applicationSchema.safeParse(
			validApplication({
				ageBracket: "minor",
				guardianName: "Jone Koro",
				guardianContact: "+679 9900001",
				guardianRelationship: "parent",
				guardianConsent: true,
			}),
		);
		assert.equal(parsed.success, true, JSON.stringify(parsed));
	});

	it("accepts a dog application declaring a respiratory condition (gate is species-specific)", () => {
		const parsed = applicationSchema.safeParse(validApplication({ respiratoryIssues: "yes" }));
		assert.equal(parsed.success, true, JSON.stringify(parsed));
	});

	it("normalizes an empty optional text field to undefined", () => {
		const parsed = applicationSchema.safeParse(
			validApplication({ ownedPetsBefore: "no", previousPetOutcome: "   " }),
		);
		assert.equal(parsed.success, true, JSON.stringify(parsed));
		assert.equal(parsed.data?.previousPetOutcome, undefined);
	});

	it("treats a whitespace-only previous-pet outcome as missing", () => {
		assert.equal(
			firstMessage(validApplication({ ownedPetsBefore: "yes", previousPetOutcome: "   " })),
			"Tell us what happened to your previous pet(s)",
		);
	});

	it("rejects a non-UUID animalId", () => {
		assert.equal(firstMessage(validApplication({ animalId: "not-a-uuid" })), "Link a valid animal");
	});

	it("rejects a missing full name", () => {
		assert.equal(firstMessage(validApplication({ fullName: "" })), "Tell us your full name");
	});

	it("rejects a missing contact number", () => {
		assert.equal(
			firstMessage(validApplication({ contactNumber: "" })),
			"Tell us your contact number",
		);
	});

	it("rejects an invalid email address", () => {
		assert.equal(
			firstMessage(validApplication({ applicantEmail: "mere@" })),
			"Enter a valid email address",
		);
	});

	it("rejects an invalid age bracket", () => {
		assert.equal(
			firstMessage(validApplication({ ageBracket: "child" })),
			"Tell us whether you are 18 or older",
		);
	});

	it("rejects a missing identification document type", () => {
		assert.equal(
			firstMessage(validApplication({ idDocumentType: "" })),
			"Choose your identification document type",
		);
	});

	it("rejects a missing identification document photo URL", () => {
		assert.equal(
			firstMessage(validApplication({ idDocumentUrl: "" })),
			"Upload your identification document photo",
		);
	});

	it("rejects a missing vet cost plan", () => {
		assert.equal(
			firstMessage(validApplication({ vetCostPlan: "" })),
			"Tell us how you will cover veterinary costs",
		);
	});

	it("rejects a missing next-of-kin name", () => {
		assert.equal(
			firstMessage(validApplication({ nextOfKinName: "" })),
			"Tell us who looks after the animal when you are unavailable",
		);
	});

	it("rejects a missing next-of-kin contact", () => {
		assert.equal(
			firstMessage(validApplication({ nextOfKinContact: "" })),
			"Tell us your next of kin's contact number",
		);
	});

	it("rejects a missing adoptionFor choice", () => {
		assert.equal(
			firstMessage(validApplication({ adoptionFor: "" })),
			"Choose who this adoption is for",
		);
	});

	it("rejects a minor application missing guardian consent", () => {
		const message = firstMessage(
			validApplication({
				ageBracket: "minor",
				guardianName: "Jone Koro",
				guardianContact: "+679 9900001",
				guardianRelationship: "parent",
				// guardianConsent omitted
			}),
		);
		assert.equal(message, "Your parent or guardian must consent to this adoption");
	});

	it("rejects a minor application missing the guardian relationship", () => {
		const message = firstMessage(
			validApplication({
				ageBracket: "minor",
				guardianName: "Jone Koro",
				guardianContact: "+679 9900001",
				guardianConsent: true,
			}),
		);
		assert.equal(message, "Choose their relationship to you");
	});

	it("rejects guardian details supplied by an adult applicant", () => {
		const message = firstMessage(
			validApplication({ ageBracket: "adult", guardianName: "Jone Koro" }),
		);
		assert.equal(message, "Guardian details are only needed for applicants under 18");
	});

	it("requires a previous-pet outcome when the applicant has owned pets before", () => {
		const message = firstMessage(validApplication({ ownedPetsBefore: "yes" }));
		assert.equal(message, "Tell us what happened to your previous pet(s)");
	});

	it("requires current-pet details when the applicant has current pets", () => {
		const message = firstMessage(validApplication({ hasCurrentPets: "yes" }));
		assert.equal(message, "Tell us about your current pets");
	});
});

describe("transitionSchema", () => {
	it("accepts a status-only transition", () => {
		const parsed = transitionSchema.safeParse({ status: "under_review" });
		assert.equal(parsed.success, true, JSON.stringify(parsed));
	});

	it("accepts every reviewer status", () => {
		for (const status of ["submitted", "under_review", "approved", "completed", "rejected"]) {
			assert.equal(transitionSchema.safeParse({ status }).success, true, status);
		}
	});

	it("rejects withdrawal: only the applicant can withdraw, via its own route", () => {
		assert.equal(transitionSchema.safeParse({ status: "withdrawn" }).success, false);
	});

	it("rejects an unknown status", () => {
		assert.equal(transitionSchema.safeParse({ status: "canceled" }).success, false);
	});

	it("normalizes an empty review note to undefined", () => {
		const parsed = transitionSchema.safeParse({ status: "rejected", reviewNotes: "   " });
		assert.equal(parsed.success, true, JSON.stringify(parsed));
		assert.equal(parsed.data?.reviewNotes, undefined);
	});
});

describe("businessErrorStatus", () => {
	it("maps a typed conflict to 409", () => {
		assert.equal(
			businessErrorStatus(
				new AdoptionBusinessError(409, "Another applicant has already been approved for this animal."),
			),
			409,
		);
	});

	it("maps typed lifecycle and permission rejections to their own status", () => {
		assert.equal(
			businessErrorStatus(
				new AdoptionBusinessError(
					400,
					'Adoption application cannot move from "submitted" to "approved" - only under_review, rejected may come next.',
				),
			),
			400,
		);
		assert.equal(
			businessErrorStatus(
				new AdoptionBusinessError(403, "You cannot approve your own adoption application."),
			),
			403,
		);
	});

	it("maps a Postgres unique violation (the real double-approval race) to 409", () => {
		const violation = Object.assign(new Error("duplicate key value violates unique constraint"), {
			code: "23505",
		});
		assert.equal(businessErrorStatus(violation), 409);
	});

	it("maps a unique violation wrapped in a cause chain to 409", () => {
		const inner = Object.assign(new Error("duplicate key value"), { code: "23505" });
		const wrapped = Object.assign(new Error("query failed"), { cause: inner });
		assert.equal(businessErrorStatus(wrapped), 409);
	});

	it("returns null for an unrecognized error (falls through to the 500 handler)", () => {
		assert.equal(businessErrorStatus(new Error("something unexpected")), null);
	});

	it("returns null for a non-Error value", () => {
		assert.equal(businessErrorStatus("boom"), null);
	});
});
// ===== server/src/modules/adoptions/adoptions.repository.test.ts =====
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

process.env.CLERK_SECRET_KEY = "test-clerk-secret-key";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/ara_test";

const { db } = await import("../../db/client.js");
const { findActiveAdoptionApplication } = await import("./adoptions.repository.js");
// Imported only so this test can pin the repository's closed-status list to the
// lifecycle definition. The repository itself cannot import the service (the
// service already imports the repository), so the invariant is asserted here.
const { ADOPTION_STATUSES, ALLOWED_TRANSITIONS } = await import("./adoptions.service.js");

// Execute the real Drizzle builder, intercepting only the transport. This checks
// the actual SQL and bound parameters without a live database or module mocking
// (see the same pattern in animals.repository.test.ts). It exists because the
// service suite stubs findActiveAdoptionApplication away, so the duplicate-
// application predicate itself was never asserted anywhere.
let queries: { sql: string; params: unknown[] }[] = [];
beforeEach(() => {
	queries = [];
	mock.method(db.$client, "query", async (sql: string, params: unknown[]) => {
		queries.push({ sql, params });
		return { rows: [] };
	});
});
afterEach(() => mock.restoreAll());

describe("active adoption application predicate", () => {
	it("treats rejected, completed and withdrawn applications as closed", async () => {
		await findActiveAdoptionApplication("animal-id", "applicant-id");
		const { sql, params } = queries[0];

		// Only live statuses may block a new application. A withdrawn one was
		// cancelled by the applicant themselves, so leaving it out of this list
		// would silently lock them out of re-applying for that animal forever.
		const notIn = sql.match(/"status" not in \(([^)]+)\)/);
		assert.ok(notIn, `Expected a status NOT IN clause in: ${sql}`);
		// Read the bound values by their placeholder numbers rather than by
		// position: the LIMIT placeholder is bound after the status list.
		const excluded = notIn[1]
			.split(",")
			.map((placeholder) => params[Number(placeholder.trim().replace("$", "")) - 1]);
		assert.deepEqual([...excluded].sort(), ["completed", "rejected", "withdrawn"]);

		// The two active statuses that must still block a duplicate.
		for (const live of ["submitted", "under_review", "approved"]) {
			assert.ok(!excluded.includes(live), `${live} must not be treated as closed`);
		}
	});

	it("keeps the closed-status list exactly the terminal statuses of the lifecycle", async () => {
		// The bug this guards: the query listed "rejected" and "completed" only,
		// so a withdrawn application blocked re-applying for ever. Deriving the
		// expectation from ALLOWED_TRANSITIONS stops a new terminal status being
		// added (or removed) without updating the duplicate check.
		const terminal = ADOPTION_STATUSES.filter((status) => ALLOWED_TRANSITIONS[status].length === 0);

		await findActiveAdoptionApplication("animal-id", "applicant-id");
		const { sql, params } = queries[0];
		const notIn = sql.match(/"status" not in \(([^)]+)\)/);
		assert.ok(notIn, `Expected a status NOT IN clause in: ${sql}`);
		const excluded = notIn[1]
			.split(",")
			.map((placeholder) => params[Number(placeholder.trim().replace("$", "")) - 1]);

		assert.deepEqual([...excluded].sort(), [...terminal].sort());
	});

	it("scopes the check to one animal and one applicant", async () => {
		await findActiveAdoptionApplication("animal-id", "applicant-id");
		const { sql, params } = queries[0];

		assert.match(sql, /"animal_id" = \$\d+/);
		assert.match(sql, /"applicant_clerk_user_id" = \$\d+/);
		assert.ok(params.includes("animal-id"));
		assert.ok(params.includes("applicant-id"));
		assert.match(sql, /limit \$\d+$/);
	});
});
// ===== src/features/adoptions/adoptionQueue.test.ts =====
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVE_STATUS_FILTERS,
  HISTORY_STATUS_FILTERS,
  QUEUE_TAB_STATUSES,
  isTerminalAdoptionStatus,
} from "./adoptionQueue.js";

// Run: npm test (glob covers src/**/*.test.ts).
describe("adoption queue tabs", () => {
  it("treats completed, rejected and withdrawn as terminal", () => {
    assert.equal(isTerminalAdoptionStatus("completed"), true);
    assert.equal(isTerminalAdoptionStatus("rejected"), true);
    assert.equal(isTerminalAdoptionStatus("withdrawn"), true);
    assert.equal(isTerminalAdoptionStatus("submitted"), false);
    assert.equal(isTerminalAdoptionStatus("under_review"), false);
    assert.equal(isTerminalAdoptionStatus("approved"), false);
  });

  it("splits every lifecycle status across exactly one tab", () => {
    const all = [...QUEUE_TAB_STATUSES.active, ...QUEUE_TAB_STATUSES.history].sort();
    assert.deepEqual(all, [
      "approved",
      "completed",
      "rejected",
      "submitted",
      "under_review",
      "withdrawn",
    ]);
  });

  it("matches dropdown options to their tab", () => {
    assert.deepEqual([...ACTIVE_STATUS_FILTERS], [...QUEUE_TAB_STATUSES.active]);
    assert.deepEqual([...HISTORY_STATUS_FILTERS], [...QUEUE_TAB_STATUSES.history]);
  });
});
// ===== src/types/adoption.test.ts =====
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adoptionStatusLabel,
  adoptionStatusShortLabel,
  applicantClosureLabel,
  applicantClosureShortLabel,
  type AdoptionStatus,
} from "./adoption.js";

// Run: npm test (glob covers src/**/*.test.ts).
//
// The applicant never sees "withdrawn" as a lifecycle status: withdrawing is an
// action they take, so the resulting state reads as a cancellation. Staff views
// keep the "Withdrawn" wording, so these wrappers exist to stop the staff label
// leaking back into the applicant's own view.
const ALL_STATUSES: AdoptionStatus[] = [
  "submitted",
  "under_review",
  "approved",
  "completed",
  "rejected",
  "withdrawn",
];

describe("applicant closure wording", () => {
  it("presents a withdrawal as a cancellation, not a status", () => {
    assert.equal(applicantClosureShortLabel("withdrawn"), "Cancelled");
    assert.equal(applicantClosureLabel("withdrawn"), "Cancelled by you");
  });

  it("delegates every other status to the shared labels", () => {
    for (const status of ALL_STATUSES) {
      if (status === "withdrawn") continue;
      assert.equal(applicantClosureShortLabel(status), adoptionStatusShortLabel(status));
      assert.equal(applicantClosureLabel(status), adoptionStatusLabel(status));
    }
  });

  it("never shows the word withdrawn to the applicant", () => {
    for (const status of ALL_STATUSES) {
      assert.ok(
        !applicantClosureShortLabel(status).toLowerCase().includes("withdrawn"),
        `short label for ${status} leaked "withdrawn"`,
      );
      assert.ok(
        !applicantClosureLabel(status).toLowerCase().includes("withdrawn"),
        `long label for ${status} leaked "withdrawn"`,
      );
    }
  });
});
```

## Appendix B — Traceability, ID mapping and known gaps

### Traceability to the module requirements

| Requirement (from `Adoption.md` / `AGENTS.md`)                                  | Cases                          |
| ------------------------------------------------------------------------------- | ------------------------------ |
| Registered user submits an adoption application                                 | AD-07 to AD-20, AD-45 to AD-65 |
| Staff review, approve or reject                                                 | AD-02, AD-24 to AD-41          |
| Applicant tracks application status (timeline, not just current state)          | AD-03, AD-05, AD-25, AD-34, AD-36 |
| Applicant withdraws their own application                                       | AD-42 to AD-44, AD-68, AD-77, AD-78, AD-85 to AD-87 |
| Lifecycle `submitted -> under_review -> approved -> completed`, or `rejected`/`withdrawn` | AD-01, AD-25 to AD-34, AD-40, AD-42 |
| `rejected` requires `reviewNotes` shown to the applicant                        | AD-33, AD-34, AD-70            |
| Medical clearance is a hard precondition (at submit **and** at approval)        | AD-21, AD-27                   |
| Approval transfers ownership and removes the animal from public listings        | AD-26 (AD-28 idempotent)       |
| Only one active application per animal, safe against concurrent approvals       | AD-11, AD-35, AD-39, AD-73, AD-74, AD-80 to AD-82 |
| Reviewer cannot decide their own application                                    | AD-40, AD-72                   |
| Audit trail for submissions and status changes                                  | AD-22, AD-25, AD-36, AD-42     |
| Notifications on stage change (best-effort)                                     | AD-18, AD-19, AD-20, AD-37, AD-38, AD-83, AD-84 |
| Applicant privacy: applicants only see their own applications                   | AD-03                          |
| Staff queue Active/History split                                                | AD-77 to AD-79                 |
| Request validation is enforced before the service sees the payload              | AD-45 to AD-70                 |

### ID mapping from the previous revision

The earlier revision of this document listed 37 cases (the pre-merge service
suite of 34 plus 3 queue cases). The merge of `fix/adoption-module-hardening`
renumbered them; the mapping is:

| Old | New | Case                                             |
| --- | --- | ------------------------------------------------ |
| AD-01 | AD-01 | Declares the full lifecycle statuses           |
| AD-02 | AD-02 | `listAdoptionApplications` pass-through        |
| AD-03 | AD-03 | `listMyAdoptionApplications` scoped to caller  |
| AD-04 | AD-05 | `getAdoptionApplicationDetail` joined history  |
| AD-05 | AD-06 | detail returns `undefined` when missing        |
| AD-06 to AD-19 | AD-07 to AD-20 | the 14 original submission cases    |
| AD-20 to AD-34 | AD-24 to AD-38 | the 15 original transition cases    |
| AD-35 to AD-37 | AD-77 to AD-79 | staff queue tabs                    |

Everything else is new coverage: `AD-04` (empty applicant history shortcut),
`AD-21` (submit-time clearance gate), `AD-22` (submission audit), `AD-23`
(history-write compensation), `AD-39` (raw `23505` → 409), `AD-40` (self-review
refusal), `AD-41` (animal-write compensation), `AD-42` to `AD-44` (withdrawal),
`AD-80` to `AD-82` (the duplicate-application SQL), `AD-83` to `AD-84`
(withdrawal notification) and `AD-85` to `AD-87` (applicant status wording),
and the whole `AD-45` to `AD-76` validation block.

### Known gaps (not covered by these 87 cases)

- `adoptions.routes.ts` — the **HTTP** behaviour itself (status codes on the
  wire, the RBAC middleware chain, multipart ID upload) is still not unit-tested;
  the schemas and the error→status mapping are now covered (AD-45 to AD-76), but
  the route handlers that use them are exercised only indirectly.
- `adoptions.repository.ts` — **partly covered since 2026-10-19**: the
  duplicate-application predicate is now asserted as SQL (AD-80 to AD-82). The
  remaining queries (the list/detail joins, `findAdoptionConflict`,
  `findAnimalMissingSearchEmbedding`-style lookups) are still not unit-tested.
  The service-level pre-check (AD-35) and the `23505` translation (AD-39, AD-73,
  AD-74) are covered, but the index that actually raises it lives in the schema
  and is verified only by the migration/snapshot work.
- Frontend adoption components — `AdoptionApplicationForm.tsx`,
  `ManageAdoptionApplications.tsx` and `MyApplications.tsx` have no automated
  tests; the pure helpers are covered instead: `adoptionQueue.ts` (AD-77 to
  AD-79) and the applicant status wording in `src/types/adoption.ts` (AD-85 to
  AD-87). The components that render those labels are still only exercised
  manually.
- Notification content (email/in-app body text) is asserted by recipient and
  status only, not by rendered copy — so the `withdrawn` copy added with AD-83
  is tested for existence, not for exact wording.
- Ordering between the two writes on approval (application status first, then
  the animal marked `adopted`) is asserted through call order in the fakes, not
  against a real database; the module relies on the partial unique index for the
  concurrency guarantee, and compensation is covered by AD-41/AD-23 rather than
  by a transactional test.
- Browser-level coverage for the adoption UI does not exist in the automated
  suite. The manual companion (real Clerk sessions and a live database) is
  `TestCases_Gr7.md` (ADOPT-01 to ADOPT-12) with
  `docs/adoption-manual-test-runbook.md`.
- One caveat for reproducibility: `mock.module` is ignored on Node v22.20.0,
  where the **service** suite fails at import time. The results above were
  produced on Node v24.21.0. `adoptions.validation.test.ts` and
  `adoptionQueue.test.ts` use plain imports and are unaffected.
