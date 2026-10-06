# ARA System Architecture

> Architecture diagram of the **completed** system. Solid lines/boxes = built and
> shipping. Dashed lines/boxes = planned to complete the system (Stripe hosted checkout and notifications).

## Legend

| Style | Meaning |
|---|---|
| Solid box / arrow | Built and functional |
| Dashed box / arrow | Planned for completion |
| `🔒` | Server-side RBAC enforced (Clerk `publicMetadata.role`) |

## System Architecture

```mermaid
flowchart TB
    subgraph External["External Services"]
        CLERK["Clerk Cloud<br/>authentication · user management<br/>invitations · RBAC metadata"]
        CLOUD["Cloudinary<br/>photo uploads"]
        STRIPE["Stripe<br/>donation checkout"]
        OSM["OpenStreetMap / Leaflet<br/>rescue map & location picker"]
        NEON["Neon<br/>PostgreSQL hosting"]
    end

    subgraph Frontend["FRONTEND — Vite + React 19 SPA (port 5173)"]
        direction LR
        PUB["Public<br/>Home · Animal Listings ·<br/>Animal Profile · Rescue Report"]
        AUTH["Clerk<br/>Sign In / Sign Up"]
        USER["Registered User 🔒<br/>Dashboard · My Reports ·<br/>My Applications · Adoption Form ·<br/>Vet Follow-up Bookings"]
        STAFF["Staff 🔒<br/>Dashboard · Rescue Queue ·<br/>Adoption Review · Animal Mgmt ·<br/>Register Animal · Phone Reports"]
        VET["Veterinarian 🔒<br/>Dashboard · Appointments ·<br/>Treatments · Vaccinations ·<br/>Medical Clearance"]
        MGR["Manager / Admin 🔒<br/>Dashboard · Staff Management"]
    end

    subgraph Backend["BACKEND — Express 5 + TypeScript (port 8787)"]
        direction LR
        MW["Middleware<br/>Clerk session verify →<br/>RBAC role check →<br/>Zod validation"]
        API["API Routers<br/>/api/animals · /api/rescue<br/>/api/adoptions · /api/donations<br/>/api/admin · /api/veterinary"]
        SVC["Services<br/>business rules · lifecycle<br/>transitions · audit trail"]
        REPO["Repositories<br/>Drizzle ORM queries"]
    end

    DB["DATABASE — PostgreSQL (Neon)<br/>animals · rescue_reports · adoption_applications<br/>adoption_status_history · vet_appointments<br/>treatments · vaccinations · audit_logs · donations<br/>all data lives here"]

    User[("User / Staff / Vet<br/>(browser)")]

    User -->|HTTP + Bearer token| Frontend
    Frontend -->|HTTP: CORS fetch to VITE_API_URL| Backend

    API --> SVC --> REPO
    REPO -->|Drizzle ORM / neon-http| DB

    Frontend -->|SDK| CLERK
    Backend -->|verifyToken · getUser · invitations| CLERK
    Frontend -->|only public browse| OSM

    Backend -.->|upload photo| CLOUD
    Backend -.->|create checkout session| STRIPE
    STRIPE -.->|webhook → mark paid| Backend

    classDef built fill:#eef6ff,stroke:#2b6cb0,stroke-width:2px;
    classDef planned fill:#fff,stroke:#a0aec0,stroke-width:1.5px,stroke-dasharray:5 5;

    class PUB,AUTH,USER,STAFF,MGR,MW,API,SVC,REPO,DB,CLERK,CLOUD,OSM,NEON built;
    class VET built;
    class STRIPE planned;
```

## Layers

### Frontend — Vite + React 19 SPA (`src/`)

- **No URL router** — navigation is a `view` string in `App.tsx` state, threaded
  to pages as `onNavigate`. Pages: `src/components/` (shared) + `src/features/`
  (animals, rescue, adoptions, donations, veterinary).
- **API access** — `src/services/*Api.ts` call the Express API with `fetch()`
  and a Clerk Bearer token. Public endpoints (listings, rescue reports,
  donations) need no token.
- **Role gating** — header shows the right dashboard based on
  `user.publicMetadata.role`; the server is the real gate.

### Backend — Express 5 + TypeScript (`server/src/`)

Every module follows the same layered pattern:

```
routes.ts  →  service.ts  →  repository.ts
   ↑HTTP        ↑business       ↑Drizzle
   zod only     rules           queries
```

- Auth middleware verifies the Clerk Bearer token (`requireClerkSession`,
  `resolveOptionalClerkUserId`); RBAC checks roles (`requireStaffOrAbove`,
  `requireManagerOrAdmin`).
- `audit.service.ts` writes every sensitive action (dispatch, approval,
  status change) to `audit_logs`.

### Database — PostgreSQL on Neon (single source of truth)

All modules persist to one shared database via Drizzle ORM. Key data:

| Data | Table(s) |
|---|---|
| Animal profiles | `animals` (soft-delete via `deleted_at`) |
| Rescue reports | `rescue_reports` |
| Adoption applications | `adoption_applications` + `adoption_status_history` |
| Vet care | `vet_appointments`, `veterinary_care_plans`, `veterinary_treatment_history` |
| Audit trail | `audit_logs` |
| Donations | `donations` |

## External services

| Service | Used for | Status |
|---|---|---|
| Clerk | Auth, user management, role metadata, staff invitations | Built |
| Cloudinary | Animal / rescue photo uploads | Built |
| Neon | PostgreSQL hosting + pgvector animal search | Built |
| Gemini | Public-profile and full-query embeddings (768 dimensions) | Built |
| OpenStreetMap + Leaflet | Rescue location picker & map | Built |
| Stripe | Donation hosted checkout (`stripe_checkout_session_id` reserved) | Planned |

## Hybrid animal search

The public animal endpoint follows the existing route/service/repository layers.
A deterministic parser supplies explicit structured constraints while Gemini
embeds the full normalized query. Repository SQL applies the shared public
visibility rule and structured predicates, excludes NULL vectors, applies the
configured similarity threshold, orders by pgvector cosine distance, and limits
results. Ranked IDs select and order existing frontend cards; sidebar filters
narrow those results.

Normal listing and AI search both require status other than adopted, no deletion
timestamp, and medical clearance. Embeddings may exist for non-public animals.
Missing-vector retries run after eligible profile updates or successful medical
clearance, without blocking business operations when the provider fails.
See [backend documentation](server/README.md) for exact rules and configuration.
