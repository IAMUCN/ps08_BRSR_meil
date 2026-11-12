# ps08_BRSR_meil

**TraceESG** — an evidence-first ESG/BRSR reporting platform (PS-08). Users upload source documents; the
system extracts, verifies, validates, calculates and maps them to BRSR, with full lineage back to the
original evidence.

> **Status:** Phases 1–20 of `ps_documents/implementation_docs/06_IMPLEMENTATION_PLAN.md` — project setup,
> database schema with RLS, authentication/authorization, the Admin foundation (organization hierarchy,
> users and assignments, roles and permissions, reporting periods, profile), document upload, the OCR
> worker (Phase 2B) and its integration (Phase 6), OCR verification (Phase 7: document viewer beside the
> extracted fields, confidence guard rail, Confirm/Reject, manual-exception and re-upload paths) and the
> validation engine (Phase 8: six rule categories from configurable `validation_rules`, returns and
> re-verification, Admin Validation Queue, and a single approval step pulled forward from Phase 16) and the
> calculation engine (Phase 9: unit normalisation, versioned conversion factors, stored calculation
> traces, Conversion Factor Management), Scope 1 (Phase 10: diesel, petrol, CNG and LPG as configuration,
> the Scope 1 dashboard with drill-down to the original invoice), Scope 2 (Phase 11: grid and renewable
> electricity on the same framework) and the Scope 3 foundation (Phase 12: categories as configuration,
> waste and business travel live) and the role-specific modules (Phase 13: HR headcount by gender and
> training coverage, EHS water consumption, Procurement MSME share, Finance/CSR expenditure and fines — with
> `percentage` and `subtract` formulas derived from verified counts) and BRSR mapping (Phase 14: indicators
> from SEBI's BRSR format, `/admin/brsr-mapping` with a readiness tree down to the original document) and
> consolidation (Phase 15: roll-up views over the org tree, `consolidation.query` by period or financial
> year) and the Admin Control Tower (Phase 16: real KPIs and issue panel, Submission Monitoring, ESG Data
> Explorer, configurable expected submissions) and reporting (Phase 17: BRSR reports by period or financial
> year rendered to PDF, with every value drilling down to its original document) and audit and security
> hardening (Phase 18: the Audit Trail page, an append-only audit log, sign-in and upload rate limits, CSRF
> protection on tRPC — see [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md)) and UI polish (Phase 19: the per-user
> theme switcher on Profile, WCAG AA contrast in all three themes, the tablet icon-rail sidebar, loading
> skeletons and error/not-found states) and testing (Phase 20: a committed end-to-end suite, database tests in
> CI and [`QA_CHECKLIST.md`](QA_CHECKLIST.md)). See [`PROGRESS.md`](PROGRESS.md) for the full context, progress and next steps.

## Repository layout

```
apps/web/            Next.js app (frontend + backend logic)           — TypeScript
apps/ocr-worker/     OCR worker (PaddleOCR)                           — Python 3.12
packages/shared-types/  Types shared across TS code
supabase/migrations/ SQL migrations (schema, RLS policies)
ps_documents/        Project documentation only — no application code
```

Evidence files are served to the browser only through `/api/documents/[documentId]/file`, which
re-checks the session and the caller's organization scope on every request — the private bucket is never
exposed by a URL that works without a session.

All design and build decisions come from the documents in `ps_documents/implementation_docs/`
(Master Approach → PRD → TRD → App Flow → UI/UX Brief → Backend Schema → Implementation Plan).

## Prerequisites

- **Node.js** 22.18 or newer (developed on Node 24) — needed to run the TypeScript tests and scripts natively
- **pnpm** 12.4.2 — pinned via `packageManager`. Run `corepack enable` once (Corepack ships with Node) so a
  plain `pnpm` command is on your PATH; the root scripts call `pnpm` internally, so they need it.
- **Python 3.12** for the OCR worker — PaddlePaddle does **not** publish wheels for Python 3.14

## For collaborators — getting started

You need Node.js 22.18+ and, for a local database or OCR worker, Docker Desktop. No key or password is in this
repository; never commit one (see [Secrets](#secrets)). Work on your own branch (`ui/<topic>` or
`feature/<topic>`) and open a pull request — the rules are in `CLAUDE.md`.

### Option A — the shared hosted project (the owner's env files)

Use this when you need the shared data and real emails.

1. Get two files **privately from the owner** and put them at exactly these paths (both are git-ignored):

   | File            | Place it at               | Used by        |
   | --------------- | ------------------------- | -------------- |
   | web env file    | `apps/web/.env.local`     | the website    |
   | worker env file | `apps/ocr-worker/.env`    | the OCR worker |

2. In `apps/web/.env.local`, change `CHROMIUM_EXECUTABLE_PATH` to the Edge or Chrome on **your** machine
   (for example `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`); report PDFs fail otherwise.
3. Start the website:

   ```bash
   corepack enable     # once per machine
   pnpm install
   pnpm dev            # http://localhost:3000
   ```

4. Ask the owner for a login (accounts are created by an Admin; there is no sign-up).

While you use these files:

- **Do not start an OCR worker.** One worker already serves the hosted database; a second one competes for the
  same jobs. Your uploads are read by the owner's worker, and wait in "Processing" while it is off.
- **The data is shared.** What you upload, edit or delete is seen by everyone at once. Do not run
  `pnpm db:reset`, `supabase db push` or any script that writes to the database.
- **Emails are real** and are sent from the owner's Brevo account.
- **The files give full access** to the database and the stored evidence. Do not paste them into chat, email,
  screenshots or an issue, and delete them when your work is done.

### Option B — everything on your own machine

Use this for layout and styling work; it needs no key from anyone.

```bash
corepack enable
pnpm install
pnpm db:start                                   # local Supabase in Docker: migrations and seed data
pnpm exec supabase status -o env                # prints the local keys
cp apps/web/.env.example apps/web/.env.local    # fill it as described under "Web app" below
pnpm --filter web provision-user --email admin@example.com --name "Test Admin" --role admin --org-code MEIL
pnpm dev                                        # http://localhost:3000
```

Also set `SUPABASE_STORAGE_BUCKET_EVIDENCE=evidence`, `SUPABASE_STORAGE_BUCKET_REPORTS=reports` and
`CHROMIUM_EXECUTABLE_PATH`. Emails land in the local inbox at http://127.0.0.1:55324; Brevo is optional (without
it, password-reset codes and bulk-import emails are not sent). The database starts with the seed hierarchy only,
and emissions calculate once you enter factors at `/admin/conversion-factors`.

For your own OCR worker (optional — without it uploads stay in "Processing"), create
`apps/ocr-worker/.env.docker` (git-ignored):

```
NEXT_PUBLIC_SUPABASE_URL=http://host.docker.internal:55321
DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:55322/postgres
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from the status output>
SUPABASE_STORAGE_BUCKET_EVIDENCE=evidence
```

```bash
docker build -t traceesg-ocr-worker apps/ocr-worker     # about 2.3 GB; the models are downloaded at build time
docker run -d --name traceesg-ocr-worker-local --env-file apps/ocr-worker/.env.docker traceesg-ocr-worker:latest
```

The model runs on your CPU inside that container (about 2 GB of memory, roughly 10 seconds a page); nothing is
sent to an outside service.

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

### ESG data analyst (chatbot)

A read-only assistant behind the _Ask_ button; see [`CHATBOT.md`](CHATBOT.md) for how it works, what it
sends to the AI service and how to test it. It is off until `NVIDIA_NIM_API_KEY`, `NVIDIA_NIM_MODEL` and
`CHAT_DATABASE_URL` are set in `apps/web/.env.local`. Locally, after `pnpm db:reset`:
`CHAT_DATABASE_URL=postgresql://chat_reader:chat_reader_local@127.0.0.1:55322/postgres`.

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

To save memory you can skip services the app doesn't use yet. Keep `storage-api` running — document upload
needs it:

```bash
pnpm exec supabase start -x realtime,imgproxy,edge-runtime,logflare,vector,supavisor
```

Notes:

- **Ports:** local Supabase uses `553xx` ports (API `55321`, Postgres `55322`, Studio `55323`) instead of
  the CLI default `543xx`, because Windows often reserves 53940–54439 (Hyper-V/WinNAT).
- **Seed data:** `supabase/seed.sql` holds local-only test data (a test hierarchy and an open reporting
  period). It is applied by `db reset`, never pushed to a hosted project.
- **Hosted project:** migrations are applied to the hosted development project (Mumbai) only as an
  explicit, reviewed step (`supabase login` → `supabase link` → `supabase db push`), never automatically.
- **Real data:** use **synthetic documents only until Phase 18** (audit and security hardening).
- **Validation rules:** migration `0015` seeds the configured checks (`validation_rules`): allowed units per
  metric, quantity > 0, billing period in the reporting period, duplicate invoice numbers, duplicate grid
  bills per period, and the historical anomaly check (×2 of the median over 3+ prior periods). Check kinds
  live in `apps/web/lib/validation/checks.ts`; parameters and severity are data.
- **Records verified before Phase 8** can be validated once with `pnpm --filter web validate-pending`
  (runs the same engine as Confirm; records already validated are skipped).
- **Conversion factors are never seeded.** Migration `0016` seeds only the calculation formulas; the factor
  values are regulatory data an Admin enters at `/admin/conversion-factors` with the source they verified
  them against, including in a fresh local database (a factor version needs a `created_by` user, so
  `seed.sql` cannot create one). Until a factor exists, records validate and queue for approval but show
  "Not calculated yet" with the reason, and Approve stays disabled.
- **Records verified before Phase 9** can be calculated once with `pnpm --filter web calculate-pending`
  (same engine; records that already have a current calculation are skipped).
- **Conversion factor values may be zero** (market-based renewable electricity) but never negative, and
  every version records who entered it and the source it came from.
- **Evidence storage:** migration `0012` creates the private `evidence` bucket (50 MB, PDF/JPG/PNG). Set
  `SUPABASE_STORAGE_BUCKET_EVIDENCE=evidence` in `apps/web/.env.local`. Files are never publicly readable;
  uploads use single-use signed upload URLs issued by the server (Supabase's fixed two-hour lifetime).
- **The audit log is append-only** (migration `0027`): triggers refuse UPDATE, DELETE and TRUNCATE for
  every role, including the server's. Admins read it at `/admin/audit-trail`.
- **Report PDFs** (Phase 17): migration `0025` creates the private `reports` bucket. Set
  `SUPABASE_STORAGE_BUCKET_REPORTS=reports`, and locally `CHROMIUM_EXECUTABLE_PATH` to an installed
  Chromium-family browser (e.g. `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`); in
  production leave it unset and `@sparticuz/chromium` supplies the browser. Generation runs after the
  request (Next.js `after()`); a run stuck for 10 minutes is marked failed.

## Accounts and sign-in

- **No self sign-up.** Accounts are provisioned by an Admin only. Passwords need at least 12 characters,
  an uppercase and a lowercase letter, a number and a special character (`lib/auth/password-policy.ts`).
- **Rate limits** (Phase 18, `org_settings.rate_limits`): 5 failed sign-ins per account and 50 per client
  address per 15 minutes; 60 uploads per user per 10 minutes. Locally, clear the counters with
  `delete from public.rate_limit_events;` if a test run locks an account. On the hosted project, raise
  Supabase Auth's per-IP sign-in limit (it only sees the app server's address — `SECURITY_REVIEW.md` F8).
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
- **Local emails** are caught by Mailpit at http://127.0.0.1:55324 — start the stack without excluding
  `mailpit`. Supabase Auth's own email (the `provision-user` invite) arrives there by itself. The app's
  email (invitation links from Invite user and bulk import, reset codes, reminders) arrives there when
  `apps/web/.env.local` sets `EMAIL_SMTP_HOST=127.0.0.1` and `EMAIL_SMTP_PORT=55325`; without those and
  without the Brevo settings the account is still created and the screen says the email was not sent.
- **Hosted project:** Supabase's built-in email service only delivers to members of the Supabase team.
  A custom SMTP provider (Resend, TRD §13) must be configured **before any non-team user is invited**.
- **After provisioning the first Admin**, manage everything else in the app under `/admin`: organization
  hierarchy, users (invite, assign roles, deactivate), roles and permissions, and reporting periods. The
  Admin role can only be assigned at the root (group) node, and the last active Admin cannot be removed.
- Route behavior and intentional differences from `03_APP_FLOW.md` are recorded in
  [`apps/web/APP_FLOW_DEVIATIONS.md`](apps/web/APP_FLOW_DEVIATIONS.md).

## OCR worker (`apps/ocr-worker`)

A standalone Python process that picks up pending OCR jobs, reads the evidence file from private Storage,
runs PaddleOCR (PP-OCRv5 mobile, English, CPU) and writes confidence-scored field extractions back. It
**extracts only** — nothing is verified, validated or calculated by the worker. It talks to the app only
through the shared database and Storage (TRD §22). Decisions: `.grill/phase-2b-ocr-worker-decisions.md`.

The worker's Python dependencies are listed in **`apps/ocr-worker/requirements.txt`** (PaddlePaddle,
PaddleOCR, psycopg, sentry-sdk — pinned). Development tooling (Ruff) is in `requirements-dev.txt`.

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

