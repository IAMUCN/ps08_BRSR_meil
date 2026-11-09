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

## 2. Using it

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

## 3. What is not done (decisions for the owner)

- **The app still points at hosted by default.** Switching `.env.local` (or Vercel) to the local server is the
  owner's step. Until then hosted and the local server are two copies; whichever is used from now on becomes the
  real one. Run `verify` just before switching to be sure they still match.
- **Keys:** the local server uses the Supabase CLI's demo keys and JWT secret, which are public. That is fine on
  `127.0.0.1`. **Before anyone else can reach this server over a network**, give it its own JWT secret and keys
  (config `auth.jwt_secret` and regenerated keys) and a strong database password.
- **OCR on the local server** needs a worker container pointed at it. Run a second container from
  `traceesg-ocr-worker:latest` with `DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:54422/postgres`,
  `NEXT_PUBLIC_SUPABASE_URL=http://host.docker.internal:54421` and the local service key. Do not point the hosted
  worker at it.
- **Email** from the local server's own Auth goes to its mail catcher (`http://127.0.0.1:54424`). The app's own
  email (invitations, reminders) goes through Brevo when its settings are present.
- **Hosted** is now the reset copy. Its full previous state is in the backup folder above (database dump, sign-in
  accounts and every file).
