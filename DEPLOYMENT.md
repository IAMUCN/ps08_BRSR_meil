# Deploying the web app to Vercel

Written from a deployment check on 2026-10-12; updated for the final submission on 2026-11-13 (section 0). The web app (`apps/web`) goes to Vercel. The OCR worker does
not: it is a long-running process and stays on its own host (today a Docker container on the owner's machine).
Nothing here has been tried on Vercel yet — the first deployment is the test, and the last section says what to
try on it.

## 0. Before the final deploy (2026-11-13) — do these in order

1. **Hosted migrations.** Checked 2026-11-13: the hosted history is at `0088`. `0078` (travel as distance ×
   passengers) is **missing**; `0068`–`0076` (Decision Center, pgvector) have their tables, extension and functions
   on hosted already but no history rows. `node "test data/_backup/hosted-0078.cjs" check` then `apply` records
   `0068`–`0076` without running them and runs `0078`, in one transaction. Apply it **just before** the new code goes
   live: the old code asks for one "quantity" field on travel uploads and stops accepting them once `0078` is in.
2. **OCR worker.** Rebuild `traceesg-ocr-worker` (`rules-18`), then recreate the hosted container from it (keep
   the old one stopped for rollback). Only after step 1.
3. **Supabase Authentication → Multi-Factor:** switch **TOTP** (enroll and verify) on. Two-step sign-in is required for
   every account (`AUTH_MFA_REQUIRED` is on unless it is set to `false`); with TOTP off in Supabase nobody can finish
   setup. Tell every user to have an authenticator app (Google Authenticator) ready.
4. **Vercel environment variables.** Fix names: the project has `CRON_KEY` (the code reads `CRON_SECRET`, 16+
   characters) and `NVDIA_NIM_BASE_URL` (misspelled; delete it). For Tracey on the local model set
   `OLLAMA_BASE_URL` (the ngrok address ending `/v1`) for **Production and Preview**, and `NVIDIA_NIM_MODEL`
   (for example `qwen2.5:7b`). `CHAT_DATABASE_URL` needs the `chat_reader` role with a password.
5. **Deploy Production** from `main` (the deployed project follows the MACRO72 repository: push `ucn` `main` there
   too), then work through section 5 below. A variable only reaches builds made after it was set.
6. **After deploy:** a Super Admin approves the nine calorific-value drafts; replace the labelled SAMPLE figures in
   the typed SEBI tables with real ones before any filing; the second Super Admin signs in and sets up their app.

## 1. What the check found

| Item | Result |
| --- | --- |
| Production build (`next build`, Next.js 16.3.8) | Passes |
| Report PDFs | **Fixed.** The headless browser's files (`@sparticuz/chromium/bin`, 67 MB) were not packaged with the functions, so every report would have failed on Vercel. `next.config.ts` now adds them to the two places a report can start from; checked in the build's file trace |
| Links in deadline emails | **Fixed.** They pointed at `http://localhost:3000` unless `NEXT_PUBLIC_APP_URL` was set; they now fall back to the Vercel project's production address |
| Region | `apps/web/vercel.json` pins functions to Mumbai (`bom1`), beside the Supabase project |
| Files written at run time | None (Vercel's file system is read-only outside `/tmp`) |
| Uploads | Go from the browser straight to Supabase Storage through a signed address, so Vercel's request-size limit does not apply |
| Secrets in the repository | None. `.env.local` and `.env.production.local` are git-ignored and are not deployed |
| Client address for rate limits | Read from `X-Forwarded-For`, which Vercel sets itself — the open audit item F-08 does not apply there |

## 2. Project settings on Vercel

- **Root Directory:** `apps/web`. Leave "Include files outside of the Root Directory" on: the app uses
  `packages/shared-types` and the lockfile at the repository root.
- **Framework preset:** Next.js. Build and install commands: defaults.
- **Node.js version:** 22.x or newer (`package.json` asks for 22.18 or later).
- **pnpm:** the repository pins `pnpm@12.4.2`. Add the environment variable `ENABLE_EXPERIMENTAL_COREPACK=1`
  so Vercel uses that version. If the install step fails on the pnpm version, that is where to look.
- **Fluid Compute:** on (the default for new projects). Generating a report and a chatbot answer can take
  longer than the 10 seconds a function gets without it.
- **Branch:** deploy `main` (everything is merged there).

## 3. Environment variables

Set for Production (and Preview if previews should work). Values come from `apps/web/.env.local`.

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Needed at build time: the build fails without them |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only |
| `SUPABASE_STORAGE_BUCKET_EVIDENCE` = `evidence`, `SUPABASE_STORAGE_BUCKET_REPORTS` = `reports` | |
| `DATABASE_URL` | Use Supabase's **session pooler, port 5432** — the app limits itself to 3 connections per Vercel instance and closes them when idle (`lib/pooler-url.ts`); the transaction pooler (6543) made queries hang when tried. The old advice was: The local file uses the session pooler (port 5432), which holds one connection per client and can run out when several functions run at once |
| `CHAT_DATABASE_URL`, `NVIDIA_NIM_MODEL`, and `NVIDIA_NIM_API_KEY` or `OLLAMA_BASE_URL` | Tracey, the chatbot; leave out to keep it off. `OLLAMA_BASE_URL` points at a local model through ngrok (`https://…ngrok-free.dev/v1`). Needs a build made after they are set. Same pooler note for `CHAT_DATABASE_URL` (user `chat_reader.<project ref>`) |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `BREVO_SMTP_LOGIN` | Email. Without them accounts are created but no invitation link is sent (send it later with Resend invitation). Do not set `EMAIL_SMTP_HOST` / `EMAIL_SMTP_PORT`: they are for a mail catcher on a developer's machine |
| `NEXT_PUBLIC_APP_URL` | Optional; set it when a custom domain is added (no trailing slash) |
| `SENTRY_DSN` | Optional |
| `CRON_SECRET` | 16+ characters; the daily reminder and alert job refuses every call without it |
| `AUTH_MFA_REQUIRED` | Leave unset (two-step sign-in required). `false` switches it off — tests only |
| `APP_TIME_ZONE` | Optional; default `Asia/Kolkata` |
| `ENABLE_EXPERIMENTAL_COREPACK` = `1` | See above |

**Do not set** `CHROMIUM_EXECUTABLE_PATH` (it is for a local browser; on Vercel it would point at nothing) or
`NEXT_DIST_DIR`.

## 4. Outside Vercel

- **Database migrations.** The hosted database history is at `0088` (see section 0 for the migrations still missing). A new migration goes there before the
  code that needs it is deployed.
- **OCR worker.** Uploads are read only while the worker container is running. With the web app on Vercel and
  the worker on a laptop, an upload made while the laptop is off waits in "Processing".
- **Supabase Auth → URL configuration.** Set the Site URL to the deployed address. Password rules there
  should match the app's (12 characters, upper, lower, number, symbol).
- **Rotate the database password** before going public (it was shared in chat earlier), then update
  `DATABASE_URL` everywhere, the worker included.
- **This is the development Supabase project.** It holds the August test run and 21 test accounts. Whether
  production is this project or a new one is still to be decided (`PROGRESS.md` §4).

## 5. Try these on the first deployment

1. Sign in, sign out, and a wrong password.
2. Upload a document and verify it (needs the worker running).
3. **Generate a report** and open the PDF: this is the path that could not be tried off Vercel. Check that
   the text is not boxes — the packaged browser has a small set of fonts.
4. **Open an evidence file larger than 5 MB** on the verify screen. The app sends evidence through a function,
   and Vercel limits some function responses to 4.5 MB; if a large file fails to show, that is the cause.
5. Download an evidence bundle from Reports.
6. Ask the chatbot a question, if it is switched on.
7. Invite a user and check the email arrives, with the right sender name.