### Model weights, running and testing

OCR model weights are **not** part of `requirements.txt` or git. Download them once from the Hugging Face
Hub into `OCR_MODEL_PATH` (default `apps/ocr-worker/models/`, git-ignored); the worker never downloads
models at runtime (TRD §35):

```bash
python scripts/download_models.py
```

For local development, fill `.env` from `apps/web/.env.local` (`NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET_EVIDENCE`, `DATABASE_URL`). Then, with local Supabase
running:

```bash
python -m worker          # poll for jobs forever (Ctrl+C stops after the current job)
python -m worker --once   # process every waiting job, then exit

python -m unittest discover -s tests/unit -t .          # extraction rules (no Paddle needed; runs in CI)
python -m unittest discover -s tests/integration -t .   # full harness: real OCR on generated synthetic
                                                        # documents against local Supabase (~1.5 min)
```

Notes:

- **Which fields** are extracted comes from `metric_field_requirements`; **how** they are found (label
  synonyms, value patterns) is in `worker/extraction/profiles.py`. Bump `EXTRACTOR_VERSION` when a rule
  changes — it is stored with every extraction.
- Failures: unreadable or empty files fail immediately with a user-readable reason; storage, database and
  model errors retry up to 3 attempts; a job stuck in `processing` for 15 minutes is reclaimed.
