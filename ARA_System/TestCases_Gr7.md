**Animal Registration**

**Rescue Alert and Dispatch** 

Valid:

| RESC-01: Submit a valid Rescue Alert form |  |
| :---- | :---- |
| **Purpose:** | This tests that a user is able to successfully submit a rescue alert form with valid details. |
| **Preconditions:** | The Rescue Alert Page is available and displayed. |
| **Test Data:** | Reporter Name: Test User Phone Number: 1234567 Email Address: [testuser@email.com](mailto:testuser@email.com) Location: Damodar City, Grantham Road, Raiwaqa, Suva, Rewa, Central, Fiji Animal type: Dog Breed/Description: It is a big dog. It looks like a German Shepherd Urgency: High Condition of animal: It is hurt. |
| **Test Steps:** | Navigate to the Rescue Alert page. Enter valid reporter details. Enter location. Enter animal details. Select “High” urgency. Click the “Submit rescue alert” button. |
| **Expected Results:** | The rescue alert must be successfully submitted and saved in the database. A unique reference ID will be given to the rescue alert and this will be visible to the staff and dispatcher’s page. |
| **Actual Results:** | The rescue alert was successfully submitted and was given a unique reference ID. This then became visible on “My Alerts” page, and on the staff and dispatcher’s module. |
| **Pass/Fail:** |  Pass  |
| **Notes and Questions:** |   |

| Resc-02: Choosing a location by searching or pinning on the map. |  |
| :---- | :---- |
| **Purpose:** | This tests that a user should be able to select a location by searching on the search bar or by pinning on the map. |
| **Preconditions:** | The Rescue Alert Page is available and displayed. |
| **Test Data:** | Search or pin a valid location. |
| **Test Steps:** |  |
| **Expected Results:** |  |
| **Actual Results:** |   |
| **Pass/Fail:** |   |
| **Notes and Questions:** |   |

| RESC-0: Viewing submitted Rescue Alerts. |  |
| :---- | :---- |
| **Purpose:** | Users must be able to view all submitted rescue alerts, view their details, and track the progress of the alert. |
| **Preconditions:** | The user is logged in and has previously submitted rescue alerts. |
| **Test Data:** | Rescue Alerts associated with the user’s account. |
| **Test Steps:** | Log in to a user account. Navigate to the Rescue Alert tab. Click the “My Alerts” button to go to the My Alerts page. Select one alert from the list. View alert details.  |
| **Expected Results:** | The list of rescue alerts associated with the user’s account will be displayed in the My Alerts page, displaying the reference number and current status. The details will be viewed once the user selects an alert.  |
| **Actual Results:** |  |
| **Pass/Fail:** |   |
| **Notes and Questions:** |   |

| RESC-0: Viewing submitted Rescue Alerts from the staff’s dashboard |  |
| :---- | :---- |
| **Purpose:** |  |
| **Preconditions:** |  |
| **Test Data:** |  |
| **Test Steps:** |  |
| **Expected Results:** |  |
| **Actual Results:** |  |
| **Pass/Fail:** |   |
| **Notes and Questions:** |   |

| RESC-0: Viewing Rescue Alerts from the Dispatcher’s dashboard |  |
| :---- | :---- |
| **Purpose:** |  |
| **Preconditions:** |  |
| **Test Data:** |  |
| **Test Steps:** |  |
| **Expected Results:** |  |
| **Actual Results:** |  |
| **Pass/Fail:** |   |
| **Notes and Questions:** |   |

| RESC-0: Accepting a Rescue Mission as a dispatcher |  |
| :---- | :---- |
| **Purpose:** |  |
| **Preconditions:** |  |
| **Test Data:** |  |
| **Test Steps:** |  |
| **Expected Results:** |  |
| **Actual Results:** |  |
| **Pass/Fail:** |   |
| **Notes and Questions:** |   |

| RESC-0: Releasing a Rescue Mission |  |
| :---- | :---- |
| **Purpose:** |  |
| **Preconditions:** |  |
| **Test Data:** |  |
| **Test Steps:** |  |
| **Expected Results:** |  |
| **Actual Results:** |  |
| **Pass/Fail:** |   |
| **Notes and Questions:** |   |

