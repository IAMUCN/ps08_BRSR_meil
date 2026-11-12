# Dump validation

How `database_dump.sql` was produced and checked, how to restore it, and its limits.

**Result: the dump restores cleanly into an empty Supabase database as one transaction, and the restored
schema matches the source object for object and grant for grant.** It is a **sanitised** dump (see
`DATABASE_DOCUMENTATION.md` section 7), not a complete copy.

File: `database_dump.sql`, 2.8 MB, SHA-256
`60234b73ab931fb52bbb2de29030fdbb9f0d9cf70b17baeb3414730b0bcd7fde` (as validated on 2026-11-05).

## 1. How it was produced

The live database was only read. Nothing was written to it at any step.

1. **Inspected** the hosted Supabase database (PostgreSQL 17.6): objects, row counts, which columns hold
   personal data, and the one reference out of the `public` schema (`users.id → auth.users.id`).
2. **Dumped** the `public` schema and its data with `pg_dump` 17.6 (the same version as the server), leaving
   out the rows of the six tables that hold secrets or private conversations.
3. **Restored** that into a throwaway local Supabase database (Docker, PostgreSQL 17.6, no migrations) and
   **pseudonymised** it there (section 4 of the documentation).
4. **Dumped** the pseudonymised copy, took the privilege statements from the source's own dump (so that the
   copy carries exactly the source's grants), and assembled the final file.
5. **Restored** the final file into a second, empty Supabase database and compared it with the source.
6. **Deleted** the throwaway databases and the raw intermediate copy.

## 2. Checks and results

Restore into an empty Supabase database (local `supabase start`, PostgreSQL 17.6, no migrations), as the
ordinary `postgres` user, with `psql -v ON_ERROR_STOP=1`:

| Check | Result |
|---|---|
| Restore completes | Yes: exit 0, no errors, no warnings, under one second |
| Runs as one transaction | Yes: an earlier draft failed on one statement and left nothing behind |
| All foreign keys valid | Yes: all 92 created and validated after the data was loaded |
| Users without a sign-in row | 0 |

Restored schema compared with the source database:

| Object | Source | Restored |
|---|---|---|
| Tables | 50 | 50 |
| Views | 4 | 4 |
| Enum types | 26 | 26 |
| Functions | 21 | 21 |
| Triggers | 24 | 24 |
| Indexes | 149 | 149 |
| Primary keys | 50 | 50 |
| Foreign keys | 92 | 92 |
| Unique constraints | 23 | 23 |
| Check constraints | 37 | 37 |
| Row-level security policies | 51 | 51 |
| Tables with row-level security on | 50 | 50 |
| Table privileges | 805 | 805 |
| Grants (table, function, sequence; compared one by one) | 453 | 453, identical |
| Storage buckets | 2 | 2 |
| Scheduled jobs | 1 | 1 |

Data: the row count of every one of the 50 tables equals the pseudonymised copy's. Against the source, the
counts are the same except the six tables left empty on purpose.

Behaviour on the restored database (each change rolled back):

| Check | Result |
|---|---|
| Updating an audit entry | Refused: "audit_logs is append-only" |
| Deleting a calculation | Refused: "calculations is append-only" |
| `anon` reading `users` | Refused: permission denied |
| `authenticated` inserting an org unit | Refused: permission denied |
| `chat_reader` reading org units / users | 13 rows / permission denied |
| A third Super Admin | Refused: "At most 2 Super Admins are allowed" |
| Roll-up views | `consolidation_records` 211 rows, `org_unit_tree` 32 rows |
| Period-closing function | Runs |

Privacy, checked by searching the final file for every original value read from the source:

| Searched for | Found |
|---|---|
| 35 original email addresses (profiles and sign-in accounts) | 0 |
| 31 original employee ids | 0 |
| 27 original IP addresses | 0 |
| Invitation and reset-code hashes | 0 |
| Chat message text | 0 |
| Any email not on `example.invalid` | 0 |
| Database host name, project reference | 0 |
| JWTs, connection strings, API key prefixes, private keys, password hashes | 0 |
| 30 original display names | 1, a false positive: one test account was named "Super Admin", which is also the role's own name in `roles` |
| Original browser strings | 1, a false positive: scripts recorded "node", which also appears in two permission descriptions |

## 3. How to restore

The dump needs a **Supabase** database, because the schema uses Supabase's `auth.users` table and
`auth.uid()` function, its `storage.buckets` table, the `anon`, `authenticated` and `service_role` roles, and
`pg_cron`. It also creates the `chat_reader` role, so the user running it needs permission to create roles
(the `postgres` user on Supabase has it).

**Local (Supabase CLI and Docker):**

```bash
mkdir restore && cd restore
npx supabase init                      # an empty project: no migrations, no seed
npx supabase start
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f database_dump.sql
```

**A new hosted Supabase project:** use the connection string from the dashboard (Project Settings → Database)
in place of the local one. Restore into a **new, empty** project.

**Plain PostgreSQL** (not Supabase): first create the roles `anon`, `authenticated` and `service_role`, an
`auth` schema with a `users` table (`id uuid primary key`, `instance_id uuid`, `aud`, `role`, `email` text,
`created_at`, `updated_at` timestamptz) and an `auth.uid()` function, a `storage.buckets` table, and install
the `pg_cron` extension. This route was not tested.

Quick check after restoring:

```sql
select count(*) from pg_tables where schemaname = 'public';   -- 50
select count(*) from public.esg_records;                       -- 72
select count(*) from public.audit_logs;                        -- 1277
```

## 4. Limitations

- **Sanitised, not complete.** Personal data is pseudonymised and six tables are empty. People's names in the
  data are `User 001` and so on, and nobody can sign in: the placeholder accounts have no passwords.
- **No files.** The 94 uploaded evidence documents and generated report PDFs live in Supabase Storage, not in
  the database. Their database rows (paths, file names, SHA-256 fingerprints) are included; the files are
  not, so the evidence viewer and report downloads find nothing.
- **A snapshot of a live database**, taken on 2026-11-05. It is a development and demonstration database:
  test accounts, synthetic test documents, and configuration built for testing.
- **Restore into an empty database only.** Running it into a database that already has these tables fails
  on the first `CREATE`, and nothing is applied.
- **Supabase's platform default privileges for objects created by `supabase_admin`** were removed from the
  file: an ordinary `postgres` user is not allowed to set them, and they are not part of the application.
- **Storage bucket rows** carry only the columns every Supabase version has (id, name, public, size limit,
  allowed types), because the hosted platform's table has newer columns than older local versions.
- **Not tested:** a restore into a hosted Supabase project and into plain PostgreSQL; the application itself
  running against the restored copy.
