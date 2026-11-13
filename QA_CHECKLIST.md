# EmeilSG — QA checklist (Phase 20)

_Run on 2026-09-22 against a local stack (production build of `apps/web`, local Supabase, the
`traceesg-ocr-worker` image, Edge). Synthetic documents only — accuracy on real MEIL documents is untested
until samples are provided. Decisions: `.grill/phase-20-testing-decisions.md`._

**How to re-run.** Automated checks: `pnpm --filter web test` (unit), `pnpm db:test` (database, also in CI),
`pnpm --filter web test:e2e` (end to end, see README → Testing), `python -m unittest discover -s tests/unit`
and `-s tests/integration` in `apps/ocr-worker`. Rows marked **manual** were run by hand or with a local
browser script and are recorded here with what was observed.

Legend: **Pass** — behaves as the documents specify. **Pass (note)** — passes, with a limitation stated.

## 1. Critical end-to-end scenarios (plan §4)

| Scenario                                     | Expected                                                                                                                                                  | How verified                                                         | Result                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------ |
| A — Scope 1 diesel                           | PM uploads → OCR → verify (with an edit) → validate → factor applied → approve → Admin drills MEIL › Subsidiary A › Project X › record › original invoice | `e2e/scenario-a-scope1` (18 checks), byte-for-byte evidence download | Pass                     |
| B — Scope 2 electricity                      | Same shape with a bill; a second bill in a month is flagged for an Admin; renewable calculates to 0                                                       | `e2e/scenario-b-scope2` (16)                                         | Pass                     |
| C — HR with a genuinely low-confidence field | Confirm refused until "Men" is reviewed; % women derived from verified counts; Admin sees inputs and formula                                              | `e2e/scenario-c-hr` (18–20)                                          | Pass                     |
| D — Consolidated report                      | Report covers A–C, consolidated across the hierarchy, BRSR-mapped, each value drills to its document                                                      | `e2e/scenario-d-report` (21)                                         | Pass                     |
| All four on a **freshly reset** database     | The suite provisions its own users and labelled synthetic factors                                                                                         | `pnpm db:reset` then the full suite, then again on the same data     | Pass (149 checks, twice) |

## 2. Edge cases (plan §6)