Invalid: 

| RESC-02: Submitting rescue alert form with mandatory fields not filled. |  |
| :---- | :---- |
| **Purpose:** | This tests that a user should not be able to submit a rescue alert if the required fields are not populated. |
| **Preconditions:** | The Rescue Alert Page is available and displayed. |
| **Test Data:** | Leave one of the required fields empty. |
| **Test Steps:** | Navigate to the Rescue Alert page. Enter valid details skipping the location field. Click the “Submit rescue alert” button.  |
| **Expected Results:** | The rescue alert must not be submitted and an alert is displayed, informing the user that the required field must be filled. |
| **Actual Results:** |   |
| **Pass/Fail:** |   |
| **Notes and Questions:** |   |

| RESC-0: Submitting Rescue Alert form with invalid phone number |  |
| :---- | :---- |
| **Purpose:** |  |
| **Preconditions:** |  |
| **Test Data:** | Enter a phone number with more than 7 digits, eg. 343434344452345345 |
| **Test Steps:** |  |
| **Expected Results:** |  |
| **Actual Results:** |  |
| **Pass/Fail:** |   |
| **Notes and Questions:** |   |

| RESC-0: Submitting Rescue Alert form with invalid Location |  |
| :---- | :---- |
| **Purpose:** |  |
| **Preconditions:** |  |
| **Test Data:** | Enter a phone number with more than 7 digits, eg. 343434344452345345 |
| **Test Steps:** |  |
| **Expected Results:** |  |
| **Actual Results:** |  |
| **Pass/Fail:** |   |
| **Notes and Questions:** |   |

| RESC-0: Resolve Rescue Mission with the mandatory fields empty |  |
| :---- | :---- |
| **Purpose:** |  |
| **Preconditions:** |  |
| **Test Data:** | Enter a phone number with more than 7 digits, eg. 343434344452345345 |
| **Test Steps:** |  |
| **Expected Results:** |  |
| **Actual Results:** |  |
| **Pass/Fail:** |   |
| **Notes and Questions:** |   |

**Vet module**

Valid

Invalid:

1. Record initial assessment with an invalid date.  
2. View animal medical history

Valid: 

| VET-01: Record an Initial assessment and produce a care plan for the animal |  |
| :---- | :---- |
| **Purpose:** | This tests that a veterinarian user is able to successfully record and submit initial assessment and create a care plan for the animal using valid details. |
| **Preconditions:** | The veterinarian logged in and the animal must be visible in the animal queue. |
| **Test Data:** | Assessment Date/Time: 13/10/2026 10:00 AM Weight: 10 kg Temperature: 36°C General Condition: Calm and quiet Required Care: Core Vaccination, Booster, and Desexing |
| **Test Steps:** | Navigate to the Medical Queue page . Select an animal and click the “Run assessment” button. Start Initial assessment. Enter the initial assessment details. Submit and save assessment.   |
| **Expected Results:** | The Initial assessment must be successfully recorded and the Required treatments page is unlocked. The selected treatments are displayed under the Treatment plan. |
| **Actual Results:** | The Initial assessment is successfully saved. The Required Treatments page became available. The Treatment plan displays Core Vaccination, Booster, and Desexing. |
| **Pass/Fail:** | Pass |
| **Notes and Questions:** |  Animal was successfully  |

| VET-02: Complete required medical treatments and medically clear an animal. |  |
| :---- | :---- |
| **Purpose:** | This tests that a veterinarian user is able to |
| **Preconditions:** | The veterinarian logged in and the initial assessment has been recorded. |
| **Test Data:** | Assessment Date/Time: 13/10/2026 10:00 AM Weight: 10 kg Temperature: 36°C General Condition: Calm and quiet Required Care: Core Vaccination |
| **Test Steps:** | Navigate to the  |
| **Expected Results:** |  |
| **Actual Results:** |  |
| **Pass/Fail:** |   |
| **Notes and Questions:** |   |

