# Grill: a PDF holding several bills

Date: 2026-10-05

Requested directly by the owner (outside the phase sequence): "if the user uploads a PDF containing all the
required bills, the app should fetch the details of all the bills separately and fill them respectively."

## Intent

One upload, several bills of different activities (an electricity bill, a diesel invoice, a water bill). Each
bill ends up as its own record, read by the OCR on its own, with its own fields filled — and a person still
confirms everything.

## Owner's answers

- **Who decides the split: the app proposes, the person confirms.** The OCR reads every page, groups pages into
  bills and guesses each bill's document type and activity; a review screen shows the guess and the uploader
  fixes or approves it. Rejected: fully automatic (a wrong split would create wrong records, and the worker would
  start creating records, which only the server does today); and marking pages up front (most work for the user).
- **What the PDF holds: different activities, the same project and month.** One project and one reporting period
  for the whole PDF (the open period). Several months in one PDF (each bill in its own period) is **not** built.
- **Permissions: each bill is checked against the uploader's role.** A Project Manager can record Scope 1 and 2
  bills but not water (EHS). A bill the role may not record is shown as such, left out by default, and the server
  refuses it if someone keeps it anyway — the same rule a single upload has.

## Design decisions

- Decision: **the uploaded PDF is a document of its own with no record** (`documents.is_bundle`, migration `0032`,
  D24). It keeps the original as evidence and is never itself a record. The worker's job for it is *propose*, not
  *extract*: no `ocr_fields`, no record, no verification state.
- Decision: **each kept bill is cut out as its own PDF** (server, `pdf-lib`) with its own SHA-256 and storage path,
  then recorded exactly like a single upload (document, record, evidence link, OCR job, audit entry) and points back
  at the original (`documents.bundle_document_id`). Everything downstream — Verify Extraction, validation,
  calculation, approval, the evidence route, reports — works unchanged, and a bill's lineage ends in its own PDF and
  from there in the original. Cost: each bill is OCR'd again (a few seconds a page). New dependency: `pdf-lib`.
- Decision: **splitting happens at confirmation, not at upload** — so editing the page ranges is just a different
  input, no worker round trip.
- Decision: **the proposal** (`document_bundle_parts`, server-only like `rate_limit_events`): each page is
  classified on its own among *every* document type (keyword score, the existing `classify`); a page naming a
  different type than the one before starts a new bill; a page naming none stays with the bill before it; leading
  unnamed pages join the first named bill. The activity is the document type's only metric, or among several (fuel
  invoices: petrol, CNG, LPG) the one whose name has a word no other candidate's name has, found on the page; no
  match leaves it to the person. `FUEL_INVOICE` got classification keywords (it had none; `rules-10`).
- Decision: **the review screen** (`/app/upload/split/[documentId]`) shows the PDF beside the proposed bills; per
  bill the person can change the first and last page and the activity, leave it out, remove it, or add a bill. The
  same pure rules (`lib/documents/bundle.ts`) run in the browser and on the server: a page belongs to at most one
  bill, pages outside any bill are simply left out, a kept bill needs an activity, at least one bill is kept. Possible
  duplicates (records already there for that project, period and activity, or two bills of one activity in this PDF)
  are warned about and need acknowledging, never blocked (Phase 5 rule).
- Decision: **only the uploader** sees and confirms a PDF's split (not found and not yours look the same). Confirming
  is once only; it re-checks scope, the open period and the role per bill, locks the proposal, and either records
  everything or nothing (bytes are stored first and removed again if the transaction fails).
- Decision: **limits**: 20 pages per PDF (worker `BUNDLE_MAX_PAGES` = web `BUNDLE_MAX_PAGES`; longer PDFs are refused
  at upload with a message to split them), 20 bills per PDF, still 50 MB. Bundle uploads count against the upload
  rate limit once; the bills cut from it are not counted again.
- Decision: **upload form**: a choice "One bill" / "A PDF with several bills" at the top; the several-bills choice
  hides the activity picker and accepts PDF only. After upload the person lands on the split page, which waits for
  the OCR (refreshing itself) and is also reached from the notification "PDF ready to split".

## Known limits (said plainly)

- Two **consecutive bills of the same type** (two electricity bills back to back) look like one bill; the person has
  to split them by editing the page ranges / adding a bill. Several months of one activity in a PDF is the
  "several periods" case above and is not supported.
- Classification is keyword-based and per page. A bill whose page names no known type joins the bill before it. A
  real, scanned, low-quality bill may be mis-grouped; the review exists for that.
- Only PDFs (not several photos in one image).
- Worker: a worker running an image older than `rules-10` fails a bundle job ("not linked"), and a worker newer than
  the database (before migration `0032`) fails **every** job (it reads `documents.is_bundle`). Push the migration
  before replacing the hosted worker container.

## Checked

- Worker unit tests 40/40 (12 new: page grouping, activity proposal) and Ruff; the real OCR on a generated
  three-bill PDF splits it into electricity / diesel / water with the right activities.
- Web unit tests 78/78 (5 new), database tests 164/164 (10 new), lint, typecheck, format.
- End-to-end scenario E (37 checks, real worker image, local stack) and a real-browser run in Edge (17 checks); the
  single-bill scenario A still passes.
- While checking: the end-to-end suite's test passwords did not meet the new password policy (so it could not create
  its accounts) and four database tests held stale expectations from migrations `0029`–`0031`; both fixed.

## Out of scope

- Several reporting periods in one PDF; splitting images; an Admin view of unconfirmed bundles (an unconfirmed PDF
  stays in storage and in `documents` like an abandoned upload).
