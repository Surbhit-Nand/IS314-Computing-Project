# Adoption Module: Test Cases

> **Status:** Implemented and passing.
> **Module:** Adoption Application & Rescue Reporting, adoption half.
> **System:** ARA — Animal Rescue & Adoption Management System, SPCA Fiji (Group 7, IS314 Computing Project).
> **Date:** 2026-10-19

> **⚠️ Scope — this is a snapshot taken before the hardening merge.** The case
> list below (AD-01 … AD-37) documents the adoption suites as they stood on
> `main` @ `06f364a`: `adoptions.service.test.ts` (34 cases) plus
> `adoptionQueue.test.ts` (3). The `fix/adoption-module-hardening` branch was
> then merged into `main` (`1e69b5f`), which grew adoption coverage to **79
> cases — all passing**:
>
> | Suite | Cases |
> | ----- | ----- |
> | `adoptions.service.test.ts` | 44 (was 34) |
> | `adoptions.validation.test.ts` (new) | 32 |
> | `adoptionQueue.test.ts` | 3 |
>
> The 10 extra service cases and the whole validation suite are **not written up
> below yet**; the environment block records the pre-merge run.

## Summary

| Item               | Value                                                              |
| ------------------ | ------------------------------------------------------------------ |
| Backend suite      | `server/src/modules/adoptions/adoptions.service.test.ts` (34 cases) |
| Frontend suite     | `src/features/adoptions/adoptionQueue.test.ts` (3 cases)            |
| Total test cases   | **37**                                                             |
| Runner             | `node --import tsx --experimental-test-module-mocks --test` (via `npm test`) |
| Environment        | Node v24.21.0, tsx, no database / Clerk / mail provider required    |
| Where tested       | Local development workstation, branch `main` @ `06f364a`             |
| Date of run        | 2026-10-19, 14:15 (Fiji Standard Time, UTC+12)                     |
| Verified result    | **37 tests, 7 suites, 37 pass, 0 fail**                             |
| Whole suite at that commit | **350 tests, 39 suites, 350 pass, 0 fail**                  |

## Environment (test rig)

| Item                    | Value                                                                 |
| ----------------------- | --------------------------------------------------------------------- |
| Device                  | Lenovo IdeaPad Slim 5 16IRL8 (machine type `82XF`), x64-based PC       |
| Processor               | 13th Gen Intel Core i5-1335U — 10 cores / 12 logical processors, 1.30 GHz reported base |
| Installed memory (RAM)  | 16 GB (2 x 8 GB Micron DDR5-6400); 15.73 GB usable                     |
| Graphics                | Intel Iris Xe (integrated)                                            |
| Operating system        | Microsoft Windows 11 Home, build 10.0.26300, 64-bit                    |
| BIOS                    | LENOVO `LACN41WW`                                                     |
| Where tested            | Local development workstation above - repository at `C:\Users\surbh\SWE\IS314-Computing-Project\ARA_System`, branch `main`, commit `06f364a` |
| Connection type         | Wi-Fi (Intel Wi-Fi 6 AX203, 802.11); IPv4 and IPv6 Internet connectivity |
| Date of run             | 2026-10-19, 14:15 (Fiji Standard Time, UTC+12)                         |
| Toolchain               | Node v24.21.0, npm 11.19.0, PowerShell 7.6.6, tsx                      |

The adoption suites run fully offline against stubbed collaborators: no database, Clerk instance, mail provider or network access is required, so connection type and latency do not affect the results. The Wi-Fi network name is deliberately omitted. Node's test reporter does not print a timestamp, so the date above is the wall-clock time the run was executed.

## How to run

```sh
npm install
npm test
```

`npm install` is required before the first run: the whole-suite dev dependency `@electric-sql/pglite` (added with the veterinary emergency work) must be present, and five unrelated suites import it. The `test` script then globs `server/src/**/*.test.ts` and `src/**/*.test.ts`, so both adoption suites are picked up automatically. To run only the adoption cases:

```sh
node --import tsx --experimental-test-module-mocks --test `
  server/src/modules/adoptions/adoptions.service.test.ts `
  src/features/adoptions/adoptionQueue.test.ts
```