| VET-03:  View animals needing of assessment |  |
| :---- | :---- |
| **Purpose:** | This tests that a veterinarian should not be able to record Initial Assessment and move onto the required treatments if the required fields are not populated. |
| **Preconditions:** |  |
| **Test Data:** |  |
| **Test Steps:** |  |
| **Expected Results:** |  |
| **Actual Results:** |  |
| **Pass/Fail:** |   |
| **Notes and Questions:** |   |

| VET-04:  Book an appointment with available date and timeslot |  |
| :---- | :---- |
| **Purpose:** | This tests that a veterinarian should not be able to record Initial Assessment and move onto the required treatments if the required fields are not populated. |
| **Preconditions:** |  |
| **Test Data:** |  |
| **Test Steps:** |  |
| **Expected Results:** |  |
| **Actual Results:** |  |
| **Pass/Fail:** |   |
| **Notes and Questions:** |   |

| VET-05:  Record a follow-up appointment visit and treatment details |  |
| :---- | :---- |
| **Purpose:** | This tests that a veterinarian should not be able to record Initial Assessment and move onto the required treatments if the required fields are not populated. |
| **Preconditions:** |  |
| **Test Data:** |  |
| **Test Steps:** |  |
| **Expected Results:** |  |
| **Actual Results:** |  |
| **Pass/Fail:** |   |
| **Notes and Questions:** |   |

| VET-06:  Edit and update existing medical details recorded |  |
| :---- | :---- |
| **Purpose:** |  |
| **Preconditions:** |  |
| **Test Data:** |  |
| **Test Steps:** |  |
| **Expected Results:** |  |
| **Actual Results:** |  |
| **Pass/Fail:** |   |
| **Notes and Questions:** |   |

Invalid: 

| VET-06:  Submit Initial Assessment with mandatory fields not filled. |  |
| :---- | :---- |
| **Purpose:** |  |
| **Preconditions:** |  |
| **Test Data:** |  |
| **Test Steps:** |  |
| **Expected Results:** |  |
| **Actual Results:** |  |
| **Pass/Fail:** |   |
| **Notes and Questions:** |   |

| VET-0:  Record an Initial Assessment with an invalid Estimated age |  |
| :---- | :---- |
| **Purpose:** |  |
| **Preconditions:** |  |
| **Test Data:** |  |
| **Test Steps:** |  |
| **Expected Results:** |  |
| **Actual Results:** |  |
| **Pass/Fail:** |  Fail |
| **Notes and Questions:** |   |

| VET-0:  Book an appointment with an unavailable time slot. |  |
| :---- | :---- |
| **Purpose:** | This tests that a user should not be able to book an appointment with an invalid or occupied time slot. |
| **Preconditions:** | The user must be logged in and a veterinary appointment must be occupying the chosen date and time. |
| **Test Data:** |  |
| **Test Steps:** |  |
| **Expected Results:** |  |
| **Actual Results:** |  |
| **Pass/Fail:** |   |
| **Notes and Questions:** |   |

Unknown: 

| VET-0:  Two users attempt to book the same Appointment slot |  |
| :---- | :---- |
| **Purpose:** | This tests that a user should not be able to book an appointment with an invalid or occupied time slot. |
| **Preconditions:** | The user must be logged in and a veterinary appointment must be occupying the chosen date and time. |
| **Test Data:** |  |
| **Test Steps:** |  |
| **Expected Results:** |  |
| **Actual Results:** |  |
| **Pass/Fail:** |   |
| **Notes and Questions:** |   |

| VET-0:  Two veterinarians edit the same animal record at the same time |  |
| :---- | :---- |
| **Purpose:** |  |
| **Preconditions:** |  |
| **Test Data:** |  |
| **Test Steps:** |  |
| **Expected Results:** |  |
| **Actual Results:** |  |
| **Pass/Fail:** |   |
| **Notes and Questions:** |   |

**AI search**

**Adoption Application**

Valid:

