# Adoption module - manual test runbook

Companion to the **Adoption Application** cases in `TestCases_Gr7.md`
(ADOPT-01 .. ADOPT-10). The automated suite already covers the business rules;
this runbook is for the parts that need a browser, a live database and signed-in
Clerk sessions.

## 1. What is already automated

`npm test` runs, without a database or Clerk:

- `server/src/modules/adoptions/adoptions.service.test.ts` - lifecycle rules,
  clearance/cat/availability gates, the active-application rule, single-approval
  conflict, self-review guard, withdrawal, audit entries, notification
  best-effort, 23505 dilation to a 409, and the compensating writes.
- `server/src/modules/adoptions/adoptions.validation.test.ts` - the request
  schemas (`applicationSchema`, `transitionSchema`) and the
  `businessErrorStatus` mapping (400/403/409).
- `src/features/adoptions/adoptionQueue.test.ts` - the Active/History tab split
  and the terminal-status set.
- `src/utils/pendingAdoption.test.ts` - the anonymous Adopt stash.

Everything below is what those cannot prove: real Clerk sessions, real
Cloudinary uploads, real concurrency, and the rendered UI.

## 2. Environment setup

```sh
# 1. Apply migrations (a missing column is the #1 cause of 500s)
npm run db:migrate

# 2. Start the API (tsx, port 8787 by default) - terminal A
npm run server:dev

# 3. Start the frontend (Vite, port 5173) - terminal B
npm run dev
```

Sign in with four accounts: an applicant, a second applicant, a staff member
and a non-staff registered user.

### Getting a bearer token for the API checks

In the browser, on any signed-in page, run in the console:

```js
await window.Clerk.session.getToken();
```

Copy the token and use it as `TOKEN` below. Tokens expire after about a minute,
so re-fetch between checks. Never paste a token into the repository.

## 3. UI walkthrough (ADOPT-01 .. 05)

### ADOPT-01 - valid adult application

1. Open a listed animal and click **Adopt**.
2. Complete the wizard (About you, Identification, Your home, Pet experience,
   Care plan, Review & submit) with the ADOPT-01 test data.
3. Confirm the Review & submit step summarises the answers you entered.
4. Submit and confirm the success message and the ID photo link, then that the
   row appears on **My Applications** and in the staff **Adoption
   applications** queue (Active tab).

### ADOPT-02 - minor with guardian details

On About you choose **Under 18**. Confirm a **Parent or guardian** page appears,
that all four answers are required, and that the staff queue shows the
**Minor - guardian consent on file** badge.

### ADOPT-03 - tracking and withdrawal

Open the rows on **My Applications**. Confirm the stepper, the answers and the
timestamped progress history render, and that a **rejected** (or **withdrawn**)
application stops the stepper on the furthest stage reached rather than
painting **Submitted**. Then open a live application and click **Withdraw
application**: confirm the status becomes **Withdrawn by you**, that a new
history entry appears, and that the row moves to the staff History tab.
Re-check that you cannot withdraw an already-decided application, nor one
belonging to another account.

### ADOPT-04 - staff queue, lifecycle and rejection

On the Staff Dashboard confirm the adoption metric shows the real count of
`submitted + under_review` applications (no invented numbers). Open the queue
and exercise the Active/History tabs, search (animal name, animal ID, applicant
name, applicant email) and the status filter. Move one application
**Under Review -> Approved -> Completed**, saving a note on the first move.
Confirm each success message, that the applicant receives an in-app
notification and an email, and that the animal disappears from the public
listings after completion. Attempt a rejection with an empty review note (must
be blocked), then supply the note and confirm the applicant sees the
**Not this time** panel. A rejected application's ID document is removed from
Cloudinary - check the asset is gone.

### ADOPT-05 - anonymous Adopt resumes after sign-in

Signed out, click **Adopt**, sign in when prompted and confirm the wizard opens
for the same animal. After submitting, confirm the intent does not resurface on
the next sign-in. Also confirm a signed-in visitor is taken straight to the
form (no stale stash).

## 4. HTTP checks (ADOPT-06 .. 09)

Set `TOKEN` and, for the staff checks, a staff `TOKEN`. Replace ids as needed.

```sh
# ADOPT-06/07 - validation (each returns 400 with the first field message)
curl -s -X POST http://localhost:8787/api/adoptions \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"animalId":"not-a-uuid"}'

# ADOPT-08 - the ID document URL must be https and a real image
curl -s -X POST http://localhost:8787/api/adoptions/id-document \
  -H "Authorization: Bearer $TOKEN" -F "document=@notes.pdf"
# -> 400 "Upload a photo of your identification document (JPG or PNG)."
# (The bytes are checked, so renaming a PDF to .jpg is still refused.)

# ADOPT-09 - unavailable animal -> 400 "This animal is no longer available..."
#            duplicate application -> 400 "You have already applied to adopt..."
#            not cleared -> 400; second approval -> 409; invalid move -> 400
curl -s -X PATCH http://localhost:8787/api/adoptions/$ID \
  -H "Authorization: Bearer $STAFF_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"approved"}'
```

Also confirm, as the **non-staff** user, that `GET /api/adoptions`,
`GET /api/adoptions/:id` and `PATCH /api/adoptions/:id` all return 403, and
that the queue page shows "Access restricted". With no session they return 401.

## 5. Concurrency (ADOPT-10)

With two Under Review applications for the same medically cleared animal,
issue both approvals as close together as possible (two shells, or the two
staff sessions side by side):

```sh
curl -s -X PATCH http://localhost:8787/api/adoptions/$ID_A \
  -H "Authorization: Bearer $STAFF_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"approved"}' &
curl -s -X PATCH http://localhost:8787/api/adoptions/$ID_B \
  -H "Authorization: Bearer $STAFF_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"approved"}' &
wait
```

Exactly one must succeed. The other must fail with 409
("Another applicant has already been approved for this animal.") - either from
the service pre-check or from the `adoption_animal_unique_active` unique
violation being translated to the same 409. Neither may be a 500.

Verify in the database that the animal has at most one
`approved`/`completed` application:

```sql
select animal_id, count(*) from adoption_applications
where status in ('approved','completed') group by animal_id having count(*) > 1;
```

## 6. Recording results

Record the outcome against the matching ADOPT case in `TestCases_Gr7.md`. Use
**Pass** only when every step was observed; leave the Pass/Fail cell blank when
a case has not been run. Put command output or screenshots in the Notes column
rather than editing the Expected Results.
