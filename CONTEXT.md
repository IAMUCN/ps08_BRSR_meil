# TraceESG (BRSR_MEIL) — Working context

The **live state** of the project: what is in flight, what is waiting on the owner, the machine and
infrastructure facts, how the owner works, and the traps already hit. Loaded automatically by `CLAUDE.md`, so
nobody has to re-explain it at the start of a session.

- [`PROGRESS.md`](PROGRESS.md) is the **history**: what each phase delivered, test results, open items.
- This file is the **now**: short, rewritten at the end of every session. If a fact here is also in
  `PROGRESS.md`, this file only points to it.
- Details of any decision live in `.grill/`; deviations from the specification in `supabase/SCHEMA_DEVIATIONS.md`
  and `apps/web/APP_FLOW_DEVIATIONS.md`.

_Last updated: 2026-10-05._

---

## 1. Where we are right now

- **Phases 1–20 are done and committed.** HEAD is `654d549` on `main`. **Phase 21 (Deployment) is next, but the
  owner has not yet said where anything is hosted** — do not start it or assume Render (the owner does not use it).
- **About 50 files are uncommitted** (see `git status`). They are three groups, all finished but not committed:
  1. *Out-of-sequence features the owner asked for directly* (2026-09-25 onward): bulk import of employees and
     org units, OTP password reset by email, password-composition policy with a live meter, the theme toggle in
     the top bar, migrations `0029`–`0031`. Decisions: `.grill/bulk-import-decisions.md`,
     `.grill/password-policy-decisions.md`, `.grill/theme-toggle-decisions.md`. **No test results were recorded
     for these** — run the usual checks (PROGRESS.md §6 rule 8) before committing them.
  2. *OCR rules for real Indian electricity (DISCOM) bills*: `EXTRACTOR_VERSION` `rules-5` to `rules-9`
     (2026-10-03 to 05, from a real TPCODL bill; decisions in `.grill/ocr-real-bills-decisions.md`). Consumption from
     "UNITS ADVANCED", billing period from the PREV/PRES meter-reading dates, unit kWh implied (confidence 60), the
     source = the utility name (TPCODL), and (`rules-9`) a water bill's "consumption" read as Water withdrawn with
     discharge left for the person to type. The owner confirmed the electricity fields on a real upload; the
     source and water rules are built and running but **not yet confirmed on a real upload** (no real water bill
     has been tried). `rules-10` adds classification keywords for `FUEL_INVOICE`.
  3. *A PDF with several bills* (2026-10-05, owner's request; `.grill/multi-bill-pdf-decisions.md`, D24, A23, migration
     `0032`, new dependency `pdf-lib`): upload one PDF, the OCR proposes the split, the uploader confirms on
     `/app/upload/split/[documentId]`, each kept bill becomes its own record. Tested end to end locally (full suite
     189/189, Edge 17/17, OCR harness 9/9, production build, database 164/164, web unit 78/78, worker unit 40/40) but **never run against the hosted
     project or on a real multi-bill PDF**. Also in this change: the e2e suite's passwords now meet the password
     policy, four stale database tests were updated, `E2E_ENV_FILE` and `NEXT_DIST_DIR` were added.
- **Commit only when the owner asks.** One phase at a time; stop and wait for the go-ahead.

## 2. Waiting on the owner (do not decide these alone)

| Question | Notes |
|---|---|
| Where to host the web app and the OCR worker | Vercel was planned for the web app. Worker needs a host with a long-running, always-on process (no sleeping tier), ~2 GB RAM, no web port. |
| Delete the other Docker images? | Kept for now: the Supabase local-stack images (`public.ecr.aws/supabase/*`, needed by `pnpm db:start`/`db:test`) and the other project's `suraksha-backend` and `postgres:15-alpine` (plus its stopped containers and `suraksha_postgres_data` volume). Removing them is the owner's call. |
| Push migrations `0029`–`0032` to the hosted Supabase project? | The web app points at the hosted project, which lacks them, so bulk import, OTP reset, the default theme **and multi-bill PDFs** cannot work there. Pushing is outward-facing: wait for the owner's go-ahead (`supabase db push --db-url`, direct connection). |
| Then recreate the hosted worker container from the new image | **Only after the push.** The new worker reads `documents.is_bundle`; before migration `0032` that fails *every* job on the hosted project. The running container (older image, no bundle code) is fine until then. |
| When to commit the uncommitted work | See §1. |
| Production Supabase: new project, or promote the dev one | PROGRESS.md §4. Must be decided explicitly. |

