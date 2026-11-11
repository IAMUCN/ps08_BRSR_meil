# The local database server

feature_enhancement.md 1.1 / requirement 37. Owner's decisions of 2026-11-09: reset hosted down to the Super
Admins, the Administrators and the configuration, then move that database to this machine, in Docker.

## 1. What was done on 2026-11-09

1. **Backup of hosted** (`test data/_backup/hosted-reset.cjs backup`): the `public` schema with its data, the
   sign-in accounts, the storage metadata and all 95 stored files (20.9 MB), with SHA-256 checksums, in
   `test data/_backup/hosted-reset-2026-11-09/` (git-ignored). **Restore tested:** the dump was restored into a
   throwaway database and all 55 tables matched hosted row for row.
2. **Hosted reset** (`hosted-reset.cjs apply`, on the owner's "go"):
   - **Kept:** 7 people (2 Super Admins and 5 Administrators); the 6 org units they hold roles at and the units
     above them; all configuration (roles and permissions, activities, 31 factor versions, the BRSR questions and
     23 typed answers, settings, carbon-credit links).
   - **Removed:** 27 accounts and 7 org units; every record, document, stored file, OCR result, approval,
     calculation, report, notification, session, invitation, chat and reporting period; the 1,287 entries of the
     audit log. One audit entry (`platform.reset`) records the reset, what was kept and removed, and the backup's
     name.
   - The database part ran as one transaction. The audit log and calculations are append-only by design, so
     triggers were off for that transaction only. A check for dangling references ran before it committed.
   - **Every kept person was signed out** (sessions were removed). They sign in again with their own passwords.
3. **Local server** (`test data/_backup/local-server.cjs setup`, `load`, `verify`):
   - A separate Supabase stack on this machine: project `emeilsg_local_server` in
     `D:\Non Newtonian Things\emeilsg-local-server`, ports 544xx. The database is on `127.0.0.1:54422` and the API
     on `http://127.0.0.1:54421`.
   - It is kept apart from the test stack (553xx) that the test suites use and reset.
   - It has the same 62 migrations and no seed data. Hosted's `public` schema was copied into it with its grants,
     together with the 7 sign-in accounts and their password hashes.
   - **Verified against hosted:** 55 tables with identical rows; 37 table grants to the browser roles; row-level
     security on every table; 51 policies; the default grants; 29 functions; 26 triggers; both private buckets;
     the scheduled job that closes periods; 7 sign-in accounts, all with passwords.
   - The app's own procedures, run as a Super Admin against it, read 7 users, 6 org units, 31 factors and
     10 roles.

## 2. The switch (2026-11-09, owner's request)

- **The app now uses the local server** for its database, sign-in and file storage: `apps/web/.env.local` and
  `.env.production.local` were switched. Only the Supabase, database, bucket and chatbot settings changed; Brevo,
  NVIDIA, Chromium and the rest stayed. The hosted versions are in `.env.local.hosted-backup` and
  `.env.production.local.hosted-backup` (git-ignored). To go back, copy them over the switched files.
- **Sign-in uses the local server's own Auth service** (GoTrue in the `supabase_auth_emeilsg_local_server`
  container). It holds the 7 accounts with their password hashes, so everyone signs in with the password
  they had on hosted. Checked through the app: a wrong password for a kept Super Admin is refused as wrong
  credentials by the local service. Password resets and invitations are the app's own emails (Brevo); the
  local Auth's own emails, if any, go to its mail catcher at `http://127.0.0.1:54424`.
- **The chatbot** reads the local server through the `chat_reader` role, given its own random password
  (in `.env.local` only).
- **Docker holds two things:**
  - the local server, one Supabase project (`emeilsg_local_server`) of six containers: database, Auth,
    API gateway, REST, storage and mail catcher;
  - one OCR worker, `emeilsg-ocr-worker-local` (image `traceesg-ocr-worker:latest`, restart `unless-stopped`),
    reading the local server through `host.docker.internal`.
  The hosted worker `traceesg-ocr-worker-hosted` is **stopped, not deleted**: uploads on the hosted / Vercel
  site wait for OCR until `docker start traceesg-ocr-worker-hosted`. The old `traceesg-ocr-worker-hosted-rules13`
  container is still there, stopped.
- **Restart your dev server** (`pnpm dev`) so it reads the new settings. Everyone signs in again (a new
  sign-in service means new sessions).

## 3. Using it