| ADOPT-01: Submit a valid adoption application (adult applicant) |  |
| :---- | :---- |
| **Purpose:** | This tests that a signed-in registered user can successfully submit an adoption application for a medically cleared, listed animal using valid details. |
| **Preconditions:** | The animal is publicly listed (not adopted, not deleted, medically cleared) and the user is signed in. A JPG/PNG photo of an identification document is ready to upload. |
| **Test Data:** | Animal: a listed dog (e.g. Bella). Full name: Mere Koro. Contact number: +679 9900000. Email: mere@example.com. Age: Adult (18+). ID document: Voter ID card plus a JPG/PNG document photo. Pet allergies: No. Respiratory condition: No. Owned pets before: No. Current pets: No. Vet cost plan: Savings and family support. Next of kin: Jone Koro, +679 9900001. Adoption for: Myself. |
| **Test Steps:** | Sign in. Open the animal's profile from the listings and click "Adopt". Complete each wizard page (About you, Identification, Your home, Pet experience, Care plan, Review & submit), pressing Next. Upload the document photo on the Identification page. On Review & submit check the answer summary, select "Myself" and click "Submit adoption application". |
| **Expected Results:** | The application is saved with the status "Submitted - awaiting review" and the success screen reads "Thank you for applying to adopt <name>." The photo is stored and shown to staff as an "ID photo - Open document photo" link. The application appears on My Applications and in the staff Adoption applications queue (Active tab), with the first status-history entry recorded, an in-app and email notification to the applicant, and a submission entry in the audit trail. |
| **Actual Results:** | Confirmed by the automated suite: the create, the first history entry and the submission audit entry are covered by adoptions.service.test.ts, and the full payload by adoptions.validation.test.ts. The browser wizard was not observed. |
| **Pass/Fail:** | Pass |
| **Notes and Questions:** | The wizard and the API accept the same payload, so this case also stands in for the equivalent direct API submission. |

| ADOPT-02: Submit an adoption application as a minor (guardian details) |  |
| :---- | :---- |
| **Purpose:** | This tests that an applicant under 18 reaches a guardian step and that all guardian details and consent are captured and stored. |
| **Preconditions:** | The user is signed in and the animal is listed. |
| **Test Data:** | Age: Under 18. Guardian name: Jone Koro. Guardian contact: +679 9900001. Relationship: Parent. Guardian consent: checked. Remaining answers as for ADOPT-01. |
| **Test Steps:** | Start an application and, on About you, select "Under 18" and press Next. Complete the Parent or guardian page (name, contact, relationship, consent checkbox), continue through the remaining pages and submit. |
| **Expected Results:** | A "Parent or guardian" page appears between About you and Identification, and all four guardian answers are required to continue. On submit the guardian name, contact, relationship and consent are stored, the staff queue shows a "Minor - guardian consent on file" badge, and the review panel lists the guardian rows under "1. Applicant". |
| **Actual Results:** | Confirmed by the automated suite: guardian storage is covered by adoptions.service.test.ts and the required-answer rules by adoptions.validation.test.ts (guardian consent and relationship messages). The wizard page and queue badge were not observed. |
| **Pass/Fail:** | Pass |
| **Notes and Questions:** |   |

