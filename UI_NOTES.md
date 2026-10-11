# UI notes

Decisions and deviations recorded by the **ui** role (see `CLAUDE.md`, rule 5); the feature role folds them
into `PROGRESS.md`, `CONTEXT.md` and the deviation files.

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
