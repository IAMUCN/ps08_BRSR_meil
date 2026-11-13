# EmeilSG — Accessibility audit (WCAG 2.2 AA), 2026-10-12

_Sixth report of the 2026-10-12 audit. Branch `feature-security-audit-fixes`, uncommitted. UI changes are
listed in `UI_NOTES.md`._

**Read this first.** Automated checks find a minority of accessibility problems. This audit ran an automated
scanner and then scripted the checks a scanner cannot make (keyboard, focus, dialogs, reflow, target size,
motion) in a real browser. **No screen reader was used and no person with a disability tested anything.**
Nothing below says the product conforms to WCAG 2.2 AA; it says what was tested, what was fixed, what is
known to be open, and what a person still has to check (§6).

**Which standard (engineer's reading — legal review).** WCAG 2.2 AA is the target the owner set. For an
Indian operator the Rights of Persons with Disabilities Act, 2016 and its rules point to the Indian standard
for ICT accessibility (IS 17802), which is built on WCAG 2.1 AA; whether and how that binds this internal
tool is a question for counsel. Meeting 2.2 AA would cover 2.1 AA.

## 1. Method

The built app ran against the local stack. `apps/web/tests/a11y/run.mjs` (new; `pnpm --filter web test:a11y`)
drove Edge, signed out, as an Admin and as a Project Manager:

| Check | What it does | Coverage |
| ----- | ------------ | -------- |
| axe-core 4.13 | Rules tagged WCAG 2.0/2.1/2.2 A and AA | 31 routes, each signed-in route in **all three themes** (87 page-and-theme scans), plus three open dialogs |
| Keyboard | Tabs through the page; each stop must show a focus indicator and must not be entirely hidden | Landing (30 stops), sign-in (6), each dashboard (45) |
| Skip link | First Tab stop; visible when focused; moves focus to the main region | Landing and both shells |
| Dialogs | Has a name; focus moves in; Tab stays in; Escape closes; focus returns to the opener | Notifications pop-up, Invite user panel, Create period panel |
| Reflow | Page no wider than a 320px window (what 400% zoom gives) | Every route |
| Target size | 24×24 CSS px, with WCAG's own exceptions (inline links, unmodified native controls, spacing) | Public pages and every other signed-in route, at phone width |
| Sign-in | Labels, `autocomplete`, error announced | Sign-in form |
| Structure | One main region, named navigation, `lang`, table header scope, unique titles | Shells; four table pages |
| Reduced motion | Nothing keeps animating with the preference set | Landing |

## 2. Result

| | First pass | Final pass |
| - | ---------- | ---------- |
| Checks passed | 99 | 185 |
| Failed | 36 | 0 |
| Known open (still failing, recorded) | — | 2 |

The final figures are from the last full run. After it the test file was tidied (two statements rewritten for
the linter) and only a subset was re-run (73 passed, 0 failed, 2 known open).

## 3. Fixed

| WCAG | Problem | Where | Fix |
| ---- | ------- | ----- | --- |
| 2.4.1 Bypass Blocks | No skip link anywhere; the Admin sidebar puts 20+ links before the content | Every page | "Skip to main content" is the first Tab stop (root layout); every page's main region is its target |
| 1.4.3 Contrast | Raw palette colours for small text (amber 3.19:1, sky 4.02:1, emerald on tint 2.82:1) that also ignore the theme — their `dark:` variants never apply because themes are set by `data-theme` | Deadlines, Carbon credits, Forecast, Simulator | 52 colour classes replaced by the status and text tokens that were tuned for AA in all three themes |
| 1.4.3 Contrast | Dark text on a 60% tint of the header colour (2.39:1) | BRSR Mapping group rows | A light tint with the theme's text colour |
| 1.4.3 Contrast | Grey secondary text and coloured labels on tinted cards and notices (4.3–4.4:1, worst in the Special theme) | Carbon credits cards, Simulator and Conversion Factors notices, Reports notice link, chosen upload mode | On a tinted surface, text takes the theme's text colour; tint and icon keep the meaning |
| 2.4.3 Focus Order | Closing a side panel left focus nowhere: panels open from ordinary buttons, so the dialog had nothing to return focus to | Every side panel (`components/ui/sheet.tsx`) | The panel remembers what had focus when it opened and returns it on close |
| 4.1.2 Name, Role, Value | The notifications pop-up was a dialog with no name | Top bar | Named "Notifications" |
| 4.1.2 / 3.3.2 | Search fields and filters with no label (fixed in the UI audit earlier today) | Deadlines, Carbon credits | `aria-label` |
| 2.5.8 Target Size | Carousel dots 8×8px; three stand-alone links 17–20px high | Landing infrastructure section; sign-in, forgot password | The dots sit in 24px hit areas and say which is current; the links are 24px high. Nothing looks different |
| 1.4.10 Reflow | Pages wider than a 320px window: fixed-width fields, rows that could not wrap, long button labels | Organization, Users, Audit Trail, Reports, Bundle, Deadlines, Simulator, Carbon credits (8 of 10) | Fields give way on narrow screens; rows wrap; below 360px a button's label may wrap |
| 1.4.10 Reflow | 14 page-and-width cases of sideways scrolling at 390px (UI audit) | Table pages | A table's scroll box is its content's containing block |
| 1.3.1 / 2.4.6 | Two top-level headings on empty pages; 32 announced image fragments (UI audit) | Queues, Reports, landing banner | See `UI_AUDIT_2026-10-12.md` |

Nothing was restyled: colours changed only where text failed contrast, and they changed to tokens the design
system already had.

## 4. Known open

| WCAG | Issue | Notes |
| ---- | ----- | ----- |
| 1.4.10 Reflow | **Roles & Permissions** is 364px wide and **BRSR Disclosures** 378px wide in a 320px window | Recorded in the test as known open. Roles: the permission matrix has a minimum width. Disclosures: cause not found |
| — (usability, several users) | **The native mouse pointer is hidden on every page** and replaced by a drawn one | People who enlarge or recolour the system pointer, or use a pointer-trail or high-contrast scheme, lose their setting. Not a single failed criterion, but a real barrier; the project's landing brief asks for the cursor. **Owner's decision** — at minimum keep the native pointer inside the app and when the user prefers reduced motion or more contrast |
| 1.1.1 / 1.4.5 | **Charts** on Forecast and Simulator are drawings with no text alternative or data table | The chatbot's charts do have both. Needs a summary sentence and an accessible table per chart |
| 1.1.1 | **The document viewer** shows a PDF page as a canvas labelled with the file name only | The extracted fields beside it are the usable alternative for verification; the document's other content is not available to a screen-reader user |
| 3.3.1 / 3.3.3 | **Admin forms** (invite, org unit, period, factor, carbon credit) show errors as a toast or a line of text, not tied to the field (`aria-invalid` / `aria-describedby` are used only on the sign-in, password, upload and verify forms) | Announced through the toast's live region, but the field in error is not identified to assistive technology |
| 2.2.1 Timing Adjustable | The session ends without a warning or a way to extend it | The next action sends the person to sign in and back to the page; unsaved text in a form is lost |
| 2.4.11 Focus Not Obscured | On the landing hero, buttons on the cards behind the top card are mostly covered when focused | Not entirely hidden, so it passes the AA wording; poor all the same |
| 2.5.8 Target Size | Not every signed-in page was measured (every second one) | |
| 1.4.3 Contrast | axe could not decide 7 page-and-theme cases: text over photographs and gradients on the landing and sign-in pages | Needs a person with a contrast tool |
| 1.3.1 | axe could not decide whether some table header cells head any data (Conversion Factors, BRSR Mapping group rows) and one ARIA value in the notifications pop-up | Needs a person |

## 5. Coverage by area

| Area asked for | Automated / scripted | Still needs a person |
| -------------- | -------------------- | -------------------- |
| Alternative text | axe: no image without alt; decorative images empty | Whether each alt says the right thing; charts; the document canvas |
| Headings, landmarks, titles | One h1 per page, one main, named navigation, `lang="en"`, unique titles | Whether heading levels below h1 make sense when read in order |
| Forms | axe: every field has a label; sign-in autocomplete and error announcement | Required-field indication, instructions, error wording and recovery on every other form |
| Keyboard | Focus indicator on 126 tab stops; skip link; nothing entirely hidden | Every control reachable and operable: tree, checklists, popovers, the split-PDF screen, the verify screen, drag-and-drop upload (a file button exists beside the drop zone) |
| Screen reader | Live regions exist for sign-in errors, the chat log, upload progress, route errors | **All of it**: reading order, announcements of saved / failed / loading, table navigation, dialog announcements |
| Contrast | axe on 87 page-and-theme scans: 0 violations | Text over images; non-text contrast of borders, icons, chart lines and the focus ring (axe does not test these); states (hover, disabled, selected) |
| Zoom and reflow | 320px on every route | 200% text-only zoom; text-spacing overrides (1.4.12); content on hover or focus (1.4.13) |
| Accessible names | axe: 0 violations after fixes | Icon buttons inside closed sections and panels that were not opened |
| Dialogs | Three opened and tested | The confirm dialog, the record drawer, the chat pane, the docked panels on a wide screen, the mobile menu |
| Reduced motion | No endless animation on the landing page | Entrance animations, the theme-switch transition, the upload animation |
| Tables and charts | `scope` on every header cell of four tables | Sortable or expandable rows, the pinned first column with a screen reader, charts |
| Touch targets | Public pages and half the signed-in pages | The rest; a real phone |
| Authentication | Password managers can fill; paste is not blocked; the reset code can be pasted | The whole reset flow with a screen reader |

## 6. Manual test script (for a person)

Do these with real data on screen, in the Corporate theme first, then Special and Dark.

1. **Keyboard only, no mouse.** Sign in. Upload a document, verify it, confirm. As Admin: invite a user, add
   an org unit, create a period, approve a record, generate a report. Every step must be possible; focus must
   always be visible; Escape must close what Enter opened.
2. **Screen reader** (NVDA with Firefox or Chrome; VoiceOver on iOS). Repeat step 1. Note anything that is
   not announced: a saved change, a validation error and which field it belongs to, a table's column for each
   cell, a dialog's title on opening, "loading" and "done".
3. **Zoom.** Browser zoom to 400% at 1280px wide on Roles & Permissions and BRSR Disclosures (known open) and
   three pages of your choice. Then text-only zoom to 200%.
4. **Contrast tool** on text over the landing photographs, the sign-in panel, chart lines, input borders and
   the focus ring in each theme.
5. **Pointer.** Enlarge the system pointer in the operating system and open the app: it is replaced by the
   custom cursor. Decide whether that is acceptable.
6. **Reduced motion** switched on in the operating system: the landing page, switching theme, uploading.
7. **Phone.** One real phone: sidebar, a table, the verify screen, the chat pane.
8. **Time-out.** Leave a half-filled form until the session ends and see what is lost.

## 7. Tests added

`apps/web/tests/a11y/run.mjs` — `pnpm --filter web test:a11y`, with `E2E_ENV_FILE` (a local env file),
`E2E_APP_URL` and `CHROMIUM_EXECUTABLE_PATH` set. It refuses a database that is not local, creates two
accounts and removes them. Known-open items are printed as `OPEN` and do not fail the run; a check on that
list that starts passing is reported so the entry is removed. It is **not in CI** (it needs the built app, the
local stack and a browser). New dev dependency: `axe-core` 4.13.0 (already in the lockfile through ESLint's
accessibility plugin).

Other checks after the changes: unit tests 191/191, typecheck, lint, format.
