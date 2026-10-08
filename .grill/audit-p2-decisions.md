# Grill: Audit fixes P2

Date: 2026-10-07

From `AUDIT_FIXES.md`, section P2. The owner asked for P2 to be started; no question was needed for the items
done here. Two items are left for the owner to decide (last section).

## Done

- **Calculations are append-only in the database** (migration `0036`, D28). A trigger refuses DELETE and TRUNCATE
  on `calculations` and `calculation_inputs`, and any UPDATE except the one the engine makes — retiring a
  calculation (`is_current` true → false) when a newer one replaces it. Same error code as the audit log's guard.
- **The five approved grid bills with no calculation row (20–21 Sept 2026, local data): cause found.** The factor
  versions those calculations used are gone as well, and the audit log shows a new grid, renewable or diesel
  factor created on almost every test run of those two days (each name carries a run id). The throw-away API test
  scripts of Phases 9–11, which were never committed, deleted the previous run's factor, its versions and the
  calculations that used it so that `factors.create` would accept the next one. **No application code deletes a
  calculation.** The committed end-to-end suite creates a factor only where none exists and deletes nothing. With
  the guard, that clean-up can no longer remove a calculation. The five local records are left as they are: local
  test data, already approved, and an Admin cannot recalculate an approved record by design.
- **Audit entries say where an action came from** (migration `0036`): `ip_address`, `user_agent`, `session_id`,
  filled in `writeAudit` from the current request when a person acted; null for system events, scripts and older
  entries. The session id is the Supabase sign-in session from the already-verified token. Shown in the Audit
  Trail's expanded row and in its CSV export. Locally the address is empty (no proxy sets `x-forwarded-for`).
- **The trail reads in true order**: `validation.completed` is now written before the record is queued, so the
  order is validated → calculated → `approval.submitted`.
- **Security headers** on every response (`next.config.ts`, a shared file — one `headers` block): `X-Frame-Options:
  DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS (two years), and a
  Content-Security-Policy of `frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`.
  - **The policy does not restrict scripts.** A script policy for Next.js needs a per-request nonce; a half-working
    one would break pages. Left as an open item.
  - **The policy is not applied under `/api`.** A header set in the config replaces a route's own, and the first
    version silently replaced the evidence route's stricter `sandbox` policy — caught by the new end-to-end check.
- **Evidence is re-checked when read**: the evidence route recomputes the SHA-256 of the stored bytes and refuses
  (409) a file that no longer matches the fingerprint recorded at upload.
- **Factor geography**: kept, as a disclosure. Since the P0-2 report, each factor's geography is printed beside its
  source in the methodology section. It is still not used to *choose* a factor — that would need a geography on
  each org unit and regional factors (CEA publishes one national grid figure), which nobody has asked for.

## Done on the owner's instruction ("do the remaining P2 items", 2026-10-07)

### Hierarchy levels are configuration (migration `0037`, D29, A25)

- **Levels are rows in `org_levels`** (code, label, position); `org_units.unit_type` references a level's code
  instead of being an enum. The seven existing levels are seeded with the same codes, so no org unit changed,
  and code written against the old column keeps working. The enum type is dropped.
- **An Admin adds a level after an existing one, renames one, or removes one no org unit uses** — a collapsed
  "Hierarchy levels" section on Admin → Organization, and three audited procedures (`org.manage`).
- **A level's code and position never change once it exists** (a database trigger holds this). Reordering would
  have to re-check every parent and child; placing a new level between two others covers the need without it.
  The position is a number, so a level fits between two others without renumbering.
- **`group` stays the root level**: it cannot be removed and nothing sorts before it. It is the one level the app
  knows by name (the Admin role is assigned there).
- **The hierarchy trigger of `0034` now compares positions** read from the table; the app's rules
  (`lib/org/rules.ts`) take the level list the server loaded instead of a constant.
- The Organization, Users, org-unit bulk import and Upload screens show the configured names. The Scope
  dashboards still print a branch's level code with underscores replaced — unchanged.
- Not built: reordering or merging levels; deleting a level that was ever used.

### Several evidence files per record (no migration; A25)

- **A supporting file can be added to an existing record**: two procedures (`documents.prepareSupporting`,
  `documents.completeSupporting`) in the same bytes-first pattern as an upload — signed URL, then the server
  re-reads the bytes, checks type and size, fingerprints them and links the document with `is_primary = false`.
  Audited as `document.attached` on the record.
- **Who:** whoever could have uploaded the record's own document — inside their scope, for an activity their
  role owns. **When:** until the record is approved or rejected; after that its evidence is closed.
- **A supporting file is evidence only.** OCR does not read it, no value comes from it, and nothing downstream
  changes: validation, calculation, consolidation and reports keep using the original document.
- The same file cannot be attached to a record twice. Supporting files count toward the upload rate limit.
- **Shown** as an "Evidence files" list on the verify screen and in the shared record drawer, with an "Add a
  supporting file" button when the viewer may add one; each file opens through the scope-checked evidence route.
- Not built: removing a supporting file (evidence is kept once recorded); attaching one to a record created from a
  multi-bill PDF works the same way but was not separately tested.

## Open items recorded

- A script-restricting Content-Security-Policy with nonces.
- The audit log's address column depends on the host's proxy header (`x-forwarded-for`); check it after deployment.