## 3. The owner and how they work

- **Solo owner/product lead**, not necessarily reading code; wants plain explanations and the answer first.
- **Tests with real documents** and reports what fails (e.g. a real electricity bill photo). Treat such a report as
  a bug to reproduce with the real worker, not a reason to guess.
- **Asks for features mid-session, outside the plan.** Record each one in `.grill/<topic>-decisions.md`, add a
  deviation entry (D/A numbers continue: next are **D24** and **A23**), and note it in PROGRESS.md.
- **Wants to be asked before a decision the documents don't settle**, and wants progress files kept current so
  sessions do not start cold (that is why this file exists).
- **Two roles work in parallel, each on their own branch** (from 2026-10-05; the previous work is committed on
  `main` and pushed): **feature** and **ui**. The rules for staying out of each other's way — lanes, migration
  numbers, who edits which docs, the shared hosted project — are in `CLAUDE.md`. This work so far is the **feature**
  role.
- **Does not use Render.** Do not recommend or configure it.
- Never print or commit secrets. The owner has pasted database passwords and API keys in chat before; the database
  password is still on the rotate list (PROGRESS.md §5).

## 4. Machine and environment

- **Windows 11**, Git Bash and PowerShell both available. Working directory `D:\Non Newtonian Things\BRSR_MEIL`.
- **Memory is tight (~12 GB machine, Docker Desktop capped at ~5.5 GB).** The dev server, local Supabase and the OCR
  worker together exhaust it. A sudden `cv2.error: Unknown C++ exception` or a container exiting with code 137 means
  out of memory, not a code bug — free memory and retry. Run one heavy thing at a time.
- **Local Supabase** (stopped at the end of the last session to save memory: `pnpm db:start`) on `553xx` ports (API 55321, Postgres 55322, Studio 55323, Mailpit 55324); web dev server on
  port 3000. Local users must be re-created after `pnpm db:reset`.
- **Hosted Supabase** `ps08_brsr_meil` (Mumbai, development only): migrations `0001`–`0028` pushed, **`0029`–`0032`
  not**. Auth settings, first Admin and the password rotation are still to do (PROGRESS.md §5).
- **Docker:** the only OCR image is `traceesg-ocr-worker:latest` (≈2.3 GB, models baked in, `rules-10`; the **running** container is still on `rules-9`, deliberately — see §2). The one OCR
  container, `traceesg-ocr-worker-hosted`, was recreated from it on 2026-10-04 and again for `rules-8` (restart `unless-stopped`, runs
  `python -m worker` as user `worker`, env = the four hosted Supabase settings, talks to the **hosted** project
  `qcobpqkmlojyznkefnpt`). Old test containers and the `phase6`/`hello-world` images were deleted. To recreate it again,
  rebuild the image, `docker rm -f` the container and `docker run -d --name traceesg-ocr-worker-hosted --restart
  unless-stopped --env-file <file with DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_STORAGE_BUCKET_EVIDENCE> traceesg-ocr-worker:latest` — take the values from `apps/ocr-worker/.env`, and
  delete the env file afterwards.
- **Env var names** (values are in git-ignored `apps/web/.env.local` and `apps/ocr-worker/.env`): the Supabase URL/keys,
  `DATABASE_URL`, the two storage bucket names, `CHROMIUM_EXECUTABLE_PATH` (locally Edge), `SENTRY_*`, and
  `BREVO_API_KEY` / `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` / optional `BREVO_SMTP_LOGIN`. **`BREVO_API_KEY` holds
  Brevo's *SMTP* key** (name is historical).

## 5. Traps already hit (read before touching the same area)

- **Rebuild and recreate after any OCR change.** A worker container keeps running its old image; extraction changes do
  nothing until `docker build -t traceesg-ocr-worker apps/ocr-worker` and the container is recreated. Check with
  `docker run --rm --entrypoint python <image> -c "from worker.extraction.profiles import EXTRACTOR_VERSION as v; print(v)"`.
  Bump `EXTRACTOR_VERSION` on every rule change. A build takes about 2–3 minutes (cached).
- **Which rules processed an upload:** `select model_version from ocr_jobs` ends in the extractor version (e.g. `…;rules-4`).
  On 2026-10-04 every hosted job still said `rules-4`, i.e. the old container was still running. The full OCR lines of
  every upload are kept in `ocr_extractions.raw_output`, so new rules can be replayed on a real upload without
  re-running OCR (`TextLine(text, score, box, page)` from `raw_output["lines"]` into `extract_fields`).
