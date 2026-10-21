# ARA: Animal Rescue and Adoption Management System

ARA is a website for SPCA Fiji that connects animal rescue, veterinary care,
public animal listings and adoption in one system. It is the IS314 Computing
Project developed by Group 7 at the University of the South Pacific.

The public can discover animals, submit adoption applications and report animals
that need help. Staff use role-based workspaces to manage profiles, coordinate
rescues, record veterinary care and follow each animal's progress toward adoption.

## What the website does

- **Animal discovery:** browse public animal profiles, photographs and behaviour
  tags; narrow listings by species, size, gender, breed and other filters.
- **AI-assisted search:** describe a suitable animal in natural language, such as
  `small energetic cuddly dog`. Explicit requirements filter candidates, matching
  animal tags rank first, and semantic search finds relevant profile descriptions.
  High-confidence spelling correction runs first and displays a clickable
  **Did you mean** suggestion when appropriate.
- **Adoption:** submit and track applications, let staff review them, and give
  approved adopters access to **My Animals**, veterinary history and appointment
  booking for their animals.
- **Rescue coordination:** report incidents, manage rescue requests, assign work
  and track active operations and their history.
- **Veterinary care:** manage the medical queue, assessments, treatment records,
  appointments and clearance for public listing.
- **Staff and management tools:** role-based dashboards, notifications and reports
  support the organisation's daily work.

Public listings only show published, medically cleared animals that have not
been adopted, closed or deleted. AI search cannot override these rules or make
adoption decisions. Account access and staff permissions are handled through Clerk.

## Technology and project layout

| Part | Technology |
|---|---|
| Frontend | React, TypeScript and Vite |
| Backend | Express and TypeScript |
| Database | PostgreSQL on Neon, managed through Drizzle ORM |
| Authentication | Clerk |
| Image uploads | Cloudinary |
| AI search | Gemini embeddings and PostgreSQL pgvector |

```text
IS314-Computing-Project/
  README.md                    Project overview and setup guide
  ARA_System/                  Run all npm commands from this directory
    src/                       Frontend components, pages and API clients
    server/src/                Backend routes, services and database code
    server/src/db/migrations/  Database migrations
    docs/                      Feature reports and development notes
    .env.example               Frontend configuration template
    server/.env.example        Backend configuration template
    package.json               Frontend and backend scripts/dependencies
```

## Requirements

- Git, Node.js **22.20 or newer**, and npm. Development and verification have
  been run with Node 22.20.0.
- A Neon PostgreSQL database with the project's schema and pgvector support.
  The current database client uses Neon's HTTP driver; pointing it at an ordinary
  local PostgreSQL server is not a drop-in replacement.
- Clerk publishable and secret keys from the same Clerk application.
- Internet access for the configured hosted services.

Gemini credentials enable AI search, and Cloudinary credentials enable image
uploads. These are optional at API startup; ordinary listing and filters can run
without Gemini, while uploads require Cloudinary configuration.

## Run the project locally

### 1. Get the code and install dependencies

```sh
git clone https://github.com/Surbhit-Nand/IS314-Computing-Project.git
cd IS314-Computing-Project/ARA_System
npm ci
```

If you already have the repository, open a terminal in `ARA_System` and run
`npm ci`. There is one package installation for both frontend and backend; do not
run a separate install inside `server`.

### 2. Create your local environment files

Copy the templates only if your local files do not already exist. Keep any
existing credentials and settings.

**Windows PowerShell:**

```powershell
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
if (!(Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
```

**macOS/Linux:**

```sh
test -f .env.local || cp .env.example .env.local
test -f server/.env || cp server/.env.example server/.env
```

Set these frontend values in `ARA_System/.env.local`:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
VITE_API_URL=http://localhost:8787
```

Set these backend values in `ARA_System/server/.env`:

```dotenv
CLERK_SECRET_KEY=your_clerk_secret_key
DATABASE_URL=your_neon_postgresql_connection_string
API_PORT=8787
CLIENT_ORIGIN=http://localhost:5173
DEV_BYPASS_AUTH=false
```

Replace the placeholders with real development credentials. For AI search and
image uploads, also configure these backend values as needed:

```dotenv
GEMINI_API_KEY=your_gemini_api_key
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
AI_SEARCH_RESULT_LIMIT=10
AI_SEARCH_MIN_SIMILARITY=0.60
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

Never commit `.env.local` or `server/.env`. Only public frontend configuration
belongs in `VITE_*` variables: Vite includes those values in browser code. Keep
database passwords, Clerk secret keys, Gemini keys and Cloudinary secrets on the
backend.

The API loads `.env.local` before `server/.env`; a value already present in
`.env.local` takes precedence. Existing process environment variables take
precedence over both files. Check for duplicate values when troubleshooting.