| Task | Command (from the repository root unless stated) |
|---|---|
| Start the server | `npx supabase start --workdir "D:/Non Newtonian Things/emeilsg-local-server" -x studio,imgproxy,realtime,edge-runtime,logflare,vector,postgres-meta,supavisor` |
| Stop it (data kept) | `npx supabase stop --workdir "D:/Non Newtonian Things/emeilsg-local-server"` |
| Run the app against it | `pnpm --filter web dev:local-server`. It reads `apps/web/.env.localserver`, whose values override `.env.local`, which stays pointed at hosted. |
| Check it still matches hosted | `node "test data/_backup/local-server.cjs" verify` (read-only on both) |
| Back it up | `docker exec supabase_db_emeilsg_local_server pg_dump -U postgres -Fc -n public -f /tmp/backup.dump`, then `docker cp` the file out |

- **Never run `supabase db reset` against this folder.** It erases the data.
- **Memory:** this machine fits one stack beside the app. Stop the test stack (`npx supabase stop` in the
  repository) while the local server runs, and the other way round.

## 4. What is not done (decisions for the owner)

- **Vercel still points at hosted.** The deployed site is a separate app on a separate database now; the local
  server is reachable only from this machine.
- **Keys:** the local server uses the Supabase CLI's demo keys and JWT secret, which are public. That is fine on
  `127.0.0.1`. **Before anyone else can reach this server over a network**, give it its own JWT secret and keys
  (config `auth.jwt_secret` and regenerated keys) and a strong database password.
- **To recreate the local worker:** `docker run -d --name emeilsg-ocr-worker-local --restart unless-stopped
  --add-host=host.docker.internal:host-gateway --env-file <file> traceesg-ocr-worker:latest`, where the file
  (a `C:/` path) holds `DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:54422/postgres`,
  `NEXT_PUBLIC_SUPABASE_URL=http://host.docker.internal:54421`, the local service key and
  `SUPABASE_STORAGE_BUCKET_EVIDENCE=evidence`. Delete the file afterwards.
- **Email** from the local server's own Auth goes to its mail catcher (`http://127.0.0.1:54424`). The app's own
  email (invitations, reminders) goes through Brevo when its settings are present.
- **Hosted** is now the reset copy. Its full previous state is in the backup folder above (database dump, sign-in
  accounts and every file).

## 5. Hosted is primary again; local is an hourly copy (2026-11-11, owner's decision)

- **The app uses hosted Supabase** again: `apps/web/.env.local` and `.env.production.local` have the hosted
  database, sign-in, storage and chatbot settings (the local-server versions are saved as `*.localserver-backup`).
  Everything else in them (Brevo, NVIDIA, Chromium …) was kept. **Restart the dev server** (`pnpm dev`).
- **OCR:** the hosted worker `traceesg-ocr-worker-hosted` runs; the local worker `emeilsg-ocr-worker-local` is
  stopped (the local server takes no uploads now).
- **Before the switch** hosted was brought up to everything local had: migration `0066`, the 111 BRSR answers,
  July-September 2026 of the test data (loaded directly, without OCR) and the 18 closed months. A full backup of the
  local server as it was is in `test data/_backup/local-backup-2026-11-11/` (database dump of `public`, `auth`,
  `storage`, `supabase_migrations`, and a tar of the stored files). The owner's own October test uploads (local only)
  are saved in `test data/_backup/your-october-uploads/` to upload again on hosted.
- **The hourly copy:** the Windows task **"EmeilSG hosted to local sync"** runs
  `apps/web/scripts/sync-hosted-to-local.cmd` every hour. It makes the local server an exact copy of hosted, one way:
  the `public` data, the sign-in accounts and the storage metadata are replaced in one transaction; stored files that
  are new or changed are copied (a manifest remembers them). It refuses to write anywhere but this machine.
  - Log: `test data/_backup/sync-hosted-to-local.log`; last result: `sync-hosted-to-local.status.json`.
  - By hand: `node apps/web/scripts/sync-hosted-to-local.mjs` (from the repository, or `cd apps/web` first).
  - Needs Docker Desktop and the local server running, and this machine awake; a missed hour runs when it can.
  - **Do not write to the local server**: each copy replaces it. Use it to read, back up or fall back.
  - First runs: 144 s (all 1,191 files), then 14 s; 58 tables matched row for row.
- **To make local primary again**, stop the task (`Disable-ScheduledTask -TaskName "EmeilSG hosted to local sync"`),
  copy the `*.localserver-backup` files back over `.env.local` / `.env.production.local`, start the local worker and
  stop the hosted one.
