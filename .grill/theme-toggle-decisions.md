# Grill: Theme toggle moved to the top bar; default changed

Date: 2026-09-25

Requested directly by the owner mid-session, outside the phase sequence.

## Intent

Move the theme switcher out of Profile and into the top bar as a compact toggle; change the default theme
and relabel the three options to match how the owner actually describes them by colour, not by the
Warm/Corporate/Dark names chosen in Phase 19.

## Key decisions

- Decision: **`theme-2` (blue/red/white, labelled "Corporate") becomes the default**, not `theme-1`
  (peach/coral, "Warm") — schema deviation D23, migration `0031` changes `users.theme`'s column default.
  `theme-1` is relabelled "Special" (no longer "Default"); `theme-3` ("Dark", brown/maroon-on-black) is
  unchanged — the owner's "brown one is for the dark theme" already matched what Phase 19 shipped.
- Decision: **`app/globals.css`'s `:root` fallback (the pre-JS first-paint colours) moves from `theme-1` to
  `theme-2`**, so the boot script's job — never flashing the wrong default — still holds with the new
  default. Only the `:root,` selector binding moved; no colour value changed.
- Decision: **a new compact component**, `components/shell/theme-toggle.tsx` (three small colour-swatch
  buttons, `role="group"`, `aria-pressed` per option), replaces `components/profile/theme-picker.tsx` in
  the top bar (`TopBar`, both shells) instead of Profile's "Appearance" section, which is removed. Same
  underlying behaviour as before (`applyTheme` + `setThemeAction`, applies immediately, rolls back on a
  failed save) — only the UI shape and location changed.

## Out of scope

- Existing accounts already on `theme-1` are not migrated to `theme-2` — the default only affects newly
  provisioned accounts (see D23).