- Logs are JSON lines on stdout; errors go to Sentry when `SENTRY_DSN` is set.
- PaddlePaddle 3.3.1's oneDNN (MKLDNN) path fails on these models, so it is disabled; the detector input is
  capped at 1600 px to bound memory and CPU time (about 10 s per A4 page on a laptop CPU).
- **A PDF with several bills** (`documents.is_bundle`, migration `0032`): the worker reads every page (up to 50)
  and stores a *proposed* split — which pages are one bill, what each is, the activity when it can tell — and
  notifies the uploader; it creates no record. The uploader confirms or edits it on `/app/upload/split/…`, and each
  kept bill is then cut out as its own PDF and recorded like a single upload. A worker newer than the database
  fails every job, so push the migration before replacing a hosted worker container.
  `scripts/make_sample_bundle.py --kinds electricity,diesel,water --out bundle.pdf` writes a test bundle.
- Test documents are generated synthetically at test time (`tests/samples.py`) — no real MEIL documents
  until Phase 18. For a manual upload, `.venv/Scripts/python scripts/make_sample_invoice.py --out x.pdf`
  writes a diesel invoice with a unique invoice number (`--invoice` to choose one, `--kind electricity`,
  `--kind waste` or `--kind travel` for the other document types; `--kind workforce`, `training`, `water`,
  `procurement`, `csr` or `penalty` for the Phase 13 modules — the workforce statement's "Men" count is
  deliberately smudged so OCR reads it below the confidence threshold).
