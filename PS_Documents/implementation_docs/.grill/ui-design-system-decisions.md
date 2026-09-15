# Grill: 04_UI_UX_DESIGN_BRIEF.md design-system decisions
Date: 2026-09-16

## Intent
Produce `04_UI_UX_DESIGN_BRIEF.md` — a complete, implementable visual design system and key-screen spec for the PS-08 evidence-first ESG/BRSR platform, consistent with `Master_Approach.md`, `01_PRD.md`, and `03_APP_FLOW.md`.

## Constraints
- `02_TRD.md` locked Next.js/TypeScript but left the styling implementation vehicle undecided — this had to be resolved before the brief could be written as anything more than abstract prose.
- Must express the system as literal, implementable tokens (not just descriptive language), since the team is time-constrained and shouldn't need a second translation pass.
- Must support three named themes with a working switcher, per explicit user direction, while keeping one shared UX structure (only tokens change between themes).

## Key decisions
- Decision: Design system implemented as **Tailwind CSS + shadcn/ui** (CSS custom properties per theme, Tailwind theme tokens, Radix-based shadcn components). Reason: fastest path to an accessible, professional component set given the team's TS-heavy skill profile and hackathon timeline; avoids hand-building modals/drawers/tables/keyboard-nav from scratch. Alternative considered: framework-agnostic hex/px prose — rejected as less actionable; other libraries (MUI, Ant Design, Chakra) — not raised as a real alternative since the user confirmed Tailwind + shadcn/ui directly.
- Decision: Palette is **not** a guess at MEIL's actual brand guidelines (no confirmed access) — resolved instead by the user supplying three complete, pre-designed themes: **Theme 1 "Marple / Warm Modern ESG"** (default), **Theme 2 "MEIL Corporate / Official"** (explicitly labeled a UI approximation from a public website reference, not official brand spec), **Theme 3 "Dark Enterprise / Premium ESG"** (dark mode). Reason: user provided these directly and fully specified (hex values for header/sidebar/dashboard/tables/charts/modals/footer per theme) — this superseded my own proposed default-palette recommendation.
- Decision: Theme switcher is a **per-user preference** (not an Admin-controlled org-wide override), selectable by any user at any time, persisted per-user (e.g. via the Profile page already spec'd in `03_APP_FLOW.md`). Reason: simpler to build (one switcher, one persistence mechanism), and still lets any individual user (including for a MEIL-facing demo) switch into Theme 2 without needing Admin involvement or affecting other users' sessions.

## Surfaced assumptions
- The brief's request for "Scope 1/2/3 visual differentiation" isn't explicitly defined in any of the three supplied themes (they define dataset/accent colors generically, not scope-specific ones) — resolved by mapping Scope 1/2/3 consistently onto each theme's existing "primary/secondary/third dataset" colors, so the mapping is consistent across all three themes rather than invented per-theme.
- Some of the supplied accent colors (coral #FF6766, peach #FFB173, MEIL red #EF102D) are borderline-to-failing for white-text-at-small-sizes under WCAG AA — flagged and handled with an explicit usage rule (reserve for large/bold text, icon fills, or chip backgrounds paired with dark text) rather than silently ignoring the accessibility requirement the brief itself asks for (item 47).
- Typography, iconography, and spacing/radius/shadow scale were not specified by the user in this session — decided directly as part of the brief (Inter for UI text, a monospace for data/IDs, Lucide icons, a restrained radius/shadow scale matching the "avoid decorative" direction) since these are low-risk, standard craft decisions for a senior product designer to make without further user input.

## Out of scope
- No attempt to verify or source MEIL's actual official brand colors — Theme 2 remains explicitly labeled as an approximation, not a claim of accuracy.
