# UI notes

Decisions and deviations recorded by the **ui** role (see `CLAUDE.md`, rule 5); the feature role folds them
into `PROGRESS.md`, `CONTEXT.md` and the deviation files.

## 2026-11-13 — Tracey AI custom chatbot avatar integration & FAB floating positioning

Integrated designer vector asset `C:\Users\dines\Desktop\New folder\EmeilSG_Logo\chatbot_logo.svg` as the official Tracey AI brand mark:
- Saved optimized vector asset with centered character crop (`viewBox="180 160 660 660"`) at `apps/web/public/brand/chatbot-logo.svg`.
- Updated `apps/web/components/brand/tracey-mark.tsx` (`TraceyMark`) to use Next.js `<Image>` component with `priority`, responsive sizing, and `pointer-events-none select-none`.
- Floating Action Button (`.ask-fab` in `apps/web/components/chat/chat-launcher.tsx`) positioned consistently:
  - **Desktop (md+):** `md:right-6 md:bottom-6 md:size-14` (56×56px FAB, 36×36px icon), smooth hover scale (`hover:scale-105`) and elevation.
  - **Mobile (<md):** `right-4 bottom-[calc(4rem+0.75rem+env(safe-area-inset-bottom,0px))] size-12` (48×48px FAB, 32×32px icon). Floats 12px above the fixed 64px (`h-16`) bottom navigation bar, eliminating all overlap or cutoffs.
  - **Chat Pane Header:** Crisp 28×28px badge in the top bar beside the `Tracey` title mark.
- Verified visual output across desktop and mobile viewports with Puppeteer screenshots. All 367 tests passing.


## 2026-10-11 — Chat panel built by the feature role (for the ui role to restyle)

The owner asked the feature session to build the chatbot's screen as well, so that it could be tried at once.
It was kept out of the ui role's files as far as possible:

- **New files only:** `apps/web/components/chat/chat-launcher.tsx` (the two buttons and the panel) and
  `apps/web/components/chat/chat-blocks.tsx` (figures, tables, charts).
- **One existing ui file touched:** `apps/web/components/shell/top-bar.tsx` — two imports and one line,
  `{chatConfig() ? <ChatLauncher /> : null}`, after the theme toggle.
- **Free to change:** layout, spacing, colours, the button's icon and place, the example questions.
- **Keep:** the model's wording is rendered as plain text (never as HTML or Markdown); blocks are rendered
  from `lib/chat/blocks.ts` types only; the "Covers:" and "As of" lines stay on every answer; the note that
  questions go to an AI service stays visible.
- **Known rough edges:** the floating button sits where toasts appear (toasts show above it); deleting a
  conversation uses the browser's own confirm box; the panel was viewed at 1366px and 390px in the Corporate
  theme only — not in the Special or Dark theme, and not docked at 1900px.

Deviation A32 in `apps/web/APP_FLOW_DEVIATIONS.md` describes the behaviour.

## 2026-10-11 — The chat panel became a docked pane

At the owner's request ("like Copilot in Edge") the panel no longer uses `components/ui/sheet.tsx`. It is an
`<aside id="chat-pane">` in `components/chat/chat-launcher.tsx`: fixed at the right, 420px, on screens of
1024px and wider, where the component sets `padding-right: 420px` on `<body>` so the page narrows; a
full-screen cover below that. Open or closed is kept in `localStorage` (`traceesg-chat-open`).

- **If the width changes,** change `PANE_WIDTH` and the class `lg:w-[420px]` together.
- **Known rough edges:** a record drawer docked at 1900px opens over the pane (both sit at the right); toasts
  appear over the pane's bottom corner; viewed at 1366px and 390px in the Corporate theme only.

## 2026-10-11 — Custom period on Reports; a link block in the chat panel

Built by the feature session at the owner's request (A34).

- `app/admin/reports/report-form.tsx`: a third radio, _Custom period_, with two `NativeSelect`s; the form
  takes a `preset` prop and the page passes one from the address (`key` on the form re-creates it when the
  address changes).
- `components/chat/chat-blocks.tsx`: a new block type `link`, drawn as a bordered row with an arrow.
  `chat-launcher.tsx` calls `router.push` when an answer carries one.
- **Not viewed in a browser.** Check the form's wrapping with five controls in a row, and the link row in the
  Special and Dark themes.

## 2026-10-11 — Organization page and chat pane, from the owner's page feedback

Built by the feature session at the owner's request (A35).

- `components/ui/confirm-dialog.tsx` (shared): two new optional props — `requireTyped` (a word to type before
  the button works) and `blocked` (only Cancel works). Existing callers are unaffected.
- `app/admin/organization/org-manager.tsx`: the tree draws every group and draws a shared unit under each
  parent with a "Shared" tag; two new cards (Also under another parent, Delete this unit); the Add a unit
  panel starts with an "Add where" select; the "Organization hierarchy" heading is bold.
- `components/chat/chat-launcher.tsx`: the header is a 56px bar (`bg-modal-header`) with the three icon
  buttons; the textarea is one row and sizes itself to its text (up to `max-h-40`); the empty state sits at
  the bottom (`mt-auto`).
- **Not viewed in a browser.** Check the header bar's icon contrast in the Special and Dark themes, the tree
  with a shared unit at 1366px, and the chat pane's empty state on a short screen.
- Second round the same day: the Shared tag is a glowing pill in `text-primary-text` (a box shadow in the
  same colour) and shows under every parent; an **Export hierarchy** button sits beside the two add buttons.
  The glow has not been seen in any theme.
- Third round: the Shared tag is a `Popover` trigger that opens on hover, focus-press or click and lists the
  unit's parents (`SharedPlaces` in `org-manager.tsx`); it sits beside the row's select button, no longer
  inside it. Tree rows have ids (`org-row-<parent>-<unit>`) so a chosen place can be scrolled into view.
- Fourth round: parents are chosen from a checkbox list (`ParentChecklist` in `org-manager.tsx`, native
  checkboxes in a bordered, scrolling box with a filter above eight entries), in the Add a unit panel and in
  the Parents card, which now has a Save parents button instead of per-row Remove buttons.

## 2026-10-11 — Records filter bar: search and Clear filters

Built by the feature session at the owner's request. `components/records/records-explorer.tsx`: a search
field on its own row at the top of the filter bar (prop `search`), applied 450 ms after typing stops or on
Enter; a Clear filters button at the right of the bar, disabled when nothing narrows the list. The link in
the empty-table message is gone. Not viewed in a browser.

## 2026-10-12 — Defect fixes from the UI audit (`UI_AUDIT_2026-10-12.md`)

Made by the feature session during the audit the owner asked for; no restyling, defects only. Verified in Edge
at 1440, 820 and 390px on the local stack (117 screenshots per pass).