- When a job finishes, the worker notifies the uploader in the same transaction (`verification_needed`,
  `low_confidence` when a found field is below `org_settings.ocr_confidence_threshold` — seeded at 80 — or a
  required field is missing, or `ocr_failed` with the reason).

### Deployment (Docker)

`apps/ocr-worker/Dockerfile` builds the worker with the model weights baked in (downloaded at build time,
never at runtime). It holds no secrets; configure it through environment variables only.

```bash
docker build -t traceesg-ocr-worker apps/ocr-worker
# local check against local Supabase (.env.docker is git-ignored; fill it like .env)
docker run --rm --env-file apps/ocr-worker/.env.docker traceesg-ocr-worker python -m worker --once
```

For a container talking to local Supabase use `http://host.docker.internal:55321` and
`postgresql://postgres:postgres@host.docker.internal:55322/postgres`.

The worker's host is not chosen yet. It needs an always-on **background process** (no web port, about 2 GB RAM,
no sleeping tier). `render.yaml` (repository root) is kept only as a reference for those settings — Render is
not used. Whatever the host, set these there, never in the repository:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | the Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | the project's service-role key (server-only; never in the web client bundle) |
| `DATABASE_URL` | Supabase **Session pooler** connection string (the direct connection is IPv6-only) |
| `SENTRY_DSN` | optional |

