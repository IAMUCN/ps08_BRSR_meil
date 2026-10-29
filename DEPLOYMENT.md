# Deploying the web app to Vercel

Written from a deployment check on 2026-10-12. The web app (`apps/web`) goes to Vercel. The OCR worker does
not: it is a long-running process and stays on its own host (today a Docker container on the owner's machine).
Nothing here has been tried on Vercel yet — the first deployment is the test, and the last section says what to
try on it.

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
- **Branch:** deploy a branch that contains this change. `main` does not have it until
  `feature-employee-uploads` is merged.

## 3. Environment variables

Set for Production (and Preview if previews should work). Values come from `apps/web/.env.local`.

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Needed at build time: the build fails without them |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only |
| `SUPABASE_STORAGE_BUCKET_EVIDENCE` = `evidence`, `SUPABASE_STORAGE_BUCKET_REPORTS` = `reports` | |
| `DATABASE_URL` | Use Supabase's **transaction pooler, port 6543**. The local file uses the session pooler (port 5432), which holds one connection per client and can run out when several functions run at once |
| `CHAT_DATABASE_URL`, `NVIDIA_NIM_API_KEY`, `NVIDIA_NIM_MODEL` | The chatbot; leave all out to keep it off. Same pooler note for `CHAT_DATABASE_URL` (user `chat_reader.<project ref>`) |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `BREVO_SMTP_LOGIN` | Email. Without them accounts are created but no invitation link is sent (send it later with Resend invitation). Do not set `EMAIL_SMTP_HOST` / `EMAIL_SMTP_PORT`: they are for a mail catcher on a developer's machine |
| `NEXT_PUBLIC_APP_URL` | Optional; set it when a custom domain is added (no trailing slash) |
| `SENTRY_DSN` | Optional |
| `ENABLE_EXPERIMENTAL_COREPACK` = `1` | See above |

**Do not set** `CHROMIUM_EXECUTABLE_PATH` (it is for a local browser; on Vercel it would point at nothing) or
`NEXT_DIST_DIR`.

## 4. Outside Vercel

- **Database migrations.** The hosted database has all of `0001`–`0049`, recorded in its history (caught up
  by the owner on 2026-10-12; records, documents and users unchanged). A new migration goes there before the
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