- **Running the worker code by hand:** from `apps/ocr-worker`, use `.venv/Scripts/python.exe` with `PYTHONPATH=.`
  (otherwise `No module named 'worker'`). Put throw-away probe scripts in the session scratchpad, not the repo.
- **Debug OCR on the real file, not on assumptions.** Dump the lines with their boxes and scores first; the
  failure is usually layout (labels and values in separate boxes that overlap by a few pixels, or a header lost to
  glare), not the model. Screenshots shared in chat are heavily downscaled — say so when testing on one.
- **Never guess a missing field** (Master Approach §12); a field that cannot be found is stored empty and the person
  fills it. Confidence means recognition score; do not invent numbers for it.
- **A worker newer than the database fails every job** (it reads columns from newer migrations). Push the migration
  first, then replace the worker container — never the other way round.
- **Testing against the local stack while `.env.local` names the hosted project:** the e2e suite refuses a non-local
  database, so give it a local env file (`E2E_ENV_FILE`, built from `supabase status -o env` plus the buckets; keep it
  out of the repo and never print it) and run a second app on another port with the same variables exported and
  `NEXT_DIST_DIR=.next-e2e` (so the owner's dev server on 3000 is untouched): `next dev -p 3100`. Next rewrites
  `apps/web/tsconfig.json` when `NEXT_DIST_DIR` is used — restore it with `git checkout apps/web/tsconfig.json`.
  Export the same env when running the OCR harness, since `apps/ocr-worker/.env` is the hosted one (real environment
  variables win over `.env`). The worker image used by the e2e suite is whatever `traceesg-ocr-worker` is tagged.
- **Sample-PDF generation and other child processes fail with exit 127 / `3221227274`** when free memory is under
  ~1 GB; stop Supabase Studio/Meta/Mailpit (`docker stop supabase_studio_BRSR_MEIL …`) and retry.
- **A puppeteer click on `button[type="submit"]` hits "Log out"** (the top bar has a submit button): click by label.
- **Prettier** runs for `apps/web` only (`pnpm format:check`); the repo root has none. Ruff covers the worker
  (`.venv/Scripts/python.exe -m ruff check . && … ruff format --check .`).
- **Audit log is append-only for every role**, tests and clean-up scripts included — they must not delete audit rows.
- **The end-to-end suite refuses any non-local database by design.** Running it against production needs a deliberate,
  reviewed switch.
- **Conversion factors:** none are seeded; every local factor is a labelled synthetic value. MEIL must enter real ones
  (with sources) at `/admin/conversion-factors` before emissions calculate.
- **`exceljs` is installed but unused** (only `xlsx` is imported); remove it when convenient.
- **Line endings:** git warns "LF will be replaced by CRLF" on this Windows checkout; harmless.
- **Long commands:** anything over 10 minutes is moved to the background by the tool; the output file path is given.

## 6. Quick commands

Full list in `README.md`. The ones used most:

| Task | Command |
|---|---|
| Install | `corepack enable` once, then `pnpm install` |
| Dev server | `pnpm dev` (port 3000) |
| Lint / types / unit tests / format / build | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`, `pnpm build` |
| Local database | `pnpm db:start`, `pnpm db:reset`, `pnpm db:test`, `pnpm db:stop` |
| Create a local user | `pnpm --filter web provision-user --email … --name … --role … --org-code …` |
| End-to-end suite | `pnpm --filter web test:e2e` (local only) |
| Worker unit tests | from `apps/ocr-worker`: `.venv/Scripts/python.exe -m unittest discover -s tests/unit -t .` |
| Worker, one pass over the local queue | from `apps/ocr-worker`: `PYTHONPATH=. .venv/Scripts/python.exe -m worker --once` |
| Worker image | `docker build -t traceesg-ocr-worker apps/ocr-worker` |

## 7. Before you say a change is done

Format check, lint, typecheck, unit tests, production build, database tests, an end-to-end API script and a real
browser check (PROGRESS.md §6 rule 8). For OCR work add: the worker unit tests, Ruff, and the real worker run on the
actual document. Say plainly which of these were **not** run.

## 8. End of every session — update this file

1. Change the _Last updated_ date.
2. §1: what is committed, what is not, what is half done.
3. §2: add new questions for the owner; remove the ones answered (and record the answer in `.grill/` or PROGRESS.md).
4. §3–§5: add any new preference, environment fact or trap learned this session; delete what is no longer true.
5. If a phase finished, also update `PROGRESS.md` as its last section says.

Keep it short. History belongs in `PROGRESS.md`, reasons in `.grill/`.