Push the database migrations to the same Supabase project first (`supabase link` → `supabase db push`).

## Testing

| Suite | Command | Needs |
|---|---|---|
| Web unit tests | `pnpm test` | nothing |
| Database (pgTAP: schema, RLS, grants, triggers) | `pnpm db:test` | local Supabase |
| OCR extraction rules | `python -m unittest discover -s tests/unit -t .` (in `apps/ocr-worker`) | nothing |
| OCR integration harness | `python -m unittest discover -s tests/integration -t .` (in `apps/ocr-worker`) | local Supabase, models |
| End to end | `pnpm --filter web test:e2e` (or name scripts: `… test:e2e authorization`) | see below |

**End-to-end suite** (`apps/web/tests/e2e/`): the plan's critical Scenarios A–D (diesel, electricity, HR with a
low-confidence field, the consolidated report down to each original document), Scenario E (one PDF of several
bills, split and recorded separately), authorization boundaries
through the app and straight at the database API, and the edge cases — real sessions, real procedures, real
uploads and the real OCR worker, synthetic documents only. It needs local Supabase, the app running
(`pnpm --filter web build && pnpm --filter web start`), the worker image
(`docker build -t traceesg-ocr-worker apps/ocr-worker`, or `E2E_WORKER=local` to use the venv) and the worker's
venv for generating documents. `E2E_ENV_FILE=<file>` points it (and the worker it starts) at a local-only env file when
`.env.local` names a hosted project. It provisions its own `e2e.*@traceesg.test` accounts with fresh random
passwords each run and enters clearly labelled synthetic conversion factors only where none exist; it refuses
to run unless `DATABASE_URL` is local. It runs on a freshly reset database or an existing one.

Manual checks and their results are recorded in [`QA_CHECKLIST.md`](QA_CHECKLIST.md).

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and push to `main`:
lint, typecheck, unit tests and format check for the web app; the database tests against a fresh local
Supabase (every migration and the seed applied, then `pnpm db:test`); and Ruff plus the extraction unit tests
for the OCR worker. The end-to-end suite and the OCR harness run locally. There is no deploy step yet.

## Secrets

Only variable **names** live in the repository (`.env.example` files, per TRD §33). Real `.env*` files are
git-ignored.

## License

See [LICENSE](LICENSE).
