# ps08_BRSR_meil

**TraceESG** — an evidence-first ESG/BRSR reporting platform (PS-08). Users upload source documents; the
system extracts, verifies, validates, calculates and maps them to BRSR, with full lineage back to the
original evidence.

> **Status:** Phases 1–4 of `ps_documents/implementation_docs/06_IMPLEMENTATION_PLAN.md` — project setup,
> database schema with RLS, authentication/authorization, and the Admin foundation (organization
> hierarchy, users and assignments, roles and permissions, reporting periods, profile). No ESG workflows
> (upload, OCR, calculation, reporting) are implemented yet; dashboard KPIs are labeled development
> placeholders until Phase 16. See [`PROGRESS.md`](PROGRESS.md) for the full context, progress and next steps.

## Repository layout

```
apps/web/            Next.js app (frontend + backend logic)           — TypeScript
apps/ocr-worker/     OCR worker (PaddleOCR)                           — Python 3.12
packages/shared-types/  Types shared across TS code
supabase/migrations/ SQL migrations (schema, RLS policies)
ps_documents/        Project documentation only — no application code
```

All design and build decisions come from the documents in `ps_documents/implementation_docs/`
(Master Approach → PRD → TRD → App Flow → UI/UX Brief → Backend Schema → Implementation Plan).

## Prerequisites

- **Node.js** 22.18 or newer (developed on Node 24) — needed to run the TypeScript tests and scripts natively
- **pnpm** 12.4.2 — pinned via `packageManager`. Run `corepack enable` once (Corepack ships with Node) so a
  plain `pnpm` command is on your PATH; the root scripts call `pnpm` internally, so they need it.
- **Python 3.12** for the OCR worker — PaddlePaddle does **not** publish wheels for Python 3.14

## Web app (`apps/web`)

```bash
# from the repository root
pnpm install                                   # install all workspace dependencies
cp apps/web/.env.example apps/web/.env.local   # then fill in values (never commit them)
pnpm dev                                       # start the dev server at http://localhost:3000
```

For local development, fill `apps/web/.env.local` from the local Supabase stack
(`pnpm exec supabase status -o env`): `NEXT_PUBLIC_SUPABASE_URL` ← `API_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` ← `ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ← `SERVICE_ROLE_KEY`,
`DATABASE_URL` ← `DB_URL`. Use `http://localhost:3000` (not `127.0.0.1`) so auth cookies and email links match.

Root commands:

