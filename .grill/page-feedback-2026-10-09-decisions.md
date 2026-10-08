# Grill: Page feedback from the owner (2026-10-09)

Date: 2026-10-09

The owner marked five things on the running app (hosted database) and pasted them in chat. All five were done
by the feature role at the owner's direct request, although four are in the ui lane.

- **A multi-page PDF "disappeared" after upload.** Reproduced on hosted, read-only: two PDFs uploaded as "A PDF
  with several bills" had been read and were waiting on the split screen. Such a PDF has no record until its
  split is confirmed (D24), so My Submissions never listed it; the notification was the only way back. **Fix:**
  My Submissions now has a section "PDFs with several bills" listing every such PDF of the uploader until its
  split is confirmed (`bundles.pending`). A PDF that could not be read drops off after seven days.
  **Discard** (owner asked the same day): the split screen and the "could not be read" screen have a
  "Discard this PDF" button (`bundles.discard`, audited as `document.bundle_discarded`). Uploader only, only
  before any bill is recorded, and not while the PDF is still being read. The document is marked deleted; the
  stored file is kept.
- **No redirect after an upload.** The person stays on Upload with a "received" notice and a link (My
  Submissions, or Check the split for a multi-bill PDF), the project and activity kept, the file cleared.
  Replacing a failed document still returns to My Submissions (it is one document for one record).
- **Upload animation:** a bouncing arrow in a pulsing ring, a thicker striped progress bar, a large percentage,
  and the checking and saving steps shown in the same place. Stops under "reduce motion".
- **Whole row clickable on My Submissions:** a click anywhere on a row opens what its document link opens;
  selecting text, links inside the row and Ctrl-click (new tab) behave normally. The link stays for keyboards.
- **Forgot password on Profile:** a link under Change password to the existing emailed-code reset
  (`/forgot-password`). No new flow.

Checked: typecheck, lint, format, web unit tests; the new query run read-only on hosted (returns the two waiting
PDFs). **Not run:** the end-to-end suite and the browser test (both updated for the new flow) — the machine had
1.6 GB free with the owner's dev server and the hosted worker running. Run scenario E and
`tests/e2e/browser-bundle.mjs` before merging.