## Test strategy

- **No live infrastructure.** Every collaborator of `adoptions.service.ts` is replaced with `node:test`'s `mock.module` *before* the service is imported: the adoptions repository (`adoptions.repository.js`), `animals.service.js`, `shared/audit/audit.service.js`, `notifications/notifications.service.js`, `services/email.js`, `services/staffDirectory.js` and `services/clerkClient.js`. Each stub forwards to a test-provided implementation held in an `impls` map, so individual cases swap behaviour per test while the module-namespace functions stay stable.
- **Rules, not framework.** Cases assert the business rules at the service boundary — illegal transitions, the veterinary-clearance gate, the single-approval conflict guard, terminal-state locking, review-note enforcement, and best-effort notification behaviour.
- **Stateful fakes.** `statefulApplication()` wires a mutable in-memory application row so transition tests behave like the real database: the service fetches the row, the status update mutates it, and the final re-fetch returns the fresh state. `resetImpls()` runs before every test, so cases cannot leak state into each other.
- **Frontend helper.** `adoptionQueue.ts` is a pure module backing the staff review queue's Active/History tabs and their status dropdowns; it has no DOM dependency, so it is covered directly.

## Regression sensitivity

The following cases map to the module's load-bearing guarantees and will fail if the rule is weakened:

- `AD-11` / `AD-12` — cat adoptions are screened for applicant respiratory conditions; dog adoptions are not.
- `AD-22` — approval is gated on `animals.medically_cleared` being true and on no other approval existing for the animal, and it **marks the animal `adopted` in the same action** (ownership transfer, removing it from public listings).
- `AD-23` — the hard veterinary-clearance gate refuses `under_review -> approved` when the animal is not cleared.
- `AD-24` — completion re-asserts `adopted`, kept idempotent for applications approved before the ownership rule existed.
- `AD-31` — concurrent-approval guard: a second approval for the same animal is refused (`findAdoptionConflict`, backing the DB-level partial unique index `adoption_animal_unique_active`).
- `AD-25`–`AD-28` — no illegal jumps and no escape from `completed` / `rejected`.
- `AD-29` / `AD-30` — `rejected` requires `reviewNotes`, and the note is preserved on the record for the applicant.
- `AD-19` / `AD-34` — notification and email failures must never abort a submit or a transition.
- `AD-21` — every transition writes an `adoptionStatusHistory` row and an audit entry with actor and from/to status.

## Test cases — Lifecycle and queries

| ID    | Test case                                                       | Rule under test                                        | Preconditions / stubs                                                                 | Expected result                                                        | Actual | Status |
| ----- | --------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------ | ------ |
| AD-01 | Declares the full lifecycle statuses                            | The five lifecycle states are fixed and ordered        | None                                                                                  | `ADOPTION_STATUSES` deep-equals `submitted, under_review, approved, completed, rejected` | As expected | Pass |
| AD-02 | `listAdoptionApplications` returns everything the repository finds | Staff queue is a straight pass-through of stored rows | `findAllAdoptionApplications` returns two rows                                        | Result is the same two rows                                            | As expected | Pass |
| AD-03 | `listMyAdoptionApplications` queries by the caller's Clerk user id | Applicants only see their own applications           | `findAdoptionApplicationsByApplicant` asserts the id it receives                      | Queried with `APPLICANT_ID`; the applicant's rows returned             | As expected | Pass |
| AD-04 | `getAdoptionApplicationDetail` returns the application joined with its status history | Detail view carries the timeline          | `findAdoptionApplicationById` returns an application; history returns one entry       | `result.id` matches and `result.history` is the history array           | As expected | Pass |
| AD-05 | `getAdoptionApplicationDetail` returns `undefined` when the application does not exist | Missing records are not an error             | `findAdoptionApplicationById` returns `undefined`                                     | `undefined`                                                            | As expected | Pass |

## Test cases — Submit application (`submitAdoptionApplication`)

All rows below submit `input` with `APPLICANT_ID` as the caller.

