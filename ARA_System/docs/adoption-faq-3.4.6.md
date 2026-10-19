# 3.4.6 Adoption and AI search

Corrected FAQ copy for the report. Every answer below was checked against the
implementation at `main @ 4973aa4`, plus the follow-up fixes landed with this
doc (a withdrawn application no longer blocks re-applying; the applicant view
presents cancellation rather than a "Withdrawn" status; withdrawal now notifies
the applicant). Where the original wording was wrong, the correction is called
out at the bottom so the change is easy to defend in the viva.

## Adoption

**Who can apply to adopt an animal?**
Only registered, signed-in users. Unregistered visitors can browse the listings
but cannot submit an application.

**I clicked Adopt before logging in. Do I lose my place?**
No. The system remembers the animal you chose for up to a week, so after you
sign in you can carry on with the application for that animal.

**Can I apply if I am under 18?**
Yes, but a parent or guardian must be named, contactable, and recorded as
consenting to the adoption.

**Why was my application for a cat refused?**
Applications for cats are not accepted from applicants who declare a respiratory
condition, because of the allergen risk. This does not apply to dogs.

**Can I apply for the same animal twice?**
No. You can have only one active application per animal. An application that has
been rejected, completed, or withdrawn is closed and does not count, so you may
apply again if your previous application ended.

**What do the statuses mean?**
Submitted: received. Under review: staff are checking it. Approved: accepted,
pending handover. Completed: adoption finished. Rejected: declined, with a note
explaining why. Withdrawing is not one of these stages: it is an action you take
yourself, and the application then shows as **cancelled** and closed.

**Why was my application rejected?**
Staff must write a review note for every rejection. Open the application in My
Applications to read it.

**Why can't staff approve an application yet?**
The animal must be medically cleared by the veterinarian first, and no other
applicant can already be approved for it.

**How do I know when my application changes?**
You receive an in-app notification at every status change, including when you
cancel your own application. Where the email service is configured, the same
message is also emailed to you. The in-app notification is the reliable one;
email is sent on a best-effort basis and a mail outage never blocks a status
change.

**Why can't I see the animal I applied for in the listings anymore?**
Once an application is approved, the animal is marked as adopted and removed
from the public listings, because approval is the point at which ownership is
transferred. Completing the adoption re-confirms the same status.

## AI search

**Who can use AI search?**
Anyone. It sits on the public listings page and needs no account, exactly like
browsing the catalogue.

**What does it actually do?**
It converts the sentence you type into a meaning-based (embedding) search over
the same publicly adoptable animals the normal listing shows, and ranks them by
how closely they match. It is an assistive way to find animals — it never
approves, rejects, or changes an adoption, and never decides which animals are
available.

**Can AI search show me an animal that isn't adoptable?**
No. It applies the identical visibility rule as the normal listing (not adopted,
not deleted, and medically cleared), so an animal the listing hides cannot be
returned by AI search.

**What if the search service is down?**
You keep the full listing and the ordinary filters, with a short message
explaining that AI search is unavailable. A search that genuinely matches
nothing shows an empty result rather than falling back to everything.

## Corrections made to the previous revision

1. **"Removed from the listings once the adoption is completed" was wrong.**
   The animal is marked `adopted` at **approval**, not completion
   (`adoptions.service.ts`, the `approved`/`completed` branch). Completion only
   re-asserts the status for applications approved under the older rule.

2. **"You receive an in-app notification and an email at every status change"
   overstated the email guarantee.** Email is skipped entirely when no mail
   provider key (`RESEND_API_KEY`) is configured (`services/email.ts`), and it
   is best-effort by design — a mail failure never blocks the status change. The
   in-app notification is the durable record.

3. **"One active application per animal" needed a definition of *active*, and
   the code did not match it.** A **withdrawn** application was being counted as
   active, so withdrawing permanently blocked re-applying for that animal — the
   opposite of what the FAQ implies, since withdrawing is the one status a user
   chooses themselves. Fixed: `findActiveAdoptionApplication` now treats
   `rejected`, `completed` and `withdrawn` as closed, and a regression test pins
   that list to the lifecycle's terminal statuses.

4. **`Withdrawn` is not shown to the applicant as a lifecycle status.** The
   system still stores `withdrawn` and staff queues still show and filter it
   (they must find and count those records), but the applicant's own view
   presents the outcome as **cancelled** — `applicantClosureShortLabel` /
   `applicantClosureLabel` in `src/types/adoption.ts`, pinned by
   `src/types/adoption.test.ts` so the staff wording cannot leak back. The
   status list the applicant sees is therefore the five lifecycle stages above.

5. **The AI search half of the section was empty.** The heading promised it but
   no Q&A followed; the four questions above fill that in.

6. **Withdrawal notified nobody.** `withdrawAdoptionApplication` wrote the
   status, history and audit rows but never told the applicant, so "any change in
   status" was quietly false for a self-cancellation. It now sends the same
   in-app row plus best-effort email as every staff transition, with dedicated
   `withdrawn` copy in `notifications.service.ts` and `services/email.ts`.