| Command | What it does | Without `corepack enable` |
|---|---|---|
| `pnpm dev` | Dev server for `apps/web` | `corepack pnpm --filter web dev` |
| `pnpm lint` | ESLint across the workspace | `corepack pnpm -r lint` |
| `pnpm typecheck` | TypeScript checks across the workspace | `corepack pnpm -r typecheck` |
| `pnpm test` | Unit tests (Node's built-in test runner) | `corepack pnpm -r test` |
| `pnpm format` / `pnpm format:check` | Prettier write / check for `apps/web` | `corepack pnpm --filter web format:check` |
| `pnpm build` | Production build of `apps/web` | `corepack pnpm --filter web build` |

## Database (`supabase/`)

The schema from `05_BACKEND_SCHEMA.md` lives in `supabase/migrations/` (applied in numeric order).
Intentional differences from that document — notably **server-only writes** — are recorded in
[`supabase/SCHEMA_DEVIATIONS.md`](supabase/SCHEMA_DEVIATIONS.md). Read it before writing any code that
touches the database.

Local development runs a full Supabase stack in Docker (Docker Desktop must be running). The Supabase
CLI is pinned as a root dev dependency, so no global install is needed:

```bash
pnpm db:start   # start local Supabase; first run pulls Docker images
pnpm db:reset   # wipe the local database, re-apply all migrations + supabase/seed.sql
pnpm db:test    # run the database smoke tests (supabase/tests/database)
pnpm db:stop    # stop the local stack
```

To save memory you can skip services the database work doesn't need:

```bash
pnpm exec supabase start -x realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor
```

Notes:

- **Ports:** local Supabase uses `553xx` ports (API `55321`, Postgres `55322`, Studio `55323`) instead of
  the CLI default `543xx`, because Windows often reserves 53940–54439 (Hyper-V/WinNAT).
- **Seed data:** `supabase/seed.sql` holds local-only test data (a test hierarchy and an open reporting
  period). It is applied by `db reset`, never pushed to a hosted project.
- **Hosted project:** migrations are applied to the hosted development project (Mumbai) only as an
  explicit, reviewed step (`supabase login` → `supabase link` → `supabase db push`), never automatically.
- **Real data:** use **synthetic documents only until Phase 18** (audit and security hardening).

## Accounts and sign-in

- **No self sign-up.** Accounts are provisioned by an Admin only. Passwords need at least 12 characters.
- **First Admin / local development users** are created with the provisioning script, which sends an
  invite email (the user sets their own password — no password is ever passed on the command line):

  ```bash
  # first Admin (refused if an active Admin already exists)
  pnpm --filter web provision-user --email admin@example.com --name "Jane Admin" --role admin --org-code MEIL

  # any other role, attributed to an existing active Admin
  pnpm --filter web provision-user --email pm@example.com --name "Ravi PM" --role project_manager \
    --org-code PRJ-X --assigned-by admin@example.com
  ```

  It reads `apps/web/.env.local` by default. After `pnpm db:reset`, provision the users again.
- **Local emails** (invites, password resets) are caught by Mailpit at http://127.0.0.1:55324 — start the
  stack without excluding `mailpit`. Open the email there and follow the link.
- **Hosted project:** Supabase's built-in email service only delivers to members of the Supabase team.
  A custom SMTP provider (Resend, TRD §13) must be configured **before any non-team user is invited**.
- **After provisioning the first Admin**, manage everything else in the app under `/admin`: organization
  hierarchy, users (invite, assign roles, deactivate), roles and permissions, and reporting periods. The
  Admin role can only be assigned at the root (group) node, and the last active Admin cannot be removed.
- Route behavior and intentional differences from `03_APP_FLOW.md` are recorded in
  [`apps/web/APP_FLOW_DEVIATIONS.md`](apps/web/APP_FLOW_DEVIATIONS.md).

## OCR worker (`apps/ocr-worker`)

The worker's Python dependencies are listed in **`apps/ocr-worker/requirements.txt`** (PaddlePaddle +
PaddleOCR, pinned). Development tooling (Ruff) is in `requirements-dev.txt`.

### Using `requirements.txt`

1. Go to the worker folder:

   ```bash
   cd apps/ocr-worker
   ```

2. Create a virtual environment **with Python 3.12**:

   ```bash
   # Windows
   py -3.12 -m venv .venv

   # macOS / Linux
   python3.12 -m venv .venv
   ```

3. Activate it:

   ```bash
   # Windows (PowerShell)
   .venv\Scripts\Activate.ps1

   # Windows (Git Bash)
   source .venv/Scripts/activate

   # macOS / Linux
   source .venv/bin/activate
   ```

4. Install the dependencies from `requirements.txt` (and the dev tooling):

   ```bash
   python -m pip install --upgrade pip
   python -m pip install -r requirements.txt
   python -m pip install -r requirements-dev.txt
   ```

   This is a large download (PaddlePaddle, PaddleOCR and their dependencies). It installs the CPU build —
   no GPU is required.

5. Check the install:

   ```bash
   python -c "import paddle, paddleocr; print(paddle.__version__, paddleocr.__version__)"
   ruff check .
   ```

6. Copy `.env.example` to `.env` and fill in values (never commit them).

To add or upgrade a Python dependency, pin its exact version in `requirements.txt`, reinstall with step 4,
and commit the updated file. The `.venv/` folder is git-ignored and must never be committed.

OCR model weights are **not** part of `requirements.txt`; they are downloaded and baked into the worker
image in Phase 2B (TRD §10, §35).

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and push to `main`:
lint, typecheck, unit tests and format check for the web app, and Ruff for the OCR worker. Database tests
(`pnpm db:test`) run locally only for now. There is no deploy step yet.

## Secrets

Only variable **names** live in the repository (`.env.example` files, per TRD §33). Real `.env*` files are
git-ignored.

## License

See [LICENSE](LICENSE).