| ID    | Test case                                                             | Rule under test                                                       | Preconditions / stubs                                                                                   | Input                                                        | Expected result                                                                                   | Actual | Status |
| ----- | --------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------ | ------ |
| AD-06 | Creates a submitted application and its first history entry           | A new application starts `submitted` and is timeline-tracked          | Animal exists; no active application; `createAdoptionApplication` echoes the input                         | Valid full application payload                                | Row returned with `status: "submitted"`, applicant id, and all submitted fields; exactly one history entry with `status: "submitted"`, `changedByClerkUserId: null`, `note: null` | As expected | Pass |
| AD-07 | Throws when the animal does not exist                                 | Cannot apply for a non-existent animal                                | `getAnimalById` returns `undefined`                                                                       | Valid payload                                                 | Rejects with `/no longer available/`                                                              | As expected | Pass |
| AD-08 | Throws when the animal has been soft-deleted                          | Soft-deleted animals are not adoptable                                | `getAnimalById` returns an animal with `deletedAt` set                                                    | Valid payload                                                 | Rejects with `/no longer available/`                                                              | As expected | Pass |
| AD-09 | Throws when the animal is already adopted                             | Adopted animals are not adoptable                                     | `getAnimalById` returns an animal with `status: "adopted"`                                                | Valid payload                                                 | Rejects with `/no longer available/`                                                              | As expected | Pass |
| AD-10 | Throws when the applicant already has an active application for the animal | One active application per applicant per animal                 | `findActiveAdoptionApplication` returns an existing application                                           | Valid payload                                                 | Rejects with `/already applied/`                                                                  | As expected | Pass |
| AD-11 | Blocks a cat adoption for an applicant with a respiratory condition   | Allergen screening for cats                                           | Animal `type: "cat"`                                                                                      | Payload with `respiratoryIssues: "yes"`                       | Rejects with `/respiratory condition/`                                                            | As expected | Pass |
| AD-12 | Allows a dog adoption for an applicant with a respiratory condition   | Screening is cat-specific, not a blanket block                        | Animal `type: "dog"`; no active application; create echoes input                                           | Payload with `respiratoryIssues: "yes"`                       | Application created (`id` present)                                                                | As expected | Pass |
| AD-13 | Stores guardian details for a minor applicant                         | Minors require a consenting guardian                                  | Animal exists; no active application; create captures the payload                                         | `ageBracket: "minor"` + guardian name, contact, relationship, consent | Stored row has `guardianName: "Jone Koro"` and `guardianConsent: true`                            | As expected | Pass |
| AD-14 | Stores the identification document on submit                          | ID verification is captured at application time                        | Animal exists; no active application; create captures the payload                                         | `idDocumentType: "voter_card"` + Cloudinary `idDocumentUrl`   | Stored row has the matching document type and URL                                                 | As expected | Pass |
| AD-15 | Stores the next-of-kin backup contact on submit                       | A secondary contact is recorded                                        | Animal exists; no active application; create captures the payload                                         | Next-of-kin name and contact                                  | Stored row has `nextOfKinName: "Jone Koro"` and `nextOfKinContact: "+679 9900001"`                | As expected | Pass |
| AD-16 | Uploads an ID photo through the injected uploader                     | Upload provider is injected, not hard-wired                           | Uploader stub injected as a parameter                                                                     | A `Buffer` of fake image bytes                                | Returns the stub URL and the uploader was called exactly once                                     | As expected | Pass |
| AD-17 | Notifies the applicant in-app and by email on submit                  | Applicant gets an acknowledgement                                     | Animal exists; create echoes input; notification and email spies                                          | Valid payload                                                 | One in-app notification to `APPLICANT_ID` with `toStatus: "submitted"`; one email to the applicant's address | As expected | Pass |
| AD-18 | Notifies the review team in-app and by email on submit                | Staff are alerted to a new application                                | `listStaffContacts` returns a staffer with an email and a manager without one                             | Valid payload                                                 | One staff notification listing both Clerk ids; exactly one staff email, to the staffer who has an address | As expected | Pass |
| AD-19 | Still completes the submit when staff notification fails              | Notifications are best-effort, never blocking                         | `listStaffContacts` throws `"clerk down"`                                                                 | Valid payload                                                 | Application still created; applicant notified; zero staff notifications                            | As expected | Pass |

## Test cases — Status transition (`transitionAdoptionApplication`)

