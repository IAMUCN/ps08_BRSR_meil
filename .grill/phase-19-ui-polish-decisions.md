# Grill: Phase 19 — UI polish and responsive behavior

Date: 2026-09-22

## Intent

Make every existing screen match the design system: the per-user theme switcher with all three themes,
responsive behavior at the UI brief §16 breakpoints, every empty/loading/error/confirmation state from the
App Flow, the §18 consistency rules and the §17 accessibility baseline (`06_IMPLEMENTATION_PLAN.md` Phase 19).
No new pages.

## Key decisions

- Decision: **the theme is stored on the user** — a `users.theme` column (`theme-1` default, schema
  deviation D20), changed only through the server (audited `user.theme_changed`). The browser keeps a copy in
  localStorage, applied by a tiny inline script before first paint so a page never flashes the default; the
  signed-in shell re-applies the account's value on load, so the choice follows the user to another device.
  Alternative: browser storage only (doesn't follow the user, short of UI brief §4).
- Decision: **tokens that fail WCAG AA for their role are adjusted.** Supplied brand colours keep their brand
  uses (sidebar, headers, badges, charts); where a token fails for its role — body and muted text 4.5:1,
  focus rings and control boundaries 3:1 — it moves to the nearest passing shade, and each change is
  recorded in `apps/web/APP_FLOW_DEVIATIONS.md` with before/after ratios. Alternatives: never change a hex and
  special-case usage in code; report only.

## Surfaced assumptions

- Below 1280px the sidebar collapses to an icon rail (labels as accessible names and tooltips) with a
  toggle to expand it; the same rail serves mobile, which UI brief §16 leaves functional but unoptimized.
- Loading states are route-level skeletons in the shape of a page header, cards and a table; error states
  are route-level boundaries that say what happened and offer Try again (a server error is retriable).
- Scope 1/2/3 use the §6.11 icons (flame, zap, link-2) with their scope colour and label everywhere.

## Out of scope

- The global org/period context switcher (still carried in the URL by the Control Tower) and new pages
  (Submission History, Settings).
