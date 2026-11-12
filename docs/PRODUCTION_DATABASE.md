# Production database: connections and setup

feature_enhancement.md Phase 10, "Database connections for production" (owner's item of 2026-11-07). Owner's
decision of 2026-11-09: diagnose the transaction-pooler hang and write this runbook; the owner creates the
production project. Nothing here has been changed on hosted or on Vercel.

## 1. What was wrong

- The **session pooler** (port 5432) allows 15 clients, shared by the live site, every developer machine and
  the OCR worker. `EMAXCONNSESSION` appeared under normal use. Hosted (smallest compute) allows 60 database
  connections in all; Supabase recommends a pool of 24 there.
- On 2026-11-07, through the **transaction pooler** (port 6543), any query queued behind a busy connection
  never returned. This was the likely cause of the October report stall on Vercel. The app therefore stays on
  the session pooler, with a pool of 3 connections that close after 5 idle seconds on Vercel
  (`lib/pooler-url.ts`).

## 2. What the diagnosis found (2026-11-09)

`apps/web/scripts/pooler-check.mjs` sends 20 parallel read-only queries (`select pg_sleep(0.2)`) with the
app's own client settings, and a mix of transactions and plain reads like the report job. Each query has a
15-second limit.

| Where | App settings (5 connections) | 1 connection | No pipelining, no type fetch | 20 connections | Transactions beside reads |
|---|---|---|---|---|---|
| Hosted transaction pooler (6543) | 20/20 in 1.7 s | 20/20 in 6.8 s | 20/20 in 1.6 s | 20/20 in 0.7 s | 20/20 in 2.5 s |
| Hosted session pooler (5432) | 10/10 in 1.0 s | 10/10 in 3.8 s | 10/10 in 0.8 s | 10/10 in 0.6 s | — |
| Local Supavisor, transaction mode, pool of **3** | 20/20 in 1.1 s | 20/20 in 4.1 s | 20/20 in 1.0 s | 20/20 in 1.0 s | 20/20 in 1.1 s |

**The hang does not reproduce today**, from this machine, against hosted or against a local transaction
pooler deliberately given fewer server connections than the client opens. Queued queries wait and finish. Two
conclusions follow:

1. The app's client settings (postgres.js, `prepare: false`, up to 5 connections) work with the transaction
   pooler. Nothing in the app needs to change for it.
2. The cause on 2026-11-07 was outside the app. It may have been a Supavisor problem on Supabase's side that
   has since been fixed, or load from other clients at the time. **It is not proven gone.** Treat the move as
   something to verify on a preview deployment first.

## 3. Production setup (the owner's steps)

1. **Create a new Supabase project** for production (Mumbai, `ap-south-1`). Never connect a developer machine
   to it. Use the smallest compute size that allows the connections below (60 in all on the smallest).
2. **Apply the migrations** `0001` to the latest, in order, with `supabase db push --db-url <direct or session
   URL>`, from a clean checkout of the release commit. Check that the history lists every one.
3. **Auth settings** (dashboard): no sign-ups; passwords of 12 or more characters with upper case, lower case,
   a digit and a symbol; site URL and redirect URLs set to the production domain; SMTP set to Brevo (or the
   app's own mail; invitations come from the app).
4. **Storage**: the migrations create the private `evidence` and `reports` buckets. Check that both are
   private.
5. **Connections**
   - Web app on Vercel: start on the session pooler (`:5432`) with the pool settings the app already uses on
     Vercel. Then deploy a **preview** with `DATABASE_URL` on the transaction pooler (`:6543`). Run
     `node apps/web/scripts/pooler-check.mjs <6543 URL>`, generate a report and upload a document. Move
     production to `:6543` only if everything finishes.
   - OCR worker: the session pooler (`:5432`), one long-running connection.
   - `CHAT_DATABASE_URL` (if the chatbot is used): the `chat_reader` role through the session pooler.
   - Raise the pooler's pool size towards Supabase's recommendation (24 on the smallest compute) in the
     dashboard, leaving room for the worker and migrations.
6. **Secrets on Vercel**: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, both bucket names, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET` (16+ characters),
   the Brevo settings, `SENTRY_DSN`, and the NVIDIA settings if the chatbot is used. Never commit any of them.
7. **First Super Admin**: `pnpm --filter web provision-user` against production, once. Everyone else is
   invited from the app.
8. **Backups**: Supabase daily backups are on for paid plans; turn on point-in-time recovery if it is
   available. Also take a `pg_dump` before every migration (see `RELEASE.md`).

## 4. If the hang comes back

Run `pooler-check.mjs` against `:6543` at the time of the stall and note which configurations hang. Then:

- If even 20 connections hang, the problem is on the pooler's side: report it to Supabase support with the
  timestamps and keep the session pooler.
- If only the configurations with fewer connections than parallel queries hang, set the app's pool to the
  number of queries a page runs at once (`poolSettings` in `lib/pooler-url.ts`) for that deployment, and keep
  the session pooler until Supabase confirms a fix.