All rows call the service with `ACTOR_ID` as the acting staff member.

| ID    | Test case                                                              | Rule under test                                                            | Preconditions / stubs                                                                    | Input                                                        | Expected result                                                                                                    | Actual | Status |
| ----- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------ | ------ |
| AD-20 | Returns `undefined` when the application does not exist                | Unknown ids are a no-op, not a crash                                        | `findAdoptionApplicationById` returns `undefined`                                         | `{ status: "under_review" }`                                 | `undefined`                                                                                                        | As expected | Pass |
| AD-21 | Moves `submitted -> under_review` and records actor history + audit    | First staff action is tracked with actor and audit trail                    | Stateful row starting `submitted`                                                         | `{ status: "under_review" }`                                 | Status becomes `under_review`; one history row (`changedByClerkUserId: ACTOR_ID`); one audit entry `adoption.application.status_changed` with `{ animalId, fromStatus, toStatus }`; animal untouched | As expected | Pass |
| AD-22 | Approves the application and assigns the animal to the adopter         | Approval transfers ownership and removes the animal from public listings     | Stateful row `under_review`; animal `medicallyCleared: true`; no conflict                 | `{ status: "approved" }`                                      | Status becomes `approved`; animal updated with `{ status: "adopted" }`                                              | As expected | Pass |
| AD-23 | Blocks approval when the animal is not medically cleared               | **Veterinary-clearance hard gate**                                          | Stateful row `under_review`; `getAnimalById` returns `medicallyCleared: false`            | `{ status: "approved" }`                                      | Rejects with `/not yet medically cleared/`; row stays `under_review`; animal untouched                              | As expected | Pass |
| AD-24 | Moves `approved -> completed` and keeps the animal adopted             | Completion is idempotent for the ownership rule                              | Stateful row `approved`                                                                   | `{ status: "completed" }`                                     | Status becomes `completed`; animal updated with `{ status: "adopted" }` (re-asserted)                               | As expected | Pass |
| AD-25 | Rejects `submitted -> approved` as a direct jump                       | No skipping the review step                                                 | Application row `submitted`                                                               | `{ status: "approved" }`                                      | Rejects with `/cannot move from "submitted" to "approved"/`                                                         | As expected | Pass |
| AD-26 | Rejects `approved -> rejected` (no stepping backwards)                 | Decided applications cannot be reversed through this path                   | Application row `approved`                                                                | `{ status: "rejected" }`                                      | Rejects with `/cannot move from "approved" to "rejected"/`                                                          | As expected | Pass |
| AD-27 | Rejects any move out of the terminal `completed` state                 | `completed` is terminal                                                      | Application row `completed`                                                               | `{ status: "under_review" }`                                  | Rejects with `/terminal state/`                                                                                     | As expected | Pass |
| AD-28 | Rejects any move out of the terminal `rejected` state                  | `rejected` is terminal                                                       | Application row `rejected`                                                                | `{ status: "submitted" }`                                     | Rejects with `/terminal state/`                                                                                     | As expected | Pass |
| AD-29 | Requires a review note when rejecting                                  | Applicants must be told why                                                   | Application row `submitted`                                                               | `{ status: "rejected" }` (no note)                            | Rejects with `/review note/i`                                                                                       | As expected | Pass |
| AD-30 | Rejects with a review note and preserves the note on the application   | The rejection reason is stored and shown to the applicant                    | Stateful row `submitted`                                                                  | `{ status: "rejected", reviewNotes: "Home visit found no fenced yard" }` | Status becomes `rejected`; `reviewNotes` stored on the record; history row carries the same note                    | As expected | Pass |
| AD-31 | Blocks approval when another application for the animal is already approved | Only one application per animal can be approved (race guard)          | Row `under_review`; `findAdoptionConflict` returns an already-approved application         | `{ status: "approved" }`                                      | Rejects with `/Another applicant has already been approved/`                                                        | As expected | Pass |
| AD-32 | Allows a same-status no-op transition but still records it             | Idempotent writes are still auditable                                        | Stateful row `submitted`                                                                  | `{ status: "submitted" }`                                     | Status stays `submitted`; one history row (`note: null`); one audit entry with `fromStatus` = `toStatus`             | As expected | Pass |
| AD-33 | Notifies the applicant in-app and by email on every transition         | Status changes reach the applicant                                           | Stateful row `submitted`                                                                  | `{ status: "under_review" }`                                  | One in-app notification to the applicant with `toStatus: "under_review"`; one email with the same `toStatus`        | As expected | Pass |
| AD-34 | Still completes the transition when notification and email fail        | Notification failures never roll back a status change                        | `createAdoptionStatusNotification` and `sendAdoptionStatusEmail` both throw               | `{ status: "under_review" }`                                  | Status becomes `under_review`; history and audit entries still written                                              | As expected | Pass |