- `app/globals.css`: a table scroll box (`.overflow-x-auto`) is `position: relative`. A screen-reader-only
  label inside a table header was escaping the box and making whole pages scroll sideways on a phone.
- `components/shell/empty-state.tsx`: new `nested` prop. Under a `PageHeader` pass it, so the title is an
  `h2`; without it the title stays the page's `h1`. Eleven pages now pass `nested`.
- `app/admin/deadlines/deadlines-client.tsx`, `app/admin/carbon-credits/carbon-credits-client.tsx`: table
  headers use `bg-table-header text-table-header-foreground` like every other table (the pinned first cell
  was unreadable); emoji replaced by lucide icons in the status colours; `aria-label` on the search fields
  and filters; the tab row wraps; the due date does not wrap. Deadline dates are no longer called
  "statutory" (also `app/admin/deadlines/page.tsx`).
- `app/admin/simulator/simulator-client.tsx`, `app/admin/brsr-mapping/mapping-table.tsx`: three rows may wrap.
- `components/landing/landing-page.tsx`: `overflow-x-clip` on the root; `traceability-section.tsx`: grid
  children get `min-w-0`. `registry/magicui/pixel-image.tsx`: the pieces have empty alt text.
- `app/layout.tsx`: `<CustomCursor />` was mounted twice; now once.
- Earlier the same day (security audit): `app/admin/audit-trail/audit-view.tsx` and
  `components/records/records-explorer.tsx` — CSV cells that start like a formula are neutralised.

Left for the ui role and the owner (reasons in the report): the site-wide custom cursor, the hero card deck,
card captions that read as results, the jargon and one-off styling of Deadlines and Carbon credits, the pill
button on sign-in, em dashes in copy, small touch targets, the browser icon.

## 2026-10-12 — Accessibility fixes (`ACCESSIBILITY_AUDIT_2026-10-12.md`)

Made by the feature session during the WCAG audit the owner asked for. Verified with `pnpm --filter web
test:a11y` (axe-core plus scripted keyboard, dialog, reflow and target-size checks in Edge, three themes).

- `app/layout.tsx`: a "Skip to main content" link is the first Tab stop. Every `<main>` has
  `id="main-content" tabIndex={-1}` (both shell layouts, landing, auth card, auth slider, not-found). A new
  page's main region needs the same id.
- `components/ui/sheet.tsx`: a side panel returns focus to whatever had it when the panel opened.
- **Colour rule for the newer Admin pages:** no raw palette text classes (`text-amber-600`,
  `dark:text-…`) — the `dark:` variants never apply (themes are `data-theme`) and small text fails contrast.
  Use `text-status-success` / `-warning` / `-error`, `text-primary-text`, `text-foreground`. On a tinted
  surface (`bg-…/5`, `/10`, `/20`) text takes `text-foreground`; add
  `[&_.text-muted-foreground]:text-foreground` to the tinted container. Applied to Deadlines, Carbon credits,
  Forecast, Simulator, the Conversion Factors and Reports notices, the chosen upload mode, and the BRSR
  Mapping group rows (`bg-table-header/15 text-foreground`).
- `components/shell/notification-bell.tsx`: the pop-up is named. `components/landing/infrastructure-section.tsx`:
  carousel dots sit in 24px buttons with `aria-current`. `components/auth/auth-slider.tsx`: three links are
  24px high.
- Narrow screens: `app/globals.css` lets a button's label wrap below 360px; fixed-width fields on Users and
  Audit Trail give way (`max-w-[calc(100vw-7rem)]`); rows wrap on Reports, Simulator, Deadlines, Carbon
  credits, Roles; the Organization tree scrolls inside its box.
- Still open for the ui role: Roles & Permissions and BRSR Disclosures at 320px, text alternatives for the
  Forecast and Simulator charts, field-level error association on Admin forms, the custom cursor.

## 2026-10-12 — Feedback widget loads in development only

`app/layout.tsx` no longer imports `agentation` directly; `components/dev/feedback-widget.tsx` loads it with
`next/dynamic` from a branch a production build removes. Its code used to end up in the production bundle
(never rendered). Checked: no file of a production build mentions it; a development server still references it.
Also from the validation stage: `app/admin/reports/bundle/bundle-client.tsx`
uses the standard table header tokens.

## 2026-10-12 — The product is called EmeilSG; new logo (owner's request)

- Name: every place the app shows or sends its name says **EmeilSG** — page titles, landing page, sign-in,
  sidebar, emails (subjects, bodies, default sender name), invite and recovery templates, the report PDF, the
  evidence bundle and its file name, the chatbot's instructions. Browser storage keys and the set-password
  cookie were renamed too (`emeilsg-theme`, `emeilsg-chat-open`, `emeilsg-password-setup`).
