# ARA System Architecture

## Presentation tier

The Vite React application lives in `src/`. Feature presentation code belongs under `src/features/` or `src/components/` and calls application services through `src/services/`.

## Application tier

The future API lives in `server/src/`. Routes receive requests, middleware verifies Clerk sessions and roles, services enforce business rules, and repositories access data.

## Data tier

PostgreSQL/Neon access belongs under `server/src/db/` and module repositories. The client must not access raw SQL or database credentials.

## Modules

- `animals`: profiles, listings, search, medical-clearance visibility
- `adoptions`: applications and approval workflow
- `rescue`: online and phone rescue reports
- `veterinary`: appointments, treatments, prescriptions, clearance
- `donations`: Stripe checkout and donation audit trail
- `staff`: Clerk invitations and role administration
- `auth`: Clerk session integration

All files in the server scaffold are intentionally placeholders. No backend behavior has been implemented yet.