## Test cases — Staff queue tabs (frontend helper)

| ID    | Test case                                              | Rule under test                                                 | Preconditions / stubs | Expected result                                                                                    | Actual | Status |
| ----- | ------------------------------------------------------ | --------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------- | ------ | ------ |
| AD-35 | Treats `completed` and `rejected` as terminal          | Finished applications move out of the live queue                | None                  | `isTerminalAdoptionStatus` is true for `completed` / `rejected`, false for `submitted`, `under_review`, `approved` | As expected | Pass |
| AD-36 | Splits every lifecycle status across exactly one tab   | No status is orphaned or shown in both tabs                     | None                  | Active + History tab statuses sorted equal `approved, completed, rejected, submitted, under_review` | As expected | Pass |
| AD-37 | Matches dropdown options to their tab                  | Filter options cannot drift from the tabs                       | None                  | `ACTIVE_STATUS_FILTERS` matches the Active tab; `HISTORY_STATUS_FILTERS` matches the History tab    | As expected | Pass |

## Status transition matrix

The matrix the suite enforces (`ALLOWED_TRANSITIONS` in `adoptions.service.ts`). "No-op" rows are permitted and are still written to `adoptionStatusHistory`.

| from \ to   | submitted       | under_review    | approved                                                    | completed | rejected            |
| ----------- | --------------- | --------------- | ----------------------------------------------------------- | --------- | ------------------- |
| submitted   | Allowed (no-op) | Allowed         | Blocked (illegal jump)                                      | Blocked   | Allowed (needs note) |
| under_review| Blocked         | Allowed (no-op) | Allowed (needs vet clearance + no conflicting approval; marks the animal `adopted`) | Blocked | Allowed (needs note) |
| approved    | Blocked         | Blocked         | Blocked (no-op)                                             | Allowed (re-asserts `adopted`) | Blocked |
| completed   | Blocked (terminal) | Blocked      | Blocked                                                     | Blocked   | Blocked             |
| rejected    | Blocked (terminal) | Blocked      | Blocked                                                     | Blocked   | Blocked             |

Ownership note: since the ownership rule was introduced, **approval** marks the animal `adopted` (removing it from public listings and transferring it to the adopter); **completion** re-asserts the same state so applications approved before that rule still end up correct. Both are covered by AD-22 and AD-24.

## Appendix A — Combined test source (single listing)

