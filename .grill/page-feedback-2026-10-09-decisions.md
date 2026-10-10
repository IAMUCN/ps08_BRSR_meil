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

## Later the same day: BRSR Mapping, Reports and the sidebar

- **BRSR Mapping** always shows Sections A, B and C under SEBI's names, Section C grouped by principle. Under
  each section the written questions are listed with "Answered" / "Not reported" for the current financial
  year, how they reach the report, when to answer them, and an Answer link. Section B has no mapping table
  because all twelve of its questions are written.
- **Asking the Admin:** the Reports page warns how many written disclosures have no answer for the year before
  a report is generated. It does not block; unanswered ones print "Not reported". **Not built:** copying last
  year's answers forward, a bell notification, a Control Tower issue.
- **Reports page:** two buttons, "Past reports" (`/admin/reports/history`, every run) and "Evidence for FY …"
  (`/admin/reports/evidence`, every evidence file behind the year's records, each opening through the
  access-checked evidence route). The Reports page itself lists the latest five runs.
- **Turnover / PPP / assurance form:** its summary now says what it is for.
- **Sidebar:** Roles & Permissions before Users.
- Checked: typecheck, lint, format, web unit 96/96; the new queries run read-only on hosted. Not viewed in a
  browser.

## Organization page and side panels (same day, after the commit `6e8ddeb`)

- **Organization:** three columns on a wide screen — tree, selected unit, add cards — and the page is wider
  than the other Admin pages. The owner first asked for the add cards under the tree, then for them on the
  unused right side with the tree alone on the left. "Child node" became "unit under {name}". The expected
  submissions card is titled with the unit it applies to and says each unit keeps its own list.
- **Side panels dock** (A30): one change in the shared sheet component, so it applies to all fourteen panels.
  The docked width is the space left beside a full-width page (about 336px at 1912px), so a wide panel such as
  the record drawer is cramped until expanded. Not viewed in a browser.
- **Follow-ups the same evening:** the docked panel had covered the top bar (a side-specific rule won over the
  offset; now forced) and Expand opens up to 1,400px wide. The record panel shows the document in its own
  column beside the values once it is wider than about 900px (a container query), one column when docked.
  Label / value rows in the record, approval and OCR panels share a baseline. A click anywhere on a row opens
  its panel in the approval, validation, records, OCR and scope tables (`components/ui/row-click.ts`).
  The sidebar is back to Users before Roles & Permissions, at the owner's second request.

## 2026-10-10 — Organization page (A31)

- **Add forms hidden until asked for.** Two buttons above the grid open the single-unit form or the
  spreadsheet import in the shared side panel. The grid is back to two columns; while the panel is docked the
  grid is padded by the panel's width, because this page is wider than the space the docked panel assumes.
  After a single unit is added the panel closes and the new unit is selected.
- **Unit and expected submissions in one tile**, since the ticks belong to the selected unit.
- **Save and Clear for expected submissions.** Ticks are held in the browser until Save, which writes each
  changed tick through the existing `setExpectation` procedure (one audited write each; a refusal stops the
  rest). "Clear" was read as "untick everything" — the agent's reading; it also needs Save. Selecting another
  unit drops unsaved ticks without a warning.
- Checked: typecheck, lint, format. Not viewed in a browser.