| Edge case                      | Expected behavior                                                                                                                           | How verified                                                              | Result               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------- |
| Invalid file                   | Refused with "Invalid file type — upload a PDF, JPG or PNG"; a renamed non-PDF is caught by its bytes                                       | `e2e/edge-cases`                                                          | Pass                 |
| Oversized file                 | Refused before upload, naming the 50 MB limit and what to do                                                                                | `e2e/edge-cases`                                                          | Pass                 |
| Corrupted file                 | Truncated → "looks damaged or incomplete"; password-protected → "upload a copy without a password"; no record created                       | `e2e/edge-cases`; worker backstop in the OCR harness                      | Pass                 |
| Unreadable scan                | OCR job fails with a reason; uploader notified                                                                                              | `e2e/edge-cases`; OCR harness (blank, corrupted, missing files)           | Pass                 |
| OCR failure → manual exception | Values typed by hand with a justification are accepted and always flagged for review                                                        | `e2e/edge-cases`                                                          | Pass                 |
| Low OCR confidence             | Confirm blocked until the field is edited or marked correct, on the server too                                                              | `e2e/scenario-c-hr`; Phase 7 browser checks                               | Pass                 |
| Missing field                  | Left empty (never guessed); Confirm waits until filled                                                                                      | `e2e/edge-cases` (a reference OCR can't read, and a cleared value)        | Pass — see finding 1 |
| Wrong document type            | The user is asked to choose; Confirm refused until chosen                                                                                   | `e2e/edge-cases`                                                          | Pass                 |
| User edits OCR result          | Verified value stored beside the untouched extracted value                                                                                  | `e2e/scenario-a-scope1`                                                   | Pass                 |
| Duplicate document             | Same file asks for acknowledgement; if acknowledged, the record is marked                                                                   | `e2e/edge-cases`                                                          | Pass                 |
| Duplicate invoice              | Flagged (not failed), duplicate flag set                                                                                                    | `e2e/edge-cases`                                                          | Pass                 |
| Duplicate reporting period     | A second period with the same label is refused; a second grid bill in a month is flagged                                                    | `e2e/edge-cases`, `e2e/scenario-b-scope2`; DB test (one open period)      | Pass                 |
| Invalid unit                   | Validation fails; returned to the submitter with the reason                                                                                 | `e2e/edge-cases`; unit tests (normalisation)                              | Pass                 |
| Invalid date                   | Outside the period → failed; unreadable → flagged for a person                                                                              | `e2e/edge-cases`                                                          | Pass                 |
| Anomalous quantity             | 1,250 L against a usual 100 L is flagged, never rejected                                                                                    | `e2e/edge-cases`                                                          | Pass                 |
| Unauthorized project           | Out-of-scope reads return nothing, uploads refused, pages redirect; also refused straight at the database API                               | `e2e/authorization`; DB tests `phase2_smoke`, `phase20_scoped_reads`      | Pass                 |
| Expired session                | Refused with "Your session expired"; pages and actions go to sign-in and back to the same page                                              | `e2e/edge-cases`; Phase 19 browser run                                    | Pass                 |
| Network failure                | In-place message and Try again on actions (upload verified offline in Edge); pages that fail to load show the error boundary with Try again | **manual** (Edge, offline mode); Phase 19 browser run (server failure)    | Pass (note 2)        |
| Calculation failure            | Blocked with a named reason, never a guessed number                                                                                         | `e2e/edge-cases` (Petrol, no factor)                                      | Pass                 |
| Missing conversion factor      | Record still queued; "no calculation yet" blocks Approve; Admins notified with a link to Conversion Factors                                 | `e2e/edge-cases`                                                          | Pass                 |
| Missing BRSR mapping           | Report fails naming the indicator code                                                                                                      | `e2e/scenario-d-report`                                                   | Pass                 |
| Report generation failure      | Kept, listed and notified with the reason                                                                                                   | `e2e/scenario-d-report`; Phase 17 checks (rendering, storage, stale runs) | Pass                 |

## 3. Testing categories (plan §5)

| Category          | Final sweep this phase                                                                                                                                           | Result            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Unit              | Web 69, OCR worker 15 (including the new identifier rule)                                                                                                        | Pass              |
| Integration       | End-to-end suite 149 checks against the running app, worker and database                                                                                         | Pass              |
| OCR               | Worker harness 9/9 on the integrated system (real OCR, failures, retries, stale reclaim, concurrent claims); new extractor `rules-4` in the worker image         | Pass              |
| Calculation       | Every current calculation recomputed from what it stored — direct multiply, percentage and subtract (`e2e/scenario-d-report`); unit tests for formulas and units | Pass              |
| Role / permission | `e2e/authorization` (42): Admin-only procedures, scope, self-approval by an approver in scope, deactivation                                                      | Pass              |
| File upload       | §2 rows above                                                                                                                                                    | Pass              |
| Validation        | §2 rows above                                                                                                                                                    | Pass              |
| Report            | Scenario D                                                                                                                                                       | Pass              |
| Audit             | Phase 18 end-to-end re-run (54 checks: filters, paging, a record's history to its report, append-only) and database tests                                        | Pass              |
| Security          | Authorization boundaries through the app and at the database API, CSRF, lockout, upload quota (`e2e/authorization`); DB 154; `SECURITY_REVIEW.md`                | Pass              |
| Responsive UI     | Phase 19 browser run repeated: tablet rail, pinned column, Verify stacking, phone widths (30/30)                                                                 | Pass              |
| Error states      | Phase 19 browser run repeated (skeleton, server failure + Try again, not found, unauthorized, expired session) plus the offline upload                           | Pass              |
| Accessibility     | Phase 19 axe-core sweep (84 page × theme runs, 0 violations) — no UI change since                                                                                | Pass (not re-run) |

## 4. Findings

1. **OCR could read a date as an invoice number.** A reference with no digits was skipped and the next
   line's date taken instead — at 96 % confidence, so the guard rail would not have stopped it. Fixed: an
   identifier is never a date; the field is left empty and flagged for the person (`EXTRACTOR_VERSION`
   `rules-4`, unit test added, worker image rebuilt).
2. **Navigating while offline shows the browser's own offline page.** Next.js falls back to a full page load
   when it can't fetch the next page, so the browser reports the lost connection (with its own reload);
   nothing is lost and the app works once back online. Actions inside a page (upload, confirm, approve) keep
   their in-place message and Try again. Accepted; an offline page of our own would need a service worker.
3. **The OCR harness's clean-up broke after Phase 18**: it deleted its audit entries, which the append-only
   log now refuses. Fixed: the harness leaves its audit entries, as a real run would.

## 5. Not covered here

- Real MEIL documents (none provided).
- The CI database job runs on GitHub only once pushed.
- Hosted Supabase, Vercel and Render (Phase 21).