Both suites are reproduced below as one continuous listing, so the report carries a single code artifact. The runnable copies remain split by package (`server/src/**` and `src/**`) because the repository typechecks them under two different TypeScript projects (`server/tsconfig.json` with `rootDir: "src"`, and `tsconfig.app.json`), and merging them into one physical file would move test code outside a project root and break `npm run server:check` and `npm run build`.

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
	updateAdoptionApplicationStatus: (id: string, input: unknown) =>
		currentImpl("updateAdoptionApplicationStatus")(id, input),
	createAdoptionStatusHistoryEntry: (input: unknown) => currentImpl("createAdoptionStatusHistoryEntry")(input),
	findAdoptionStatusHistoryByApplication: (applicationId: string) =>
		currentImpl("findAdoptionStatusHistoryByApplication")(applicationId),
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

	repo("findAllAdoptionApplications", async () => []);
	repo("findAdoptionApplicationsByApplicant", async () => []);
	repo("findAdoptionApplicationById", async () => undefined);
	repo("findActiveAdoptionApplication", async () => undefined);
	repo("findAdoptionConflict", async () => undefined);
	repo("findAdoptionStatusHistoryByApplication", async () => []);
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
		it("queries by the caller's clerk user id", async () => {
			const rows = [baseApplication()];
			repo("findAdoptionApplicationsByApplicant", async (id: string) => {
				assert.equal(id, APPLICANT_ID);
				return rows;
			});

			const result = await listMyAdoptionApplications(APPLICANT_ID);
			assert.equal(result, rows);
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
	});
});
```

```ts
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
  it("treats completed and rejected as terminal", () => {
    assert.equal(isTerminalAdoptionStatus("completed"), true);
    assert.equal(isTerminalAdoptionStatus("rejected"), true);
    assert.equal(isTerminalAdoptionStatus("submitted"), false);
    assert.equal(isTerminalAdoptionStatus("under_review"), false);
    assert.equal(isTerminalAdoptionStatus("approved"), false);
  });

  it("splits every lifecycle status across exactly one tab", () => {
    const all = [...QUEUE_TAB_STATUSES.active, ...QUEUE_TAB_STATUSES.history].sort();
    assert.deepEqual(all, ["approved", "completed", "rejected", "submitted", "under_review"]);
  });

  it("matches dropdown options to their tab", () => {
    assert.deepEqual([...ACTIVE_STATUS_FILTERS], [...QUEUE_TAB_STATUSES.active]);
    assert.deepEqual([...HISTORY_STATUS_FILTERS], [...QUEUE_TAB_STATUSES.history]);
  });
});

```

## Appendix B — Traceability and known gaps

### Traceability to the module requirements

| Requirement (from `Adoption.md` / `AGENTS.md`)                                  | Cases                    |
| ------------------------------------------------------------------------------- | ------------------------ |
| Registered user submits an adoption application                                 | AD-06 to AD-19           |
| Staff review, approve or reject                                                 | AD-02, AD-21 to AD-34    |
| Applicant tracks application status (timeline, not just current state)          | AD-04, AD-21, AD-30, AD-32 |
| Lifecycle `submitted -> under_review -> approved -> completed`, or `rejected`   | AD-01, AD-21 to AD-28    |
| `rejected` requires `reviewNotes` shown to the applicant                        | AD-29, AD-30             |
| Medical clearance is a hard precondition for approval                           | AD-23                    |
| Approval transfers ownership and removes the animal from public listings        | AD-22 (AD-24 idempotent) |
| Only one active application per animal, safe against concurrent approvals       | AD-10, AD-31             |
| Audit trail for status changes                                                  | AD-21, AD-32             |
| Notifications on stage change (best-effort)                                     | AD-17, AD-18, AD-19, AD-33, AD-34 |
| Applicant privacy: applicants only see their own applications                   | AD-03                    |
| Staff queue Active/History split                                                | AD-35 to AD-37           |

### Known gaps (not covered by these 37 cases)

- `adoptions.routes.ts` — HTTP-layer behaviour (status codes, zod request validation, RBAC rejection of a registered user hitting a staff route) is not unit-tested here; it is exercised indirectly through the service contract.
- `adoptions.repository.ts` — the Drizzle queries and the `23505` unique-violation handling behind `findAdoptionConflict` are not unit-tested; AD-31 covers the service-level pre-check only.
- Frontend adoption components — `AdoptionApplicationForm.tsx`, `ManageAdoptionApplications.tsx` and `MyApplications.tsx` have no automated tests; only the pure `adoptionQueue.ts` helper is covered (AD-35 to AD-37).
- Notification content (email/in-app body text) is asserted by recipient and status only, not by rendered copy.
- Ordering between the two writes on approval (application status first, then the animal marked `adopted`) is asserted through call order in the fakes, not against a real database; the module relies on the partial unique index for the concurrency guarantee.
- The repository also carries a browser-level veterinary emergency test (`src/features/veterinary/emergency.browser.test.ts`) that needs `@electric-sql/pglite` installed and skips unless a Chromium executable is found, so a fresh clone must run `npm install` before `npm test` is fully green.
- One caveat for reproducibility: `mock.module` is ignored on Node v22.20.0, where this suite fails at import time. The results above were produced on Node v24.21.0.
