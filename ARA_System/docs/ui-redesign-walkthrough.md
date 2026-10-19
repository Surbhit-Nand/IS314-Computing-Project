# UI Redesign: Walkthrough

> **Status:** Implemented and **merged into `main`** (`06f364a`, PR #6). `main`'s tree is byte-for-byte identical to `redesigned-ui` (`6225a25`) — the merge changed no UI file.
> **Scope:** The public-facing visual redesign, the internal workspace shell, and the pages that were reskinned or extracted in the redesign range.
> **Branch / commit:** `main` @ `06f364a` (= `redesigned-ui` @ `6225a25`, identical trees)
> **Date:** 2026-10-19
> **How it landed:** `f399a25` (checkpoint), `77bdac2` (merge `origin/kara`), `0abe45f`, `cecad62`, `6225a25` (veterinary sidebar footer), then `06f364a` (PR #6 merged into `main`). The full range from the pre-redesign `main` (`46f2c6f`) is **157 files, +44,935 / −13,322**.

This document describes what the redesigned interface *is*, page by page, and which files own each part. It is a companion to `AGENTS.md` (styling rules) and `docs/adoption-test-cases.md` (adoption tests).

## 1. What changed, in one paragraph

The app moved from a single rounded, gradient-heavy stylesheet (`App.css`, ~8.0k lines) to a **flat, calmer, blue-led visual language** delivered by several new stylesheets that load *after* `App.css` and win by source order. The public homepage and About page were rewritten as photographic, dark-hero layouts using **local image assets** (no more remote CDN hero URLs). Internal staff/vet/dispatcher pages gained a **persistent sidebar workspace shell**, the notification bell was extracted into its own component with deep links, and three new "owner portal" pages were added for adopters. The navigation model itself is unchanged: still a history-state store with **no URL router**.

## 2. Public site

### 2.1 Home — `src/components/HomePage.tsx` + `src/components/HomePage.css`

Root class **`.ara2-home`** (before the redesign it was `.home-page`, which now means something else). Single dark hero, no slideshow.

| # | Section | Class prefix | Contents |
| - | ------- | ------------ | -------- |
| 1 | Hero | `.ara2-hero*` | Full-bleed local `spca-hero.webp`, headline, "Adopt" and "Report a rescue" CTAs, white fade into the page |
| 2 | Shortcut cards | `.ara2-shortcuts`, `.ara2-action*` | Three overlays: Find your companion / Help an animal in need / Follow your rescue |
| 3 | Gallery | `.ara2-gallery*`, `.ara2-pet-grid`, `.ara2-count-N` | First 8 listed animals with photo prev/next, save-heart, "Meet {name}" reveal, species pill; skeleton, empty and error states |
| 4 | Story | `.ara2-story*` | Image dissolving into white at ~42% width, links to the About story |
| 5 | Journey | `.ara2-journey*` | Three numbered steps: Meet the animals / Share your interest / Stay connected |
| 6 | Final CTA | `.ara2-final*` | Uses a real listed animal photo when one exists, falls back to the hero; "Report an animal" |

Props: `onNavigateToStory` was added so the story CTA can smooth-scroll to `#about-our-story` (driven by `pendingAboutStoryScroll` in `App.tsx`).

### 2.2 About — `src/components/AboutUs.tsx` (styles in `App.css`, `.about-revamp` block)

Root `home-page about-page about-revamp`; sections use **`.about2-*`**. Sections: hero (`about-animals.webp`, "SPCA FIJI ISLANDS · EST. 1953") → impact band (1953 / 1000+ / 100%) → story (`Puppy+in+Suva-5855.webp` + 3 care pillars) → help band → team cards → governance list → visit (address, contact `<dl>`, Google map iframe) → dark outro CTA.

### 2.3 Catalogue, profile and auth

- **Animal listings** — `src/components/AnimalListings.tsx`, class root `.animal-catalog-page`. This is the page the redesign **deliberately excluded** from the global reskin: `visual-system.css` scopes itself with `#root:not(:has(.animal-catalog-page))`, so the catalogue keeps its original radii/shadows. Background image `SPCA+Fiji+Islands-05292.webp`.
- **Animal profile** — `src/components/AnimalProfilePage.tsx` (minor changes only).
- **Auth (sign in / up)** — `src/components/AuthPage.tsx`, uses the `.auth-spotlight` treatment with `about-animals.webp` (`0abe45f` switched it to an existing asset).
- **Public rescue report** — `src/features/rescue/RescueReportForm.tsx`, page root `.rescue-public-page` (hero image `SPCA+Fiji+Islands-826131.webp`). The **same component** serves the staff phone-in variant (`rescue-report-phone`), distinguished by `source`.

## 3. Internal workspace shell

`src/components/SiteHeader.tsx` now renders **two shells**:

| Shell | When | Appearance |
| ----- | ---- | ---------- |
| Public | any public page | Horizontal header: Home, About Us, Animals, Rescue Alert, My dashboard, Donate |
| Internal / workspace | `isInternalPage \|\| isRescuePage` | `.site-header.workspace-sidebar` — fixed left navigation |

The sidebar contains `workspace-brand-copy`, `workspace-nav-label`, per-link `<small>` descriptions, a `workspace-sidebar-note` card (paw icons), `workspace-user-name` and a `workspace-signout` button. It is **role-aware**: manager/admin get the manager dashboard, dispatcher gets only Mission Board / Active Mission / Mission History, the vet gets the veterinary workspace, staff get the staff dashboard; Reports appears only for admins.

The veterinary workspace sidebar (`.vet-workspace-sidebar`) carries a dedicated footer treatment added in `6225a25`, the last UI commit before the merge. Its `.vm-navbar-actions` becomes a two-column grid (`minmax(0, 1fr) 40px`) so the account row and the 40px notification bell share one line; the name/role text is allowed to wrap (`overflow-wrap: anywhere`, `.8rem` / `.65rem` type); the bell is re-inked with `--notification-ink: var(--white)`; the avatar is pinned to a centred 40×40 circle; and the sign-out button spans the whole grid (`1 / -1`, 40px min-height, 8px radius) with an `--aqua` `:focus-visible` outline. It lives in `workspace-minimal.css`.

Navigation mechanics are unchanged: `src/navigation/araNavigation.ts` keeps a zod-validated destination in `history.state` with **no URL change**, and `App.tsx` adds a transient `#root.ara-route-transition` class per navigation. The redesign added three views (`my-animals`, `my-animal-record`, `my-animal-booking`), taking the list to 35.

## 4. Operational pages

| Page | Owner file | Notes |
| ---- | ---------- | ----- |
| Manager dashboard | `src/components/ManagerDashboard.tsx` | Staff invites, role editing, `INVITABLE_ROLES` |
| Staff dashboard | `src/components/StaffDashboard.tsx` | Animal registration/review entry points |
| Dispatcher + rescue | `src/components/RescueOperationsPortal.tsx` (`rescue-workspace.css`) | Mission Board / Active Mission / Mission History + mission archive, evidence, activity feed; takeover request review |
| Veterinary workspace | `src/features/veterinary/pages/VeterinaryDashboardPage.tsx`, `VeterinaryCarePage.tsx`, `MedicalHistoryScene.tsx` (`veterinary.css` + `veterinary-minimal.css`) | 3-stage care workflow; **emergency response actions** in `features/veterinary/components/EmergencyResponseActions.tsx` |
| Veterinary records / appointments | `VeterinaryMedicalHistory.tsx`, `VeterinaryAppointmentBooking.tsx`, `VeterinaryUpcomingAppointments.tsx` | Booking uses `components/DateTimePicker.tsx` |
| Adoption queue | `src/features/adoptions/ManageAdoptionApplications.tsx` | Active/History tabs from `adoptionQueue.ts` |
| Reports & analytics | `src/components/ReportsPage.tsx` | Manager/admin only; recharts + `window.print()` PDF |
| User dashboard | `src/components/UserDashboard.tsx` (`UserDashboard.css`) | `.user-dashboard-minimal` |

## 5. Owner portal (new)

An applicant whose adoption is approved owns the animal here.

- **My Animals** — `src/features/veterinary/MyAnimals.tsx` (view `my-animals`), styles `my-animals-banner.css` + `my-animal-records.css`: `.my-animals-banner` hero, then either the animal's record (`my-animal-record`) or the booking flow (`my-animal-booking`) with `companion-booking-layout` / `my-animal-slots` / `my-animal-review`.
- **My Alerts** — `src/features/rescue/MyReports.tsx` (`MyReports.css`), `.my-alerts-page`: the reporter's rescue alerts with filters, count and column headers.
- **My Profile** — `src/components/MyProfilePage.tsx` (`MyProfilePage.css`), `.account-profile-page`.
- **Notification bell** — `src/components/NotificationBell.tsx` (`NotificationBell.css`), extracted out of `App.css`. Renders rescue/adoption/veterinary emergency items, marks read, and **deep-links**: a takeover notice parks its target in `sessionStorage` (key/event from `src/utils/takeoverReview.ts`) and the rescue portal opens the exact mission and request. Non-vets never see veterinary emergency items.

## 6. Design system inventory

| Aspect | Value in the redesigned app |
| ------ | --------------------------- |
| Stylesheets | 15 (was 2): base `index.css`; catch-all `App.css` (12.6k lines); global `visual-system.css`, `workspace.css`, `workspace-minimal.css`, `rescue-workspace.css`; feature files for homepage, About (in `App.css`), profile, dashboard, notifications, my-alerts, My Animals, veterinary |
| Volume | 15 stylesheets / **16,317 lines** in total; `App.css` alone is 12,653 of them, `workspace-minimal.css` 126 |
| Layering | JS import order only (no `@layer`, no `@import`); new sheets load after `App.css` |
| Brand blue | `--spca-brand #115cba` (+ `--spca-deep/ink/muted/line`), `--ara2-blue #115cba`, `--about-blue #1669b8`; two legacy `--home-*` palettes remain in `App.css` |
| Radii | `--control-radius: 6px`, controls/inputs 6–10px, cards 14–16px, pills 999px |
| Type | Base Arial/Helvetica (400/800); redesigned surfaces use `"Segoe UI Variable"` / `"Avenir Next"` / `Inter`, Georgia serif for workspace headings, weights 550–820 |
| Z-index | nav 20 · public header / workspace sidebar 40 · modal 100 · veterinary notification panel 110 · toast 1000 |
| Breakpoints | 1180 / 1120 / 1050 / 980 / 900 / 800 / 760 / 720 / 700 / 620 / 540 / 520 / 500 / 420 / 370 |
| Class prefixes | `ara2-` home, `about2-` about, `workspace-` shell, `vm-` veterinary, `ops-`/`mission-` rescue, `account-`, `my-alert-`, `companion-`, `notification-` |
| Known quirk | `--green: #147fb8` is actually **blue** and is still used by `.urgency-dot.low`; `--success: #1f9d55` is the real green |

## 7. How to see it locally

```sh
npm install
npm run server:dev    # API on 8787 (needs .env.local)
npm run dev           # frontend on 5173
```

Role-specific shells need a signed-in account with the matching Clerk `publicMetadata.role`; `DEV_BYPASS_AUTH` / `VITE_DEV_BYPASS_AUTH` relax the role check in local development only.

## 8. Rough edges worth knowing

- **`App.css` stacks layers rather than replacing them**: three overlapping homepage palettes (`--home-*` at two places, `--spca-*`) and two About implementations. "Which rule wins" depends on line position, so prefer editing the owning feature file.
- **No single token source** any more — colours are split across `index.css`, the new global sheets, and four palettes inside `App.css`.
- Only the pages listed above were reskinned; the catalogue is intentionally excluded, so a change to `visual-system.css` will not affect it.
- The redesign shipped **no backend redesign** — but it did bundle the veterinary emergency workflows, the rescue takeover feature and the My Animals API, so a "UI" branch can still contain migrations.