- Logo: `components/brand/logo-mark.tsx` and `app/icon.svg` (the browser icon) hold the same drawing — a
  document with lines and bars and a leaf in front, **redrawn by hand from the owner's PNG**, not traced. Used
  in the landing header and the sign-in header with the two-colour wordmark (navy `#0B2A5B`, green `#1E7A34`;
  the logo's lighter green is 3.46:1 on white, too low for small text).
- Kept on purpose, not shown to users: the Docker image and container name `traceesg-ocr-worker`, the test
  accounts' `@traceesg.test` addresses, the package name `@traceesg/shared-types`, temp-folder prefixes in
  tests, and the project's documents (history).

## Invite user wording (2026-10-12, feature session, A36)

`app/admin/users/users-manager.tsx`, text only: the panel says the person gets a temporary password; the
toasts are "Account created" plus "Temporary password emailed to …" or the reason it was not sent; the button
is **Resend email**.

## Show password on sign-in (2026-10-12, owner's page feedback)

`components/ui/password-input.tsx` is a password field with an eye button inside it (Show password / Hide
password, `aria-pressed`, reachable by Tab; Edge's own reveal icon is hidden so there is one). Used on
`app/login/login-form.tsx` only. The other password fields (forgot password, set password, Profile) still use
the plain `Input`.

## Choose a new password on the sign-in page (2026-10-12, feature session, A36)

`app/login/change-password-form.tsx` (new) and `app/login/page.tsx`: after a sign-in with a temporary
password the left panel shows "Choose a new password", a notice, two `PasswordInput`s with the strength
meter, and a Sign out link. `AuthSlider` gained two optional props, `heading` and `footer`; its look is
unchanged. The right-hand "Locked out?" panel is still shown there.

## Expected submissions from the units below (2026-10-12, feature session, owner's request)

`app/admin/organization/org-manager.tsx`, `ExpectationsCard`: an activity that a unit below must submit is shown
ticked on the parent, with "From <unit names>" under its name (three names, then "and N more"), and counts in
"N of M expected". The box is locked unless the parent also holds the activity itself. Not viewed in a browser.

## Edit role (2026-10-12, feature session, owner's request)

`app/admin/roles/roles-manager.tsx`: an **Edit role** button beside the role's badge opens a side panel with
Name, Code (shown, not editable) and Description. Opening it closes the Create role panel and the other way
round. Not viewed in a browser.

## "Uploads documents on behalf of" in Edit role (2026-10-12, feature session, D40)

`app/admin/roles/roles-manager.tsx`, `EditRoleSheet`: a select under Description listing the roles this one may
stand in for (not Admin, not itself, not a role that already stands in for another), with a hint line. Hidden
for the Admin role. Not viewed in a browser.

## Super Admins and scoped Administrators (2026-10-13, feature session, owner's request)

Built by the feature session with the owner's go-ahead to do the ui parts too
(`.grill/scoped-admin-onboarding-decisions.md`, A37). No restyle; what changed on screen:

- `components/shell/admin-nav.ts` (new): the admin sidebar as one list, filtered by who is signed in. It has
  two new entries, **Upload** and **My Uploads**, which open the existing `/app` screens. `app/admin/layout.tsx`
  and `app/app/layout.tsx` both use it, so an administrator keeps the same sidebar while uploading.
- `app/admin/users/users-manager.tsx`: Revoke is disabled with "Outside what you administer." where the
  server would refuse; the Account section explains when an account is out of reach; the scope picker lists
  only units in the caller's scope; "Admin role" wording is "Super Admin role".
- `app/admin/organization/org-manager.tsx`: a unit the caller cannot change shows one explanatory line in
  place of the rename form; Move, Parents, Deactivate and Delete are not shown for it; Add a unit and Add
  from a spreadsheet are disabled on a unit above the caller's scope; the people count is not shown there.
- `components/approvals/approval-queue.tsx`: one line for a Super Admin deciding on their own record.
- Reports and Organization hide the yearly inputs, the written-disclosures notice and the Hierarchy levels
  card from an Administrator (Super Admin only).

Viewed in Edge at 1440px as a project Administrator on the local stack (dashboard, Users, Organization on
their own unit and on the unit above, Scope 1, Upload, Approval Queue, Reports): no console error. Not
viewed: phone and tablet widths, the Dark and Special themes, the Super Admin's own-record line.

## Invitation links and session limits (2026-10-13, feature session, owner's request)

Built by the feature session (`.grill/scoped-admin-onboarding-decisions.md`, A38, A39). No restyle.

- `app/invite/` (new public page): the auth card used by Set password, with "Enter new password" and
  "Confirm new password", the strength meter and the show-password button; a "Checking your link…" line
  first; one message and a Go to sign in link when the link is no good.
- `app/admin/users/users-manager.tsx`: under the Invited badge a small line says where the link stands; the
  side panel has **Resend invitation** and, while a link is open, **Revoke link** (with a confirmation);
  the invite panel's wording no longer mentions a temporary password.
- `components/bulk-import/employee-bulk-import.tsx`: the results table and its download have "Invitation"
  and "Note" columns in place of "Emailed" and "Password / Error"; the hint text says no password is shown.
- `components/shell/session-keeper.tsx` (new), mounted in `app/admin/layout.tsx` and `app/app/layout.tsx`:
  draws nothing until five minutes before the sign-in ends, then a small notice fixed under the top bar
  (`role="alert"`, card tokens) with **Stay signed in** or **OK**.

- `app/admin/audit-trail/audit-view.tsx`: the button that opens an event is at least 24px high (one
  class). The accessibility suite failed on it at phone width once a long event name was at the top.

Viewed in Edge on the local stack at 1440 and 390px: Users with invited accounts, the Manage panel, the
page of a link that is no good, the sign-out notice. Not viewed: tablet width, the Dark and Special
themes.

## The system cursor comes back when the custom one cannot be drawn (2026-10-30, feature session, owner's report)

The owner saw no cursor anywhere. The root `<html>` carried `custom-cursor-enabled` from the server, which
hides the system cursor before the custom one exists (and for good on a touch device, where `Pointer` never
draws it); and Next's development error overlay sits above the custom cursor, so an error screen had none.

- `app/layout.tsx`: the class is no longer on `<html>`; `registry/magicui/pointer.tsx` adds it once it draws.
- `app/globals.css` and the style `Pointer` injects: `nextjs-portal` (the error overlay) keeps the system cursor.

- `registry/magicui/pointer.tsx`: the custom cursor is skipped only when there is no fine pointer at all
  (`any-pointer: fine`). It used to skip any device with `maxTouchPoints > 0`; the owner's laptop has a pen
  digitizer (Windows reports one touch point), so the custom cursor was never drawn there — the real cause
  of "no cursor anywhere".

Checked in Edge on the dev server: the class is absent before the page's script runs and present after,
the custom cursor is drawn on `/` and `/login`, the overlay element gets `cursor: auto`; with one touch
point reported (as on the owner's laptop) the custom cursor is drawn; with phone touch emulation it is not
and the system cursor stays. Not checked: a real phone or tablet.

## Tree selector, Shared tag, pop-ups (2026-11-01, feature session, owner's feedback, A40)

- New `components/org/org-tree-select.tsx`, used by Expected Submissions (`org-manager.tsx`) and the shared filter
  bar (`components/records/records-explorer.tsx`). Other organisation dropdowns are unchanged.
- `org-manager.tsx`: the Shared tag has no glow (a 5% tint and a 30% border); a selected shared unit is highlighted
  under every parent, the clicked copy fully and the others lightly; a collapsed parent shows a dot; name and code
  are behind Edit name and code.
- `notification-bell.tsx`: pop-ups through `sonner`, Mark all read in the header. `users-manager.tsx`: Edit name and
  email in the Manage panel. `roles-manager.tsx`: the code field shows its rule's message under it, in red.
- `periods-manager.tsx`: a date field in the open and reopen dialogs when the deadline has passed.

## Feature lane, 2026-11-07 (Phase 1 of feature_enhancement.md)

- `app/login/login-form.tsx`: the takeover question (a `ConfirmDialog`, plus an inline block with the same button
  for the no-JavaScript case and after Cancel).
- `app/admin/roles/roles-manager.tsx`: each permission shows its name (`permissionLabel`) instead of its code.
- `components/profile/profile-view.tsx`, `app/forgot-password/forgot-password-form.tsx`,
  `app/reset-password/set-password-form.tsx`: `PasswordInput` in place of plain password fields.
- For the ui role: the root `app/loading.tsx` (merged 2026-11-07) makes every page stream, so a server-side
  `redirect()` (for example a Project Manager opening an Admin page) now arrives as a 200 page with a client-side
  redirect instead of a 307. Access is still refused (no Admin content is sent), but the status changed; two
  end-to-end checks now accept either. `app/loading.tsx` and `app/page.tsx` also fail `pnpm format:check`.

## Feature lane, 2026-11-07 (Phase 2 of feature_enhancement.md)

- `components/upload/upload-form.tsx`: a period picker with due dates and a late notice; a rejected record's
  re-upload may choose another activity.
- `components/records/records-explorer.tsx`: Activity and Document type filters on both screens, bill number and
  document type under the file name, Late / Possible duplicate marks, CSV columns.
- New `components/records/stage-tracker.tsx`, `components/records/record-corrections.tsx` (in the record drawer)
  and `components/document-viewer/document-thumbnail.tsx` (approval rows; renders page 1 when the row is visible).
- `components/approvals/approval-queue.tsx`: thumbnail, bill no., marks, row Approve / Return, panel with the bill
  beside its values and the stage tracker.
- `app/admin/reporting-periods/periods-manager.tsx`, `app/admin/validation-queue/validation-queue-table.tsx`,
  `app/app/page.tsx` (every open period with its dates).

## Feature lane, 2026-11-08 (Phase 3 of feature_enhancement.md)

- `components/document-viewer/document-viewer.tsx`: optional `regions` overlay (boxes in percent of the page,
  clickable), used only by Verify Extraction; other screens unchanged.
- New `components/verification/verify-split.tsx` (Verify Extraction's two halves in step); `field-row.tsx` (red when
  unresolved, "OCR read:", the missing-field reason, selection); `verify-workspace.tsx` (hint and Download as Excel).
- `components/records/records-explorer.tsx` (OCR column and filter), new `components/records/record-ocr.tsx` in the
  record drawer; `components/shell/admin-nav.ts` (OCR Monitoring removed); `app/admin/ocr-monitoring/page.tsx` is a
  redirect, its table and actions removed.

## Feature lane, 2026-11-08 (Phase 4 of feature_enhancement.md)

- New `components/reports/report-forwarding.tsx` (the Verification section on a report's page and the Reports to
  verify list on Reports); `app/admin/reports/page.tsx` and `[reportId]/page.tsx` use it.
- `app/admin/audit-trail/audit-view.tsx`: search, Show (Only my activity), Role filters and roles under each name;
  a `compact` mode for the new `app/app/activity/page.tsx` (My Activity). Menus: My Activity in both; the Audit Trail
  item no longer Super Admin only.

## Feature lane, 2026-11-08 (Phase 5 of feature_enhancement.md)

- New `app/admin/deadlines/reminders-panel.tsx` (schedule grid, Run now, the sent log 20 rows at a time);
  `app/admin/deadlines/page.tsx` opens to Administrators and shows the task list to the Super Admin only.
  `components/shell/admin-nav.ts`: Reporting Deadlines is no longer Super Admin only.
- The schedule is a grid of labelled selects, not a table: the global first-column rule for tables painted its first
  header cell dark.

## Feature lane, 2026-11-08 (Phase 6 of feature_enhancement.md)

- `app/admin/conversion-factors/factors-manager.tsx` rewritten (source column, approval column, Approve / Turn down /
  Withdraw, Put back, the form's Source fieldset with Fetch values and a list of values to pick, financial year,
  result unit as a select); new `review-panel.tsx` (yearly review, its list folded in a `<details>` so the factor
  table stays near the top); `page.tsx` reads `?fy=`.
- New `app/admin/carbon-credits/credit-links-panel.tsx`, rendered by `carbon-credits/page.tsx` above the existing
  client. `carbon-credits-client.tsx` untouched.
- `next.config.ts` (shared): `pdfjs-dist` added to `serverExternalPackages` (the server reads source PDFs).

## Feature lane, 2026-11-09 (Phase 7 of feature_enhancement.md)

- New `app/admin/carbon-analytics/` (`page.tsx`, `year-charts.tsx`, `recommendations.tsx`, `alerts-panel.tsx`,
  `unit-picker.tsx`, `actions.ts`). The charts are inline SVG small multiples in `--primary-text`, not the scope
  colours: those fail the colour-separation check as a set (Dark theme Scope 1 / Scope 3 are both near-grey).
- `components/shell/admin-nav.ts` (one line: Carbon Analytics, open to Administrators) and
  `components/shell/sidebar.tsx` (one icon, `analytics: ChartColumn`).
- `app/admin/kpi-trends.tsx`: one sentence linking to Carbon Analytics.

## Feature lane, 2026-11-09 (Phase 8 of feature_enhancement.md; the owner asked the feature lane to do the ui items)

- `components/scope/scope-dashboard.tsx`: Table | Chart switch (a button group, `aria-pressed`, the pressed one
  in the default style -- "secondary" failed contrast in Corporate) kept in the address as `view=chart`; one `Bars`
  component for categories, activities and units; a trend table in Table mode. `lib/scope/display.ts` `barValue`.
- `components/search/global-search.tsx` (new) in `components/shell/top-bar.tsx`; `components/shell/admin-nav.ts`
  now also holds the /app list (`workspaceNavFor`), used by `app/app/layout.tsx` and the search.
- `components/chat/chat-launcher.tsx`: "Ask AI" pill (`.ask-button`) and `.ask-fab`; styles in `app/globals.css`
  (`--ask-accent`, the header foreground in the Special theme).
- Reports: `report-form.tsx` (Template select), `runs-table.tsx`, `[reportId]/page.tsx` (Excel download).
  `app/admin/users/page.tsx` and `users-manager.tsx`: `?q=` fills the search box.
- Landing: `performance-section.tsx` (charts from data), `traceability-section.tsx` (top-aligned, sticky points),
  `hero-section.tsx` (phone buttons, ticked points, balanced eyebrow), `process-steps-section.tsx` (step number
  contrast). The hero card deck is unchanged.

## Feature lane, 2026-11-09 (Phases 9 and 10 of feature_enhancement.md)

- `components/shell/sidebar.tsx`: no rail below 768px; `BottomBar` (four pages and Menu, short labels); the drawer
  is the existing expanded sidebar. `app/admin/layout.tsx`, `app/app/layout.tsx`: `pb-24` on phones.
  `components/shell/top-bar.tsx`: the product name on phones, tighter gaps. `app/globals.css`: toasts above the
  bar on phones. `components/chat/chat-launcher.tsx`: the floating Ask hidden on phones.
- `registry/magicui/pointer.tsx`: emulated mouse events after a touch are ignored (requirement 8).
- `components/upload/drop-zone.tsx`: "Take a photo" (`capture="environment"`) on coarse pointers.
  `components/document-viewer/document-viewer.tsx`: 50% zoom below 640px until the person zooms.
- `app/manifest.ts`, `public/sw.js`, `public/offline.html`, `public/icons/*`, `app/favicon.ico`,
  `components/shell/service-worker.tsx`, root `layout.tsx` metadata and viewport; `next.config.ts` (shared): no
  caching of `/sw.js`.
- `app/app/help/page.tsx` (new), `components/shell/admin-nav.ts` (Help in both lists; the /app list moved here as
  `workspaceNavFor`).

## Feature lane, 2026-11-11 (owner's page feedback; A50, `.grill/page-feedback-2026-11-11-decisions.md`)

Built by the feature session at the owner's request; no restyle.
- `components/ui/sheet.tsx` (shared by every side panel): Expand from 768px up to the whole window (was 1900px and a
  large window), Esc collapses before it closes, a drag handle on the inner edge (`role="separator"`, ← / → steps,
  double-click resets), the width remembered per page in `localStorage` (`sheet-width:<path with ids removed>`;
  `panelKey` names a panel when a page has several kinds). Docked panels keep their docking.
- `components/ui/status-badge.tsx`: `whitespace-nowrap shrink-0` (a badge no longer breaks onto two lines).
- `components/records/records-explorer.tsx`: filter bar (no Document type, scope-grouped Activity, Uploaded from /
  to, Reset filters button replacing the floating Clear filters link, a wider Period box), submitter role line.
- `app/admin/audit-trail/audit-filters.tsx` (new, replaces the form in `audit-view.tsx`): linked, auto-applying
  filters and the suggestion list (a combobox with `role="listbox"`).
- `app/admin/deadlines/reminders-panel.tsx` (Run now removed, status badge), `deadlines-client.tsx` (who can
  submit, No one to submit, Not submitted), `app/admin/conversion-factors/review-panel.tsx` (year list from the
  server).
- `components/upload/split-review.tsx`: Undo / Redo toolbar and shortcuts. `components/document-viewer/
  document-viewer.tsx`: opt-in `arrowKeys`, and an exported `isTyping(target)`.

## Feature lane, 2026-11-11 (Upload description and expected submissions; A51, D53)

- `app/app/upload/page.tsx`: the page is `max-w-5xl` and renders `components/upload/upload-workspace.tsx` (new):
  the form beside `expected-progress.tsx` (new, a 20rem column from `lg`, stacked below on smaller screens).
- `components/upload/upload-form.tsx` (shared): an optional Description textarea under the drop zone, and two
  optional callbacks (`onUploaded`, `onTargetChange`).
- `components/verification/description-editor.tsx` (new, shared folder) on `app/app/verify/[documentId]/page.tsx`;
  one line each in `components/records/record-drawer.tsx`, `records-explorer.tsx` and `app/app/submissions/page.tsx`.

## Feature lane, 2026-11-11 (factors per financial year; A52, D54)

- `app/admin/conversion-factors/factors-manager.tsx`: the date fields and the optional financial-year select are
  replaced by an "Effective for" fieldset (From FY, To FY); `YearsCell` shows a version's years and "inherited since".
  `review-panel.tsx`: "Inherited from FY …".

## Feature lane, 2026-11-11 (eye button on Verify; A53, D55)

- `components/verification/verify-split.tsx`: the viewer sits in a column with the eye button and colour key under
  it. `components/document-viewer/document-viewer.tsx`: `showRegions` prop, `Region.tone`, exported `REGION_TONE`.

## Feature lane, 2026-11-11 (Carbon Analytics by project; A54)

- `app/admin/carbon-analytics/recommendations.tsx`: a "Which project emits the most?" button on each suggestion
  card and a ranked list with share bars (the top one in the error colour).

## Feature lane, 2026-11-11 (Request a demo; A55, D56)

- `components/landing/demo-request.tsx` (new): the button, the form dialog and the player. `navbar.tsx`,
  `hero-section.tsx`, `cta-footer-section.tsx`: the `<a href={DEMO_HREF}>` links became `DemoRequestButton` with the
  same classes; `links.ts` lost `DEMO_HREF`.
- `app/admin/demo-requests/*` (new page), `components/shell/admin-nav.ts`: "Demo Requests" (Super Admins).

## Feature lane, 2026-11-11 (Ctrl + scroll zoom)

- `components/document-viewer/document-viewer.tsx` (shared by every document view): Ctrl/Cmd + mouse wheel (and a
  trackpad pinch) over the document zooms it through the existing zoom steps; the browser page is not zoomed.
  The zoom buttons' tooltips name the shortcut. Owner's request. Follow-up the same day: Ctrl + wheel works anywhere
  on the viewer; the first zoom fixes the viewer's height so only the document grows inside it (several viewers had
  no fixed height and grew with the zoom); click and drag moves around the document (a press under 5 px is still a
  click), `cursor-grab` / `cursor-grabbing`.

## Feature lane, 2026-11-11 (new logo, owner's request)

- From the owner's `EmeilSG_Logo/` folder (three SVGs; copies without their embedded content-credential block are in
  `public/brand/`: `emeilsg-icon.svg`, `emeilsg-wordmark.svg`, `emeilsg-logo.svg`).
- `components/brand/logo-mark.tsx`: `LogoMark` now draws the fanned-documents mark; new `LogoWordmark` (the coloured
  "EmeilSG"). Landing navbar and the sign-in header show mark + wordmark; the sidebar header shows the mark beside the
  name (the wordmark's indigo would not read on the dark sidebar).
- `app/icon.svg`, `app/favicon.ico` (16/32/48) and `public/icons/*` (192, 512, maskable 512 on white, Apple touch
  180 on white) regenerated from the new mark with sharp.
- Follow-up the same day (owner: bigger logo, the name as the wordmark): landing mark 48 px with a 36 px wordmark;
  sign-in header 48 / 32 px; the sign-in and auth cards' small "EmeilSG" label is the wordmark (name kept for
  screen readers); the sidebar header and the phone top bar show mark + wordmark on a white badge so the indigo and
  red read on every theme's dark or coloured bar.
- Page feedback the same day (sidebar): no white badge. The mark and the wordmark are two separate SVGs; in the
  sidebar and the phone top bar the wordmark is `LogoWordmarkMono` (`components/brand/logo-wordmark-mono.tsx`,
  generated from `public/brand/emeilsg-wordmark.svg`, `fill="currentColor"`) in the bar's own foreground colour, so
  it matches the Special, Corporate and Dark themes. The coloured wordmark stays on the light landing and sign-in
  pages.
- Owner's instruction the same day: the logo and title "as they are": the sidebar and the phone top bar use the
  original coloured wordmark beside the mark, no badge, no recolouring (`LogoWordmarkMono` removed). Known: on the
  Corporate sidebar "meil" (indigo) does not show, and on the Special theme's crimson bars "E" and "SG" barely show.
- Then (owner: "meil" merges with the background): the sidebar and phone top bar use `LogoWordmarkOnBar`
  (`components/brand/logo-wordmark-on-bar.tsx`, generated from the wordmark file): the title as designed, with only
  "meil" (indigo in the file) in the bar's text colour. "E", "SG" and the leaf stay red. Light pages keep the file
  unchanged.
- Then (owner: every letter of the title white): `LogoWordmarkOnBar` draws every letter and the leaf in the bar's
  text colour: white on all sidebars and on the coloured top bars; dark on the Corporate theme's white phone top bar.
- Then (owner: the icon looked as small as the title): the mark is larger beside the title: sidebar 48 px (gap 4 px),
  phone top bar 44 px, landing navbar and sign-in header 56 px.

## Feature lane, 2026-11-11 (the chatbot is Tracey, owner's request)

- `components/brand/tracey-mark.tsx` (new): `TraceyMark`, an indigo chat bubble drawn like the EmeilSG mark (same
  gradient, the three bars, the red tick circle), and `TraceyName` (red "T" on light backgrounds; all letters in the
  bar's colour with `onBar`).
- `components/chat/chat-launcher.tsx`: "Ask AI" -> "Ask Tracey" with the mark (the Sparkles icon is gone); the
  floating button shows the mark; the panel bar shows the mark on a white circle, "Tracey" and "ESG data analyst"
  beneath; screen-reader names, the introduction ("I'm Tracey. Ask me about …") and the question box say Tracey.
- `lib/chat/orchestrate.ts`: the instructions start "You are Tracey, the ESG data analyst inside EmeilSG"; she
  answers to her name. `tests/e2e/ui-phase8.mjs` expects "Ask Tracey".

## 2026-11-12 — Mobile view refinements on Landing Page (owner feedback)

Feedback on mobile viewport (427×952):
- **Navbar mobile reorganization (`components/landing/navbar.tsx`):**
  - Moved the mobile hamburger button to the far left of the navbar, using the requested Font Awesome 3-bar SVG icon (`viewBox="0 0 640 640"`, sized to `h-6 w-6`).
  - Positioned the brand mark and wordmark beside the hamburger on the left.
  - Removed "Request a demo" button from the mobile navbar (`hidden sm:inline-flex`).
  - Replaced it with a prominent, larger "Sign in" button (`px-5 py-2 text-sm font-bold bg-[#E91029] text-white`) on the right side of the navbar.
  - In the expanded mobile drawer, both "Sign in" (red) and "Request a demo" are available as full-width actions.
- **Admin & authenticated top-bar / mobile navigation refinements (`/admin`, `/app`):**
  - **Menu button & EmeilSG title:** Mobile top-left corner features the menu trigger button and ONLY the EmeilSG title text SVG (`EmeilSG_title.svg`, `LogoWordmark` with red and indigo fills), with `LogoMark` removed per owner feedback.
  - **Profile & Log out:** Consolidated the separate "Log out" button into a unified `ProfileMenu` popover attached to the profile avatar/button (`components/shell/profile-menu.tsx`), containing user details, "View profile", and "Log out".
  - **"Ask Tracey" AI button:** Removed text button from mobile top bar (`hidden md:inline-flex`) and enabled the hovering floating action button in the bottom-right corner (`ask-fab fixed right-4 bottom-20 z-40`) on mobile screens.
  - **BottomBar:** Cleared the 5th "Menu" tab so the primary quick action links evenly share the bar.
- **Landing page mobile responsiveness:**
  - `HeroSection`: Reduced top and bottom padding (`pt-8 sm:pt-14`), tightened mobile heading size (`text-3xl sm:text-5xl`), and ensured capability cards fit within narrow mobile viewports.
  - `HeroCapabilityCard`: Adjusted card height and bounds for mobile screens to eliminate horizontal scroll anomalies.
  - `TrustBadgesSection`: Converted grid to `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5` so badges have ample text width and don't cramp.
  - `ProductInActionSection`: Converted the dark mock sidebar to a horizontal scrollable strip on mobile (`md:hidden`) with no scrollbars, preventing an excessively tall stack before the document preview.
  - `InfrastructureSection`: Added touch swipe handlers (`onTouchStart`/`onTouchEnd`) for mobile card switching and responsive card heights.
  - General section spacing: Optimized `py-14 sm:py-20 px-3 sm:px-6 lg:px-8` across all sections to improve mobile readability and eliminate vertical dead space.

## 2026-11-13 — Mobile view top-bar polish on `/admin` and `/app` (owner feedback)

Feedback on mobile viewport (427×952) for "fix this bar at the top":
- **Sticky top-bar header (`components/shell/top-bar.tsx`):** Added `sticky top-0 z-30 w-full bg-header/95 backdrop-blur` so the top bar remains pinned while scrolling through admin tables and dashboard cards.
- **EmeilSG title text prominence (`components/brand/logo-mark.tsx`, `components/shell/top-bar.tsx`):**
  - Added `width="556" height="130"` and `aspect-[556/130]` directly on `LogoWordmark` SVG to prevent intrinsic ratio collapse in flexbox layouts.
  - Sized wordmark to `h-8 w-auto shrink-0` next to the menu trigger for clear legibility and visual weight.
- **Menu icon consistency (`components/shell/sidebar.tsx`):** Updated `MobileMenuTrigger` to use the owner-supplied Font Awesome solid 3-bar SVG (`viewBox="0 0 640 640"`), matching the landing page navbar.
- **Touch target uniformity across right-side controls:**
  - `GlobalSearch`: Configured `size-9 p-0 shrink-0 sm:size-auto sm:h-8 sm:px-2.5 sm:gap-2` so on mobile screens it displays as a clean 36×36px square button matching `ThemeToggle` and `NotificationBell`.
  - `ProfileMenu`: Configured trigger as `size-9 p-0 shrink-0 sm:size-auto sm:h-8 sm:px-2 sm:gap-1.5` with centered 28px avatar on mobile, expanding to display name on larger viewports.

## 2026-11-13 — Disable desktop view when opened in mobile (owner feedback)

Feedback: "When i open the app in mobile in many time it open in deskotop view (desktop view shoudld be off when the website is open in mobile)"
- **Viewport tag explicit scaling (`app/layout.tsx`):**
  - Updated `viewport` export to explicitly set `width: "device-width", initialScale: 1, maximumScale: 5` alongside `viewportFit: "cover"`, preventing mobile browsers from defaulting to a 980px unscaled desktop layout canvas.
- **Synchronous mobile detection boot script (`app/layout.tsx`):**
  - Added `MOBILE_BOOT_SCRIPT` running in `<head>` before first paint. Detects smartphone devices via touch capabilities (`navigator.maxTouchPoints > 0`) combined with physical screen dimensions (`Math.min(screen.width, screen.height) < 768`) and mobile user agent patterns.
  - Dynamically enforces `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover">` and marks `<html>` with `.is-mobile-device`. This forces mobile viewport scaling even if the mobile browser had "Desktop site" toggled or cached.
- **Shell layout overrides for mobile phones and landscape phones (`app/globals.css`):**
  - Enforced that for `html.is-mobile-device` and for phones in landscape (`@media (max-height: 500px) and (pointer: coarse)`):
    - Desktop sidebar rail is hidden (`[data-shell="sidebar-rail"]:not([data-expanded="true"]) { display: none !important; }`).
    - Sidebar placeholder width is zeroed (`[data-shell="sidebar-placeholder"] { display: none !important; width: 0 !important; }`).
    - Mobile bottom navigation bar is always active (`[data-shell="bottom-bar"] { display: block !important; }`).
    - Mobile header menu button + title wordmark are always active (`[data-shell="mobile-top-bar"] { display: flex !important; }`).
    - Chat floating button (`ask-fab`) is always active while desktop top-bar chat button is hidden.
  - Standard desktop monitors and tablets (width >= 768px and height >= 768px with fine pointer) remain on the standard desktop/tablet rail.

## 2026-11-13 — Tracey AI floating button repositioning and mobile horizontal scroll prevention (owner feedback)

Feedback: "the teacy ai icon is not hovering at their right place both in the desktop and mobile view and fix all horizontal scroll in the website in the mobile view"
- **Tracey AI floating action button (`components/chat/chat-launcher.tsx`, `components/shell/top-bar.tsx`, `app/admin/layout.tsx`, `app/app/layout.tsx`):**
  - **Root cause:** `<ChatLauncher />` was previously mounted inside `<header className="... backdrop-blur">`. Under W3C CSS specifications, `backdrop-filter` creates a new containing block and stacking context for all descendants—including elements with `position: fixed`—causing the fixed button to be positioned relative to the 56px header rather than the viewport window.
  - **Fix:** Moved `<ChatLauncher />` directly to root layout containers in `AdminLayout` and `WorkspaceLayout`, outside of any backdrop-filter containing blocks.
  - **Unified Floating Action Button:** Configured `.ask-fab` to be the primary floating launcher across both desktop and mobile:
    - Desktop: `md:bottom-6 md:right-6 md:size-14` (56×56px, 24px from bottom and right screen edges).
    - Mobile: `right-4 bottom-[calc(4rem+0.75rem+env(safe-area-inset-bottom,0px))] size-12` (48×48px, 16px from right, hovering 12px directly above the fixed bottom navigation bar).
    - Removed the static button inside top-bar header on desktop to maintain a unified floating experience.
- **Mobile horizontal scroll elimination (`app/globals.css`, `app/admin/layout.tsx`, `app/app/layout.tsx`):**
  - Added strict global overflow rules on `html` and `body`: `max-width: 100vw; overflow-x: hidden;`.
  - Added `max-w-full overflow-x-clip` on root flex containers and main content elements in `AdminLayout` and `WorkspaceLayout`.
  - Decoupled `BottomBar` from inside `[data-shell="sidebar-placeholder"]` in `components/shell/sidebar.tsx`, ensuring proper display and zero layout disruption.
  - Verified across all core pages (`/admin`, `/admin/submissions`, `/admin/approval-queue`, `/admin/data-explorer`, `/admin/reports`, `/admin/carbon-analytics`, `/admin/users`, `/admin/organization`, `/admin/audit-trail`, `/app`, `/app/submissions`, `/app/upload`, `/app/notifications`, `/app/activity`, `/login`): `scrollWidth === clientWidth` on mobile viewport (427×952).

## 2026-11-13 — Unfreeze table columns on mobile view and enable free horizontal scrolling (owner feedback)

Feedback on `/app/submissions` (viewport 427×952): "this column is frixed it should not in the mobile view , also all the tables should be horizontally scrollable , without any column fixed"
- **Unpinned columns on mobile (`app/globals.css`):**
  - **Root cause:** `.overflow-x-auto > table > :is(thead, tbody) > tr > :first-child` previously had unconditional `position: sticky; left: 0; z-index: 1;`. On narrow mobile screens (390-427px), this locked the first column in place, obscuring subsequent columns and disrupting natural swipe scrolling.
  - **Scoped to Desktop:** Constrained the sticky first column rule to `@media (min-width: 768px)` only (preserving UI brief §16 pinned column for wide desktop viewports).
  - **Enforced Mobile Freedom:** Under `@media (max-width: 767.98px)`, `html.is-mobile-device`, and landscape phones (`@media (max-height: 500px) and (pointer: coarse)`), explicitly set `.overflow-x-auto > table > :is(thead, tbody) > tr > :first-child` and all `table :is(th, td)` to `position: static !important; left: auto !important;`.
  - **Natural Horizontal Scrolling:** Enforced `width: max-content; min-width: 100%;` and `-webkit-overflow-scrolling: touch;` on `.overflow-x-auto > table` for mobile viewports, allowing all tables to expand to their natural readable width and scroll horizontally as a cohesive unit with zero frozen columns.

## 2026-11-13 — Full site mobile responsiveness polish & field row card layout (owner feedback)

Feedback: "make the website responsivness in mobile view for every page" (with uploaded screenshots of `/app/verify/[documentId]` and `/admin/approval-queue` drawer).
- **Verify Document field rows (`components/verification/field-row.tsx`):**
  - **Problem (Image 1):** Field row previously forced a rigid 3-column inline flex layout (`w-36` label, `flex-1` value, `w-28` confidence score, plus `pl-[9.75rem]` actions). On narrow phone viewports (390–427px), this left only ~80-110px for extracted values, causing text ("Not found — enter it from the document", dates, and invoice numbers) to break character-by-character into single syllables across 5–9 lines.
  - **Mobile Card Layout (`< sm`):** Re-architected `FieldRow` on mobile screens to stack vertically:
    - Header row: Field label on left, confidence badge ("99%", "No OCR value") on right.
    - Value row: Full width (`w-full`) input/button with clean border and padding, accommodating long invoice numbers, dates, and placeholder messages on 1 line without word fragmentation.
    - Action row: Removed the 156px indent (`pl-0 sm:pl-[9.75rem]`) so errors, diagnostics, and "Looks correct" buttons utilize the full width of the card.
    - Desktop (`>= sm`) retains the exact 3-column table alignment.
- **Verify workspace split height on mobile (`components/verification/verify-split.tsx`, `components/verification/verify-workspace.tsx`):**
  - Adjusted `DocumentViewer` height on mobile to `h-[340px] sm:h-[460px] xl:h-auto xl:max-h-[calc(100vh-10rem)]` so the document preview sits comfortably above the fields without pushing them off-screen.
  - Removed inner nested viewport clamping (`xl:max-h-[calc(100vh-10rem)]`) on `VerifyWorkspace` on mobile, avoiding nested scroll traps.
- **Record Detail / Sheet drawer full-width on mobile (`components/ui/sheet.tsx`, `components/approvals/approval-queue.tsx`, `components/records/record-drawer.tsx`):**
  - **Problem (Image 2):** `SheetContent` previously had `data-[side=right]:w-3/4`, restricting drawers to 75% width on mobile and rendering them as narrow cards with huge empty margins, causing step tracker tags ("Checked by uplo...") and validation rows to clip.
  - **Full-Width Mobile Drawers:** Updated `SheetContent` to `data-[side=right]:w-full data-[side=right]:sm:w-3/4` and `data-[side=left]:w-full data-[side=left]:sm:w-3/4`, giving detail sheets 100% of the mobile viewport.
  - Made `StageTracker` steps `shrink-0 whitespace-nowrap` to prevent awkward word clipping.
  - Sized document previews inside sheet drawers on mobile to `h-[320px] sm:h-[480px] @4xl:h-[calc(100vh-9rem)]`.
- **Sitewide Responsiveness Verification:**
  - Automated headless browser scan tested all 37 pages on mobile viewport (427×952):
    - All 37 pages passed with zero sideways scrolling (`scrollWidth === clientWidth`).
    - Zero fixed/sticky cells on mobile across all tables.

## ui, 2026-11-12 (Help page: animated questions; owner's request)

- `components/help/faq.tsx` (new, client): `FaqList` and `FaqItem` replace the `<details>` blocks in the Help page's
  Questions section. An answer opens and closes with a height and fade animation (`motion/react`, 0.26 s), the
  chevron turns, the open item takes a tinted background, and the questions arrive one after another the first time
  the list scrolls into view. Each question is a button in an `h3` with `aria-expanded` / `aria-controls`; the
  answer is a labelled region. With reduced motion the timings are zero and the slide is dropped; the markup is the
  same either way (rendering it differently caused a hydration error, caught in the browser check).
- `app/app/help/page.tsx`: uses the new components; three questions added (own account, where the document is read,
  the same bill twice). No migration, no new dependency, no server procedure.
- Checked: format, lint, typecheck, web unit tests; the component in Chromium on a temporary page (since removed) at
  1280 and 390 px and with reduced motion: opens, closes, Enter key, no sideways scroll, no page error. **Not run:**
  the Help page itself signed in (no database in that session), the three themes, the production build, the
  accessibility suite.

## ui, 2026-11-12 (Help page: start-here cards, animated process flow, website blueprint; owner's request)

- `components/help/reveal.tsx` (new, client): `Reveal` / `RevealItem`, the same in-view stagger as the questions,
  for any group on the Help page. Zero timings and no slide with reduced motion; same markup either way.
- `app/app/help/page.tsx`: three "start here" cards under the contents list (uploading, reviewing or following
  records, finding your way), by audience; the process-flow steps (`Flow`) arrive one after another; "Where things
  are" is now **Blueprint of the website**: the three parts of the site as a flow (public pages, sign in, Workspace
  or Administration), then the person's own pages grouped as the menu groups them, each with one line on what it is
  for (`PAGE_PURPOSE`, `AREA_OF` in the page; a new sidebar page needs a line in both); the roles table has a
  "Works in" column (Administration for `admin` and `org_admin`, Workspace otherwise).
- No migration, no new dependency, no server procedure.
- Checked: format, lint, typecheck, web unit tests; the page rendered in Chromium on a temporary copy with stand-in
  session and settings (since removed), as a Super Admin and a contributor at 1280 px, at 390 px and with reduced
  motion: nothing left hidden after scrolling, no sideways scroll, no page or console error. **Not run:** the real
  page signed in against a database, an Administrator's view, the three themes, the production build, the
  accessibility suite.

## ui, 2026-11-12 (Documentation on the landing page, not in the signed-in space; owner's request)

- `components/landing/documentation-section.tsx` (new, server) and `components/landing/docs-tabs.tsx` (new, client):
  a **Documentation** section (`#docs`) on the landing page, before the questions, written as an end-user manual in
  four tabs: Getting started (invitation to first upload), Roles (what each does and where it works), Checkpoints
  (the six checks a figure passes) and Technical details (version, the portal, the backend, the document reader,
  Docker, calculations, email, the assistant), all in plain language with no setup steps. The portal version and
  the Next.js / React versions are read from `package.json` and the engine version from `lib/calculation/engine.ts`,
  so they follow the code. Limits an administrator can change (invitation lifetime, session length, upload size)
  are described without a number, since a public page cannot read the settings.
- The tabs are a real tab list (arrow keys, Home, End; one panel shown), with a sliding pill and a fade between
  panels; `MotionProvider` drops the movement for reduced motion. The roles are a list, not a table: the global
  first-column table rule made the header unreadable on the light landing page.
- `components/landing/links.ts`: a sixth navigation item, "Docs". `landing-page.tsx`: the section added.
- `app/app/help/page.tsx`: the three "start here" cards added earlier the same day are removed again (the owner
  wants the documentation on the landing page). The animated questions, process flow and blueprint stay.
- No migration, no new dependency, no server procedure.
- Checked: format, lint, typecheck, web unit tests; the landing page in Chromium on a dev server at 1440 and 390 px
  and with reduced motion: every tab selects, one panel at a time, Home key works, no sideways scroll, no page or
  console error; screenshots looked at. **Not run:** the production build, the accessibility suite, the public
  wording against `COMPLIANCE_AUDIT_2026-10-12.md` (the claims made are the ones the README and audits already
  state: own OCR worker, private storage, server-side checks).

## feature, 2026-11-12/13 (Upload by rows; built by the feature lane at the owner's request, A60)

- `components/upload/row-upload.tsx` (new) replaces the drop zone on the Upload page; `upload-workspace.tsx` shows it
  with the expected-submissions list below it (the one-file form stays for "Replace a failed document");
  `app/app/upload/page.tsx` widens to `max-w-7xl` and passes the draft. Rows are cards with a responsive grid
  (four columns at `lg`, two at `sm`, stacked on phones) and visible small labels on every input.
- `components/upload/split-review.tsx`: "Typed on the Upload page as" per bill, value boxes for a bill nobody typed,
  and a "Typed but not matched to a bill" list with "Not in this upload".
- `components/verification/field-row.tsx`: a typed-value note under a field (match / not read / mismatch with
  "Use the document's value" and "Keep my value"); `verify-workspace.tsx`: a panel for a bill of a typed total.
- Status colours use the status tokens on tinted surfaces with `text-foreground` (rule above).
- Checked: format, lint, typecheck, unit, production build, the procedures end to end. See CONTEXT.md for the
  browser check.
- Second round (2026-11-13): a Manual / Automatic switch (a radio group) at the top of Upload; the row's evidence
  is its last column; with Another bill in this file the evidence block sits above the bills and each bill line has
  Page from / to; an eye button on each attached file and on each recorded bill opens a preview dialog
  (`DocumentViewer`). Checked in Edge at 1440 and 390 px with axe (`ui-row-upload.mjs` 30/30).
