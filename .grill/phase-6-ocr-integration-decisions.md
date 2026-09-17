# Grill: Phase 6 — OCR pipeline integration
Date: 2026-09-17

## Intent
Wire the Phase 2B worker to the Phase 5 upload flow and surface the result: real uploads reach
`completed` with no manual steps, the uploader is notified with a deep link, My Submissions shows OCR
status as badges (never a wait screen), and Admin can monitor and retry jobs.

## Constraints
- Database changes "none beyond Phase 2" — the one exception below is recorded as a schema deviation.
- No secrets in the repository or in chat. Deployment config lists variable names only; the owner enters
  values in the hosting platform.
- Verification itself is Phase 7; nothing in Phase 6 may look like a verification screen.
- Hosted Supabase and Render accounts are not available to the implementer.

## Key decisions
- Decision: the **worker** writes the outcome notification in the same transaction as the job result and
  its audit entry. Reason: TRD §28 — notifications come from the code that writes the audit event; never
  lost or duplicated. Alternative considered: a database trigger (hidden logic), or the web app detecting
  finished jobs while polling (only fires while someone has the app open). Extends D11 by one table.
- Decision: **one notification per outcome**, sent to the uploader (`documents.uploaded_by`):
  `verification_needed` (completed, nothing needs attention), `low_confidence` (completed, any found field
  below the threshold or a required field not found — "N fields need attention"), `ocr_failed` (permanent
  failure, with the reason). All deep-link to `/app/verify/{documentId}`. Transient retries and stale
  reclaims notify nobody. Alternative considered: always "ready" plus a second low-confidence
  notification; or no low-confidence type (PRD §32 requires it).
- Decision: **threshold seeded at 80** (percent, same scale as `ocr_fields.confidence`) by migration
  `0014`, which makes `org_settings.updated_by` nullable (null = system seed). Worker and app read the one
  configured value; Admin edits it in Settings later. Alternative considered: a code default in both
  languages. If the row is ever missing the worker treats every found field as needing attention
  (fail-safe, not a default).
- Decision: notifications store the **final** `/app/verify/{documentId}` path now; that route is a
  scope-checked page clearly labeled a development placeholder until Phase 7 (file, status, failure
  reason, field counts). Alternative considered: linking to My Submissions until Phase 7 (rows created now
  would keep the wrong target).
- Decision: **My Submissions** lists the user's own uploads (`submitted_by`) in the open period plus older
  records not yet approved/rejected. Tabs are App Flow's seven, with real counts: pending/processing jobs →
  Processing; OCR completed **or failed** → Needs Verification (failed rows carry an "Extraction failed"
  badge and reason, App Flow §4.5). Later-stage tabs are empty until their phases. Alternative considered:
  a separate Failed tab (not in App Flow); org-scope listing (Corporate ESG's cross-project view is later).
- Decision: **polling, no Realtime.** Bell polls every 30 s and on window focus; My Submissions and OCR
  Monitoring refresh every 15 s only while a job is pending/processing. Alternative considered: Supabase
  Realtime (extra service, currently excluded locally); manual refresh only.
- Decision: **worker health** = oldest pending job waiting more than 5 minutes → banner "OCR worker has not
  picked up jobs for X minutes". No heartbeat table. Alternative considered: heartbeat table (schema
  addition); last job activity (false alarms when idle).
- Decision: **Admin retry** only for `failed` jobs whose record is still `document_uploaded`: job →
  `pending`, `retry_count` 0, error/timestamps cleared, document → `uploaded`, audit `ocr.job_retried` with
  the previous error and attempts, one transaction. Alternative considered: keeping the attempt count
  (next transient error would fail immediately); allowing stuck `processing` jobs (the worker already
  reclaims them after 15 minutes).
- Decision: **confidence band** on OCR Monitoring = "Low confidence" / "Above threshold" using the same
  rule as the notification; the table also shows the lowest field confidence.
- Decision: **deployment** = `apps/ocr-worker/Dockerfile` (weights downloaded at build time, non-root,
  `python -m worker`) + `render.yaml` Blueprint (background worker, always-on plan, env vars `sync: false`).
  Proven by building and running the image against local Supabase. The owner performs the Render deploy
  and hosted migration push. Hosted `DATABASE_URL` should be Supabase's session pooler string (the direct
  connection is IPv6-only). Alternative considered: Railway config, Dockerfile only, deploying now.
- Decision: build a basic **`/app/notifications`** page (type filter, deep links, mark all read). Admin
  gets the bell dropdown only (App Flow: no separate Admin page).

## Surfaced assumptions
- Marking one's own notification read is not an audited business event (D4 already allows it directly).
- After upload the user now lands on My Submissions (A6 said Dashboard only because My Submissions
  didn't exist yet).
- The dashboard "Documents to verify" card becomes a real count linking to the Needs Verification tab;
  "Returned for correction" stays a placeholder until Phase 8.

## Open questions
- Render deploy and hosted `supabase db push` of `0001`–`0014` wait for the owner's accounts.

## Out of scope
- Email notifications (P1), Realtime, Submission History page, record detail view, Admin dashboard
  low-confidence card (Phase 16), Settings page for editing the threshold.