| ADOPT-03: Track applications from My Applications and withdraw a live one |  |
| :---- | :---- |
| **Purpose:** | This tests that an applicant can view their applications and their progress, and withdraw one while it is still being decided. |
| **Preconditions:** | The user is signed in with at least one live application (Submitted or Under Review) and one already-decided application. |
| **Test Data:** | The applicant's own applications; a second account that does not own one of them. |
| **Test Steps:** | Sign in and open My Applications, then click a row and review the stepper, answers and progress history. Open the rejected application. Then open a live application and click "Withdraw application", confirming the prompt. Attempt to withdraw the same application again and an application belonging to another account. |
| **Expected Results:** | Each row shows the animal photo, name, public ID, date submitted and a status badge. The modal shows the four-stage stepper at the current stage, the answers grouped into sections 1-5, and a timestamped progress history. A rejected (or withdrawn) application stops the stepper on the furthest stage its history records instead of showing "Submitted" as the current stage, and shows the staff review note. Withdrawing moves the live application to "Withdrawn" ("Withdrawn by you") with a new history entry and an audit entry (action "adoption.application.withdrawn"), removes it from the staff Active tab and shows it in History. The repeat and other-account attempts are refused (400 and 403) with nothing changed. The uploaded identification document is removed from Cloudinary (best-effort). |
| **Actual Results:** | Confirmed by the automated suite: the applicant query and the history attachment, and the withdraw, ownership and terminal-state rules, are covered by adoptions.service.test.ts, and the reviewer status set (withdrawal is applicant-only) by adoptions.validation.test.ts. The modal, stepper and button were not observed. |
| **Pass/Fail:** | Pass |
| **Notes and Questions:** | Only the applicant can withdraw, so withdrawal is deliberately not one of the staff "Move to" options. |

| ADOPT-04: Review and decide an application from the staff queue |  |
| :---- | :---- |
| **Purpose:** | This tests that a staff member can open the adoption queue, locate applications, and carry one through Under Review, Approved and Completed (or reject it with a note), and that completing the adoption removes the animal from the public listings. |
| **Preconditions:** | The user is signed in with a staff, veterinarian, manager or admin role. A Submitted application exists for a medically cleared animal with no competing approved application, and at least one finished application exists. |
| **Test Data:** | Search by a known animal name, animal ID and applicant name. Move to: Under Review (note: "Checking your home details - we'll be in touch."), then Approved, then Completed. A second application is moved to Rejected with reason "Home visit found no fenced yard." |
| **Test Steps:** | Open the Staff Dashboard, check the adoption metric, then click into the Adoption applications queue. Switch between the Active and History tabs, search by animal and applicant, and change the status filter. Expand the Submitted application, move it to Under Review with the note, then to Approved and finally to Completed. Expand another application, attempt a rejection with an empty review note, then supply the reason and save. Finally open the public listings and search for the completed animal. |
| **Expected Results:** | The dashboard shows the real count of applications awaiting a decision (submitted plus under review) and navigates to the queue. The Active and History tabs split live work from finished applications (a withdrawn application appears in History), search narrows by animal name, animal ID, applicant name or email, and the status filter shows only that status. Each successful move shows "Application for <name> moved to <status>." and writes a timestamped history entry (actor plus note), an audit entry (action "adoption.application.status_changed") and an in-app and email notification to the applicant. The empty-note rejection is blocked with "Add a review note explaining the rejection so the applicant knows why."; with the note the status becomes "Rejected" and the applicant's detail modal shows the "Not this time" panel containing the note. On completion the animal is marked adopted and no longer appears in the public listings, while the application and its history remain readable in the History tab. |
| **Actual Results:** | Confirmed by the automated suite: the under_review, approved, completed and rejected transitions, the required-note rule, the notify/audit calls and marking the animal adopted are covered by adoptions.service.test.ts, the 400 mapping by adoptions.validation.test.ts, and the Active/History split by src/features/adoptions/adoptionQueue.test.ts. The queue UI, search, filtering and dashboard metrics were not observed. |
| **Pass/Fail:** | Pass |
| **Notes and Questions:** | If the animal update fails on completion the previous status is restored, so a "Completed" application never leaves its animal still listed. |

| ADOPT-05: Anonymous visitor resumes an adoption after signing in |  |
| :---- | :---- |
| **Purpose:** | This tests that when a signed-out visitor clicks Adopt, the intended animal is remembered and the application flow resumes after they sign in. |
| **Preconditions:** | The visitor is signed out and a listed animal is available. |
| **Test Data:** | A listed animal's profile. |
| **Test Steps:** | While signed out, open an animal profile and click "Adopt", then sign in when prompted. Confirm the wizard opens for the same animal and submit the application. |
| **Expected Results:** | The visitor is prompted to sign in and, after signing in, is returned to the apply-to-adopt wizard for the originally selected animal. Once the intent is consumed or the application is submitted, the stash is cleared and does not resurface on the next sign-in. A signed-in visitor is never stashed. A week-old stash is treated as abandoned. |
| **Actual Results:** | Confirmed by the automated suite: the stash read, write, expiry and clear logic are covered by src/utils/pendingAdoption.test.ts. The sign-in redirect and wizard resume were not observed. |
| **Pass/Fail:** | Pass |
| **Notes and Questions:** |   |

