# One upload for every bill (2026-11-12)

Owner's request: "merge the two features of uploading bills, i.e. one bill and multi bill. Let the app decide in
background to detect the bills. After extracting the PDFs give the user a UI like the multi bill page separation
now has. Also consider: a single bill of multiple pages, multibill multipage, or one bill one page. Separate them
properly. Also provide an option for changing the reporting period via a drop down; by default the latest
reporting period; in case the user uploads multiple images or a PDF of multiple bills of different periods,
correctly classify them. If billing period and reporting period don't match, flag them. Also provide the
submission datestamp." D57, A58, migration `0067`, OCR `rules-15`.

## The owner's answers (asked 2026-11-12)

1. **Every upload stops at the separation page**, even one one-page bill (the first reading is reused, so a bill
   is not read twice).
2. **Several files are one batch:** pages in the order dropped; a bill can span files.
3. **A billing period that points to a closed or missing period:** the bill stays in the chosen period and is
   marked "Billing period doesn't match"; validation flags it after Verify (`billing_period_overlap`).
4. **Hosted:** build and test locally first, then ask before the migration and the worker go to hosted.

## What was built

- **No reporting period on the Upload page** (owner, 2026-11-12, after the first build: "remove the reporting period selection in upload page, the user can select it after extraction"): the upload is filed under the newest open period and each bill's period is chosen on the separation page. "Replace a failed document" keeps its period choice (it has no separation page).
- **Upload page:** one drop zone for any number of PDFs and photos (JPG, PNG), up to 30 files, 50 pages and 50 MB
  in all, reorderable; the reporting-period dropdown is always shown, newest first. No activity is chosen
  there. After the upload the person goes straight to the separation page. "Replace a failed document" keeps
  the old one-file form (its activity is fixed).
- **Server** (`bundles.prepareUpload` / `completeUpload`): each file is stored as it is and re-checked; a single
  PDF is the upload itself, anything else is joined into one PDF (`lib/documents/join-pages.ts`: a photo is one
  page sized so the worker's 200 dpi render is the photo's own size; a JPEG's EXIF orientation is honoured). The
  files are listed in `document_bundle_sources`. The older one-PDF call shape still works (e2e suite).
- **Splitting** (worker `rules-15`, `worker/extraction/bundle.py`): a new bill starts at "Page 1 of N", at a
  change of document type, or at a different bill number (or, with no bill number on either page, a different
  billing period). "Page 2 of 3", a page with no identifiers and a page with the same ones stay with the bill.
  Each proposed bill stores the bill number and billing period read on it.
- **Separation page:** per bill, a Reporting period dropdown preset from its billing period
  (`periodForBill`: the open period holding its last day, else the one it overlaps most, else the upload's
  period); "Billing period doesn't match: … is outside …" when it doesn't touch the chosen period; the bill
  number and billing period read; the submission date and time; the files in reading order.
- **Confirm** (`bundles.confirm`): each bill is filed in its own period (checked against the periods the person
  may upload to); a bill that is exactly one uploaded file is that file, unchanged (a photo stays a photo); any
  other is cut out as a PDF named after its file. Late is judged against the bill's own period.
- **No second reading:** a bill cut from an upload reuses the upload's OCR lines and page sizes (boxes included)
  instead of being read again (`load_bundle_reading`); about 1 s a bill instead of 10 s a page.
- **Submission date:** the separation page, My Submissions and Verify show when the upload arrived (a bill cut from
  an upload was submitted with it).

## Fix: same-activity bills of different periods (2026-11-12, `rules-16`)

Owner: "the OCR isn't recognizing the same activity bills for different period properly". On hosted, a 5-page PDF of
five monthly electricity bills (different bill numbers and billing periods on every page) was proposed as one bill:
it prints a document-wide footer "Page k of 5", and `rules-15` let "Page 2 of 5" overrule the different bill
numbers. Now a marker whose numbers equal the page's place in the whole upload is the document's numbering and is
ignored; a bill's own numbering ("Page 2 of 2" inside a longer upload) still counts. Replayed on the stored
lines of that upload: five bills, January to May 2026. Worker unit 60/60 (two new), Ruff.

## Decisions (made by the agent; confirm with the owner)

1. A bill whose billing period can't be read stays in the upload's period, with "check the period yourself".
2. A bill running across a month end goes to the month it ends in.
3. The limits: 30 files, 50 pages, 50 MB per upload (the evidence bucket's per-file limit).
4. The joined PDF is the upload's evidence on the separation page; every original file is kept and recorded
   (name, type, size, SHA-256) with the upload.
5. The old single-upload procedures stay (used by "Replace a failed document" and the e2e suite).

## Not done / not run

- Hosted: migration `0067` and the `rules-15` worker image (built locally as `traceesg-ocr-worker:merged-upload`).
- A browser check of the new Upload and separation pages; the production build; the e2e suite.
- A real multi-page single bill through OCR (covered by worker unit tests only).