### 3. Prepare the database

For the team development environment, obtain the correct database connection
string and confirm its migration state with the project maintainer. The database
is shared between branches, so coordinate schema changes before applying them.

Apply pending migrations to the intended development database before starting
the API:

```sh
npm run db:migrate
```

The migration runner uses `DATABASE_URL_UNPOOLED` when supplied, otherwise
`DATABASE_URL`. Both can be configured in `server/.env` for this command.

**Fresh database setup has a known prerequisite:** migration
`0021_remove_rapid_triage` intentionally requires an explicit, transaction-scoped
cleanup procedure. A newly provisioned database can stop at this migration,
even when there are no assessment rows. Follow the
[migration reconciliation notes](ARA_System/docs/kara-merge-migration-review.md)
and [cleanup procedure and record](ARA_System/server/src/db/migrations/0021_remove_rapid_triage.approval.md)
with the database maintainer. Do not delete migration history or remove the guard
to make startup pass. This cleanup was already applied to the team's recorded
development database.

Optional commands for a development database that needs reference/demo data:

```sh
npm run db:seed:breeds
npm run db:seed:animals
```

These commands write database records; they are not required on every startup.
Animals still need the normal clearance and publication workflow to appear in
public listings. To generate missing search vectors after configuring Gemini:

```sh
npm run ai:backfill
```

### 4. Start the backend

In a terminal opened in `ARA_System`:

```sh
npm run server:dev
```

The API runs at **http://localhost:8787**. Check
**http://localhost:8787/health**; a working server returns `{"status":"ok"}`.

### 5. Start the frontend

Keep the backend terminal open. In a **second terminal**, also in `ARA_System`:

```sh
npm run dev -- --port 5173 --strictPort
```

Open **http://localhost:5173**. Both processes must remain running:
`npm run dev` starts only the website, not the API.

Press `Ctrl+C` in each terminal to stop the project. Vite updates the frontend
while you edit. The backend command does not auto-reload; restart it after backend
changes. Restart the relevant process after editing environment settings.

## Useful commands

Run these from `ARA_System`:

| Command | Purpose |
|---|---|
| `npm run dev` | Start the frontend development server |
| `npm run server:dev` | Start the backend API |
| `npm run server:check` | Check backend TypeScript types |
| `npm run build` | Type-check and build the frontend into `dist/` |
| `npm run preview` | Preview the built frontend locally; the API is still separate |
| `npm run lint` | Run ESLint |
| `npm test` | Run the automated test suite |
| `npm run db:migrate` | Apply pending database migrations |
| `npm run ai:backfill` | Generate missing animal search embeddings |

Browser interaction tests use Chromium. Set `ANIMAL_TEST_BROWSER` and
`EMERGENCY_TEST_BROWSER` to its executable path if needed; these tests skip when
their configured browser is unavailable. The most recent feature verification
passed 548 tests, with no failures or skipped tests.

## Troubleshooting

| Problem | What to check |
|---|---|
| `package.json` cannot be found | Run npm commands inside `ARA_System`, not the repository root. |
| PowerShell blocks `npm.ps1` | Use `npm.cmd` in place of `npm`, for example `npm.cmd run server:dev`. |
| Website opens but animals/API requests fail | Start the backend, check `/health`, and confirm `VITE_API_URL` points to its port. |
| API reports missing Clerk or database configuration | Fill in `server/.env` and check for conflicting values in `.env.local`. |
| Clerk sign-in fails | Use matching frontend/backend keys from the same Clerk application and its configured local origin. |
| Signed-in account cannot access a staff page | Staff roles must be assigned through the project's Clerk configuration; signing up does not grant staff access. |
| Port 5173 or 8787 is already in use | Stop the earlier project process, or change the ports and matching `VITE_API_URL` / `CLIENT_ORIGIN` settings together. |
| Missing database column or relation | Confirm the correct database and migration state; consult the migration notes if the guarded cleanup stops migration. |
| No animals appear | Check that profiles are published and medically cleared, and are not adopted, closed or deleted. |
| AI search is unavailable | Check backend `GEMINI_API_KEY`, provider/network availability and the pgvector migration. Normal browsing remains available. |
| Image upload fails | Check all three Cloudinary settings on the backend. |

## More documentation

- [Application notes](ARA_System/README.md)
- [Architecture](ARA_System/ARCHITECTURE.md)
- [Backend and AI-search details](ARA_System/server/README.md)
- [Tag-priority search verification](ARA_System/docs/ai-tag-priority-search-report.md)
- [Spelling correction verification and limitations](ARA_System/docs/ai-search-spelling-report.md)