Invalid:

| ADOPT-06: Submit with missing or malformed details |  |
| :---- | :---- |
| **Purpose:** | This tests that structurally invalid or incomplete payloads are rejected before any business logic runs, with a specific field message. |
| **Preconditions:** | A signed-in user on the apply-to-adopt wizard, with a way to send a crafted request. |
| **Test Data:** | Case A: Full name left empty. Case B: Email "mere@". Case C: contact number "12345678901234" (too long); next-of-kin number "12" (too short). Case D: animalId "not-a-uuid". Case E: ageBracket "child". |
| **Test Steps:** | On About you leave Full name empty and click Next. Enter the invalid email and over-long contact number and click Next. On Care plan enter the too-short next-of-kin number and click Next. Then send applications with the non-UUID animalId and the invalid ageBracket. |
| **Expected Results:** | The wizard does not advance and shows the relevant inline message: "Tell us your full name.", "Enter a valid email address.", "Enter a valid Fiji contact number (6-7 digits).", "Enter a valid Fiji next-of-kin number (6-7 digits)." A direct API call returns 400 with the first field message and creates no application row ("Link a valid animal" for the animal id, "Tell us whether you are 18 or older" for the age bracket). |
| **Actual Results:** | Confirmed by the automated suite: every message is covered by adoptions.validation.test.ts, and the Fiji 6-7 digit band by src/utils/phone.test.ts. The wizard's Next-blocking was not observed. |
| **Pass/Fail:** | Pass |
| **Notes and Questions:** |   |

| ADOPT-07: Answers that contradict the rest of the application |  |
| :---- | :---- |
| **Purpose:** | This tests that the answers an applicant gives must agree with each other - guardian details only for minors, an outcome for past pets, details for current pets, and no cat adoption with a respiratory condition. |
| **Preconditions:** | The user is signed in on the apply-to-adopt wizard, for a listed cat. |
| **Test Data:** | Case A: age "Under 18" with the guardian relationship missing or consent unchecked. Case B: age "Adult (18+)" with guardian fields populated. Case C: "Owned pets before = Yes" with the outcome blank. Case D: "Current pets = Yes" with the details blank. Case E: respiratory condition "Yes" on the cat. |
| **Test Steps:** | For each case, reach the relevant wizard page, produce the contradiction and click Next. Repeat the equivalent calls directly against the API. |
| **Expected Results:** | Each case is blocked with its own message - "Choose their relationship to you." or "Your parent or guardian must consent to this adoption.", "Guardian details are only needed for applicants under 18", "Tell us what happened to your previous pet(s).", "Tell us about your current pets.", and "Applicants with asthma or a respiratory condition cannot adopt cats, for health and safety. Our team can suggest a dog, rabbit or other pet instead." A whitespace-only previous-pet outcome is treated as missing. No application is created. |
| **Actual Results:** | Confirmed by the automated suite: every rule and message is covered by adoptions.validation.test.ts, and the cat health gate by adoptions.service.test.ts. The wizard was not observed. |
| **Pass/Fail:** | Pass |
| **Notes and Questions:** | The cat gate is species-specific, so the same "Yes" answer is accepted for a dog (the respiratory question is shown for information in that case). |

| ADOPT-08: Identification document missing or not an image |  |
| :---- | :---- |
| **Purpose:** | This tests that the application requires a valid image identification document and refuses a non-image upload. |
| **Preconditions:** | The user is signed in on the Identification page. |
| **Test Data:** | Case A: no document uploaded. Case B: a PDF or text file selected (including one renamed with a .jpg extension). Case C: an application submitted with no idDocumentUrl. |
| **Test Steps:** | Case A: choose a document type, upload nothing and click Next. Case B: select a non-image file and attempt the upload. Case C: send an application to the API without an idDocumentUrl. |
| **Expected Results:** | Case A: the wizard blocks with "Upload a photo of your identification document." Case B: the upload is rejected with "Upload a photo of your identification document (JPG or PNG)." - the file's actual bytes are checked, so a renamed non-image is refused. Case C: the API returns 400 with "Upload your identification document photo". |
| **Actual Results:** | Confirmed by the automated suite for Case C, which is covered by adoptions.validation.test.ts, and the upload helper by adoptions.service.test.ts. The magic-byte check, the multer file filter and the wizard upload step were not observed end to end. |
| **Pass/Fail:** | Pass |
| **Notes and Questions:** | The stored document URL must be https, so a javascript: or data: URL cannot be stored and rendered as a clickable staff link. |

| ADOPT-09: Refused writes (unavailable animal, duplicate application, blocked approval, invalid move) |  |
| :---- | :---- |
| **Purpose:** | This tests that the API refuses a submission or a move that breaks a business rule, and never creates or changes a record when it does. |
| **Preconditions:** | The user is signed in, with the id of a soft-deleted, adopted or nonexistent animal, an existing live application of their own, an Under Review application for an animal that is not medically cleared, and two applications for one medically cleared animal where one is already approved. Applications in "Submitted", "Approved" and "Completed" states are also available. |
| **Test Data:** | Case A: an unavailable animal id. Case B: the same animal id submitted twice, including a rapid double-submit of the form. Case C: approve the uncleared animal. Case D: approve a second application for the already-approved animal. Case E: move "Submitted" directly to "Approved"; move "Approved" to "Rejected"; move anything out of "Completed". |
| **Test Steps:** | Send each request (or attempt it in the wizard / queue) and then re-check the application's status. |
| **Expected Results:** | Case A returns 400 "This animal is no longer available for adoption." and creates no row. Case B: the first submission succeeds and the second is blocked with 400 "You have already applied to adopt this animal."; while submitting, the button is disabled and reads "Submitting application...". Case C returns 400 "This animal is not yet medically cleared for adoption." (the queue shows a "Not cleared" badge and disables the approval option). Case D returns 409 "Another applicant has already been approved for this animal." Case E returns 400 for each invalid move, e.g. 'Adoption application cannot move from "submitted" to "approved" - only under_review, rejected may come next.' A reviewer cannot approve their own application (403). Every refusal leaves the record unchanged. |
| **Actual Results:** | Confirmed by the automated suite: each rule is covered by adoptions.service.test.ts and the 400/403/409 mapping by adoptions.validation.test.ts. The wizard, queue and submit-button states were not observed. |
| **Pass/Fail:** | Pass |
| **Notes and Questions:** | Case D is the rule that keeps an animal from being adopted twice; the concurrent version is ADOPT-10. |

Unknown: 

| ADOPT-10: Two staff approve competing applications for the same animal at the same time |  |
| :---- | :---- |
| **Purpose:** | This tests the race guard when two staff members approve competing applications for one animal concurrently. |
| **Preconditions:** | Two Under Review applications for the same medically cleared animal, with two staff sessions or concurrent requests, against the running API and a live database. |
| **Test Data:** | Two PATCH approvals issued at nearly the same time. |
| **Test Steps:** | Issue PATCH /api/adoptions/:id (approve) for both applications as close together as possible. |
| **Expected Results:** | Exactly one approval succeeds. The other fails with the friendly 409 ("Another applicant has already been approved for this animal.") or with a database unique-violation on adoption_animal_unique_active translated to the same 409. The animal never ends up with two approved applications. |
| **Actual Results:** | Not run. The partial unique index and the 23505 to 409 path cannot be triggered from this environment. The non-concurrent 409 is covered by adoptions.service.test.ts and adoptions.validation.test.ts. |
| **Pass/Fail:** |   |
| **Notes and Questions:** | See docs/adoption-manual-test-runbook.md for the manual concurrency procedure. |
