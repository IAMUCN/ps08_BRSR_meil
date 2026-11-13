# UI/UX Design Brief
## PS-08 — Evidence-First ESG/BRSR Reporting Platform (EmeilSG)

**Document ID:** 04_UI_UX_DESIGN_BRIEF.md
**Version:** 1.0
**Status:** Draft for review
**Source of truth, in order:** `Master_Approach.md` → `01_PRD.md` → `03_APP_FLOW.md`. This document defines the visual design system and key-screen treatment for the pages, journeys, and states already specified in `03_APP_FLOW.md` — it does not redefine routes, API dependencies, or navigation logic; see that document for those.

**Full reasoning trail:** `.grill/ui-design-system-decisions.md`.

---

## 0. Decisions This Document Makes (read first)

1. **Implementation vehicle: Tailwind CSS + shadcn/ui.** Every token below is written as a literal CSS custom property / Tailwind theme value, not abstract description — this is meant to be pasted into a config, not re-translated.
2. **Three themes, one UX structure.** Theme 1 (Marple / Warm Modern ESG) is the default. Theme 3 (Dark Enterprise / Premium ESG) is dark mode. Theme 2 (MEIL Corporate / Official) is a third, equally-selectable option — explicitly a UI approximation from a public reference, not a confirmed brand spec. Only color tokens change between themes; layout, component structure, and interaction patterns are identical across all three.
3. **The theme switcher is a personal, per-user preference** — available to every user in Profile (per `03_APP_FLOW.md` §2.3), not an Admin-controlled org-wide setting.
4. **Icon set: Lucide** (the standard shadcn/ui pairing) — consistent 1.5px stroke weight throughout.
5. **Typography: Inter for UI text, a monospace face for data/IDs/factor values.** Not specified by the source documents; decided here as standard, low-risk craft choices.
6. **Accessibility baseline: WCAG 2.1 AA.** Stated explicitly rather than left implicit, since several of the supplied accent colors need usage rules (not just presence) to meet it — see §6.5.

---

## 1. Design Philosophy

The interface's job is to make a claim defensible: *this number came from that document.* Every design decision should reinforce traceability and calm operational control, not visual excitement. The product succeeds when an auditor, a judge, or a field user all separately conclude "this looks like something a large organization would actually trust with its regulatory reporting" — not "this looks like a slick demo."

Concretely: prioritize legibility of dense data over visual flair, make status and confidence always visible (never hidden behind a click), and never let a decorative element compete with an evidentiary one (a document preview, a confidence score, an audit trail entry).

---

## 2. Brand/Product Personality

If the product were a person: a meticulous compliance officer who is also genuinely good at their job — precise, unhurried, quietly confident, never flashy. Not a "move fast" consumer startup persona; not a cold, bureaucratic enterprise-software persona either. The warmth in Theme 1 exists specifically to avoid the second failure mode — this is a tool people use every month, not a form they dread.

---

## 3. Aesthetic Direction

Closer to Linear, Stripe Dashboard, or Vercel's dashboard than to SAP Fiori or a generic admin template — information-dense but breathable, with real whitespace discipline, not "enterprise = cramped." Closer to a financial/audit tool than a marketing dashboard: **no huge vanity numbers, no gauge charts, no gaming-style progress rings** unless they're carrying real, specific meaning (e.g., BRSR Readiness %, always labeled, always clickable, never decorative).

Explicitly avoided, per source direction: gradients as decoration, motion for its own sake, "AI product" visual clichés (glowing orbs, purple-blue gradients, sparkle icons), oversized stat numbers with no context, chart-first dashboards that bury the underlying table.

---

## 4. Multi-Theme System Overview

| | Theme 1 — Marple / Warm Modern ESG | Theme 2 — MEIL Corporate / Official | Theme 3 — Dark Enterprise / Premium ESG |
|---|---|---|---|
| Role | **Default** (first login) | Selectable alternate — MEIL-facing/formal contexts | Selectable dark mode |
| Character | Warm, modern, approachable, premium | Corporate, official, industrial, trustworthy | Premium, serious, analytical, executive |
| Note | — | Colors are a UI approximation from a public reference, **not** a confirmed official brand spec | — |

Switching lives in Profile — `/app/profile` for non-admin roles, `/admin/profile` for Admin (same component, mounted under the Admin route namespace; both routes now explicitly defined in `03_APP_FLOW.md` §2.2/§2.3, corrected per audit finding M2) — implemented as a three-option segmented control, persisted per-user (localStorage as an immediate per-device fallback, synced to the user's profile record for cross-device consistency). No theme changes layout, spacing, component structure, copy, or information hierarchy — only the CSS custom property values in §6 change.

---

## 5. Token Implementation

Every color, spacing, radius, and shadow value below is expressed as a CSS custom property, scoped per theme via a `data-theme="theme-1" | "theme-2" | "theme-3"` attribute on `<html>`, consumed by Tailwind via `theme()` references and by shadcn/ui's existing CSS-variable convention (`--background`, `--foreground`, `--primary`, etc. — extended here with product-specific tokens for header/sidebar/scope/status beyond shadcn's defaults).

---

## 6. Color System

### 6.1 Core Surface & Text Tokens

| Token | Theme 1 | Theme 2 | Theme 3 |
|---|---|---|---|
| `--background` (page) | `#FFE3B3` (used subtly — see §6.6) | `#F4F5F7` | `#1B1718` |
| `--surface` (cards, panels) | `#FFFFFF` | `#FFFFFF` | `#312725` |
| `--surface-elevated` | `#FFF8EF` | `#F4F5F7` | `#493E3C` |
| `--foreground` (primary text) | `#222222` | `#222222` | `#FFFFFF` |
| `--muted-foreground` (secondary text) | `#666666` | `#6B6B6B` | `#76757A` |
| `--border` | `#FFE3B3` (low opacity) | `#DDDDDD` | `#5E5453` |
| `--primary` | `#CA2851` (Deep Raspberry) | `#37358F` (Corporate Blue) | `#550916` (Deep Burgundy) |
| `--secondary` | `#FF6766` (Coral Red) | `#EF102D` (MEIL Red) | `#5E5453` (Medium Gray) |
| `--accent` | `#FFB173` (Warm Peach) | `#DDDDDD` | `#493E3C` |

### 6.2 Layout Region Tokens

| Region | Token | Theme 1 | Theme 2 | Theme 3 |
|---|---|---|---|---|
| Top header | `--header-bg` | `#CA2851` | `#FFFFFF` (nav) / `#37358F` (utility bar) | `#1B1718` |
| | `--header-fg` | `#FFFFFF` | `#222222` | `#76757A` |
| | `--header-active` | `#FFB173` | `#EF102D` | `#550916` |
| | `--header-hover` | `#FF6766` | `#4A48A0`-equivalent hover tint | `#493E3C` |
| Sidebar | `--sidebar-bg` | `#CA2851` | `#37358F` | `#312725` |
| | `--sidebar-fg` | `#FFFFFF` | `#FFFFFF` | `#76757A` |
| | `--sidebar-active-bg` | `#FF6766` | `#EF102D` | `#550916` |
| | `--sidebar-active-fg` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| | `--sidebar-hover` | `#FFB173` | `#4A48A0` | `#493E3C` |
| | `--sidebar-divider` | `#FFE3B3` (low opacity) | `rgba(255,255,255,0.15)` | `#5E5453` |
| Footer | `--footer-bg` | `#CA2851` | `#37358F` | `#1B1718` |
| | `--footer-fg` | `#FFFFFF` | `#FFFFFF` | `#76757A` |
| | `--footer-hover` | `#FFB173` | `#EF102D` | `#550916` |

### 6.3 Dashboard / KPI Tokens

| Token | Theme 1 | Theme 2 | Theme 3 |
|---|---|---|---|
| `--kpi-card-bg` | `#FFFFFF` | `#FFFFFF` | `#312725` |
| `--kpi-title` | `#CA2851` | `#37358F` | `#76757A` |
| `--kpi-number` | `#CA2851` | `#37358F` | `#FFFFFF` |
| `--kpi-important-accent` | `#FF6766` | `#EF102D` | `#550916` |
| `--kpi-secondary-accent` | `#FFB173` | (n/a — use `--border`) | (n/a — use `--sidebar-hover`) |
| `--kpi-supporting-text` | `#666666` | `#6B6B6B` | `#76757A` |

### 6.4 ESG Overview & BRSR Section Tokens

| Token | Theme 1 | Theme 2 | Theme 3 |
|---|---|---|---|
| `--esg-environmental` | `#FFB173` | `#37358F` | `#76757A` |
| `--esg-social` | `#FF6766` | `#EF102D` | `#5E5453` |
| `--esg-governance` | `#CA2851` | `#37358F` | `#550916` |
| `--brsr-heading` | `#CA2851` | `#37358F` | `#FFFFFF` |
| `--brsr-badge` | `#FF6766` | `#EF102D` | `#550916` |
| `--brsr-active-section` | `#CA2851` | `#EF102D` | `#550916` |
| `--brsr-completed-section` | `#CA2851` | `#37358F` | `#76757A` |
| `--brsr-pending-locked-section` | `#666666` | `#6B6B6B` | `#5E5453` / `#493E3C` |

### 6.5 Forms, Buttons & Inputs

| Token | Theme 1 | Theme 2 | Theme 3 |
|---|---|---|---|
| `--input-bg` | `#FFFFFF` | `#FFFFFF` | `#1B1718` |
| `--input-border` | `#FFE3B3` | `#DDDDDD` | `#5E5453` |
| `--input-focus-border` | `#CA2851` | `#37358F` | `#550916` |
| `--label` | `#222222` | `#222222` | `#FFFFFF` |
| `--required-indicator` | `#FF6766` | `#EF102D` | `#550916` |
| `--btn-primary-bg` | `#CA2851` | `#37358F` | `#550916` |
| `--btn-primary-fg` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| `--btn-important-bg` | `#FF6766` | `#EF102D` | `#550916` |
| `--btn-secondary-bg` | `#FFB173` | `#FFFFFF` (outlined) | `#493E3C` |
| `--btn-secondary-fg` | `#222222` | `#37358F` | `#FFFFFF` |

### 6.6 Tables

| Token | Theme 1 | Theme 2 | Theme 3 |
|---|---|---|---|
| `--table-header-bg` | `#CA2851` | `#37358F` | `#493E3C` |
| `--table-header-fg` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| `--table-row-bg` | `#FFFFFF` | `#FFFFFF` | `#312725` |
| `--table-row-alt-bg` | `#FFF8EF` | `#F4F5F7` | `#1B1718` |
| `--table-row-hover` | `#FFE3B3` | `#EEF0FA` | `#493E3C` |
| `--table-row-selected` | `#FFE3B3` | `#E8E9F8` | `#550916` (with white text) |
| `--table-border` | `#F0CFA8` | `#DDDDDD` | `#5E5453` |
| `--table-important-value` | `#CA2851` | `#EF102D` | `#550916` |

### 6.7 Charts

| Token | Theme 1 | Theme 2 | Theme 3 |
|---|---|---|---|
| `--chart-bg` | `#FFFFFF` | `#FFFFFF` | `#312725` |
| `--chart-primary` | `#CA2851` | `#37358F` | `#76757A` |
| `--chart-secondary` | `#FF6766` | `#EF102D` | `#550916` |
| `--chart-tertiary` | `#FFB173` | `#6B6B6B` | `#5E5453` |
| `--chart-neutral-reference` | `#FFE3B3` | `#DDDDDD` | `#493E3C` |
| `--chart-grid` | `#E8D8C5` | `#E5E5E5` | `#493E3C` |
| `--chart-label` | `#666666` | `#6B6B6B` | `#76757A` |

### 6.8 Modals, Drawers & Overlay

| Token | Theme 1 | Theme 2 | Theme 3 |
|---|---|---|---|
| `--modal-bg` | `#FFFFFF` | `#FFFFFF` | `#312725` |
| `--modal-header-bg` | `#CA2851` | `#37358F` | `#493E3C` |
| `--modal-header-fg` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| `--modal-primary-action` | `#CA2851` | `#37358F` | `#550916` |
| `--modal-destructive-action` | `#FF6766` | `#EF102D` | `#550916` |
| `--overlay` | `rgba(0,0,0,0.35)` | `rgba(0,0,0,0.40)` | `rgba(0,0,0,0.70)` |

### 6.9 Status System

Status colors are **shared across all three themes** — never substituted with brand colors, per the source direction ("do not use brand colours as substitutes where they reduce accessibility"):

| Token | Value (all themes) | Usage |
|---|---|---|
| `--status-success` | `#1E8E5A` (accessible green, AA on white and on dark surfaces at the weights specified in §6.10) | Approved, validated, completed |
| `--status-warning` | `#B8860B`-class amber *(theme-tinted: Theme 1 may render the warning chip using `#FFB173` background with `#7A3B00`-class dark text for AA compliance — see §6.10)* | Low confidence, flagged, pending action |
| `--status-error` | `#D92D20` | Rejected, failed, critical |
| `--status-info` | `--primary` (theme-specific) | Informational, processing |

### 6.10 Accessibility & Contrast Usage Rules for This Palette

Several supplied accent colors (`#FF6766` coral, `#FFB173` peach, `#EF102D` MEIL red at mid-brightness) do **not** reliably clear WCAG AA's 4.5:1 ratio for small white text. Rather than altering the supplied hex values, the rule governing their use is:

- **Small/regular text (< 18px) requiring AA (4.5:1):** always pair with `#222222`/`#FFFFFF` per the darkest/lightest available surface — never render small white text directly on `#FF6766`, `#FFB173`, or `#EF102D`.
- **Large or bold text (≥ 18px, or ≥ 14px bold), badges, and icon fills** may use these accents at the lower 3:1 AA threshold — this covers their primary intended uses here (active-nav indicators, badges, chart data points, large KPI accents).
- **Status chips using warning/peach tones** render as a light-background chip (`#FFB173`/`#FFE3B3`-family) with dark text (`#7A3B00`-class or `#222222`), never as a solid-fill chip with white text.
- This rule applies identically across all three themes wherever an equivalent mid-brightness accent appears (e.g., Theme 3's `#550916` against `#FFFFFF` text passes AA comfortably at all sizes and needs no such restriction).

### 6.11 Scope 1/2/3 Visual Differentiation

Not separately specified per-theme in the source palettes — defined here as a **consistent mapping across all three themes**, reusing each theme's existing dataset/chart tokens so scope identity doesn't shift when a user switches themes:

| Scope | Token | Icon (Lucide) | Theme 1 | Theme 2 | Theme 3 |
|---|---|---|---|---|---|
| Scope 1 (direct emissions — fuel) | `--scope-1` | `flame` | `#CA2851` (`--chart-primary`) | `#37358F` (`--chart-primary`) | `#76757A` (`--chart-primary`) |
| Scope 2 (purchased energy) | `--scope-2` | `zap` | `#FF6766` (`--chart-secondary`) | `#EF102D` (`--chart-secondary`) | `#550916` (`--chart-secondary`) |
| Scope 3 (value chain) | `--scope-3` | `link-2` | `#FFB173` (`--chart-tertiary`) | `#6B6B6B` (`--chart-tertiary`) | `#5E5453` (`--chart-tertiary`) |

Every Scope 1/2/3 reference in the UI (dashboard cards, chart legends, badges, the Scope 1/2/3 Dashboards) pairs its color with its icon and label together — color is never the sole differentiator (accessibility requirement, §17).

---

## 7. Typography

**Font choices:** **Inter** for all UI text (headings, body, labels, buttons) — a neutral, highly legible grotesque with excellent number/tabular-figure support, critical for a data-dense financial/regulatory tool. **JetBrains Mono** (or IBM Plex Mono as fallback) for anything that is literally data: document IDs, factor IDs/versions, audit-log diffs, calculation traces, file hashes — visually marking "this is a system-of-record value" versus prose.

**Heading scale** (Tailwind `text-*` mapping):

| Level | Size / Line-height | Weight | Use |
|---|---|---|---|
| Display | 32px / 40px | 600 | Page titles only (e.g., "Admin Dashboard") |
| H1 | 24px / 32px | 600 | Section headers, modal titles |
| H2 | 20px / 28px | 600 | Card/panel headers |
| H3 | 16px / 24px | 600 | Sub-section headers, table group headers |

**Body scale:**

| Level | Size / Line-height | Weight | Use |
|---|---|---|---|
| Body | 14px / 20px | 400 | Default UI text, table cells |
| Body Strong | 14px / 20px | 600 | Emphasized inline values (e.g., a KPI's supporting label) |
| Small | 12px / 16px | 400 | Metadata, timestamps, helper text |
| Caption | 11px / 14px | 500, uppercase, tracked | Table column headers, badge labels |

**Monospace scale:** matches Body (14px) and Small (12px) sizes, used inline (e.g., "Factor ID: `DSL-2024-v3`") and in dedicated data blocks (calculation trace display, audit-log before/after values).

---

## 8. Shape & Elevation

**Border radius:** deliberately restrained — `--radius-sm: 4px` (badges, chips, inputs), `--radius-md: 8px` (cards, buttons, modals), `--radius-lg: 12px` (large containers, the document-preview panel). No fully-rounded/pill buttons except status badges, and no radius above 12px anywhere — this is the concrete expression of "avoid gaming-style/decorative."

**Shadows:** minimal, used only to indicate elevation change (a modal over its overlay, a dropdown over its trigger) — never as a default card treatment. `--shadow-sm` (subtle, for dropdowns/tooltips), `--shadow-md` (modals/drawers). Cards use a **1px border** (`--border` token) as the primary separation method instead of a shadow — flatter, calmer, and reads more "financial tool" than "consumer app." In Theme 3 (dark), borders do more of this work than shadows ever can on a dark surface.

**Borders:** 1px solid, using each theme's `--border`/`--table-border` tokens; never decorative multi-color or gradient borders.

---

## 9. Spacing System

4px base unit, Tailwind's default scale used directly: `1` (4px) through `16` (64px). Practical defaults: `16px` (space-4) internal card padding, `24px` (space-6) between major page sections, `8px` (space-2) between a label and its control, `12px` (space-3) table cell padding. Consistent spacing, not novelty, is one of the explicit source requirements — no custom one-off spacing values outside this scale.

---

## 10. Iconography

**Lucide** icon set throughout (pairs natively with shadcn/ui, has full coverage of the icons this product needs: `flame`, `zap`, `link-2` for scopes; `file-text`, `upload`, `check-circle-2`, `alert-triangle`, `x-circle` for document/status states; `chevron-right` for drill-down). Consistent 1.5px stroke width, sized 16px (inline/table), 20px (buttons/nav), 24px (empty-state illustrations, KPI card icons). Icons never carry meaning alone — always paired with a text label or accompanying a color-coded status, per accessibility requirements.

---

## 11. Component Library

### 11.1 Buttons

- **Primary:** `--btn-primary-bg` fill, white text, `--radius-md`. One primary button per view/section — the single clearest next action (e.g., "Confirm" on Verify Extraction, "Generate Report").
- **Important/destructive-adjacent** (e.g., "Reject," "Return for Correction"): uses `--btn-important-bg` — visually distinct from primary so a user can't mistake "confirm" for "reject" at a glance.
- **Secondary:** outlined or `--btn-secondary-bg` per theme, for lower-emphasis actions (Cancel, Export).
- **Ghost/tertiary:** text-only, `--muted-foreground`, for the lowest-emphasis actions (table row inline actions).
- All buttons: 40px height (default), 32px (compact/table-inline), 14px label, `--radius-md`, visible focus ring (`--input-focus-border` color, 2px offset) for keyboard users.

### 11.2 Inputs / Controls

`--input-bg`/`--input-border` default, `--input-focus-border` + subtle ring on focus. Labels always above the field (never placeholder-as-label — placeholders disappear on input, which is an accessibility anti-pattern this product cannot afford given how much of its data is regulatory-relevant). Required fields marked with `--required-indicator` asterisk, never color-alone.

### 11.3 Tables

The single most important non-OCR component in this product — most Admin pages in `03_APP_FLOW.md` are tables. `--table-header-bg`/`--table-header-fg` sticky header on scroll, `--table-row-alt-bg` zebra striping (subtle, per theme), `--table-row-hover` on hover, `--table-row-selected` for active row (e.g., in a master-detail layout). Numeric columns right-aligned, monospace for ID-type columns, `--table-important-value` color for the "the number that matters" column (e.g., calculated emission value). Every table with more than ~15 rows gets column-level filtering and a persistent filter-bar, per source requirement to prioritize filters/drill-down over decoration.

### 11.4 Cards

`--surface` background, 1px `--border`, `--radius-md`, `16px`–`24px` padding depending on density context (KPI cards use `16px`, content cards `24px`). No shadow by default (see §8).

### 11.5 Modals

`--modal-bg`, `--modal-header-bg` (colored header bar — this is one of the few places a theme's brand color is used as a large fill, deliberately, to make a modal read as "this needs your attention now" e.g. an Approve/Reject confirmation), `--overlay` backdrop. Used for **confirmations with real consequence** (Reject a document, Return a record, deactivate a user) — not for routine forms, which use inline panels or drawers instead, to avoid modal fatigue.

### 11.6 Drawers

Slide-in from the right, `480px` default width (`720px` for the Verify Extraction / document-heavy contexts where a drawer is used instead of a full page — e.g., a quick-view of a record from a table row without leaving the table's filter/scroll context). Same surface/border tokens as cards.

### 11.7 Badges / Status

`--radius-sm`, `11px` uppercase caption text, colored per `--status-*` tokens (§6.9) or per pipeline-stage tokens (`--brsr-active-section` etc.) — never relies on color alone; every badge carries a short text label (`Validated`, `Needs Verification`, `Returned`, `Approved`, `Rejected`, `Flagged`).

---

## 12. Core Feature Components

### 12.1 Upload Component

A single, large, centered drop-zone (`--radius-lg`, dashed `--border`, `--surface-elevated` background) with a file-picker fallback button — this is the component the entire product's UX hinges on, per §0's core principle, so it gets outsized visual priority relative to its actual complexity. States: idle (dashed border, upload icon, "Drag a document here or click to browse"), drag-active (border becomes `--primary`, background tints), uploading (progress bar, filename, cancel affordance), and the category selector sits directly above it as a simple dropdown/combobox — never a multi-step wizard for a single upload.

### 12.2 OCR Verification Component — *critical, detailed spec*

**Layout:** two-column split, roughly 55/45, fixed on desktop (`03_APP_FLOW.md` confirms MVP is desktop-first).

**LEFT — Document preview:**
- Rendered original document (PDF/image) in a scrollable, zoomable viewer (`--surface` background, `--radius-lg` container).
- Zoom controls and page navigation (for multi-page PDFs) as a small floating toolbar, bottom-center of the preview.
- No annotation/markup tools for MVP — this is a viewer, not an editor.

**RIGHT — Extracted fields panel**, one row per field, each row showing, left to right:
1. **Field label** (e.g., "Consumption")
2. **Extracted value** — editable inline (click-to-edit, not a separate edit mode) — monospace for numeric/ID values.
3. **Confidence indicator** — a small percentage + colored dot: `--status-success` green ≥ threshold, `--status-warning` amber below threshold (per-field, per Admin-configured threshold from `03_APP_FLOW.md` §4.6).
4. **Validation state icon** — appears after the validation engine runs (post-confirm): `check-circle-2` (passed) / `alert-triangle` (flagged) / `x-circle` (failed), tooltip with the specific reason on hover/focus.

**Guard rail (explicit, non-negotiable per source direction — "do not allow users to accidentally confirm unreviewed critical values"):**
- Any field below the confidence threshold is visually emphasized (amber left-border on its row, amber confidence dot) **and** the field must be explicitly interacted with — either edited, or a small inline "Looks correct" acknowledgment control (not just visually present, an actual required click) — before the page-level **Confirm** button becomes enabled.
- The Confirm button is disabled (not hidden — visibly present but disabled with a tooltip explaining why) until every flagged field is resolved. This is a deliberate friction point; it is the one place in this product where friction is correct.

**Actions (bottom of the right panel, sticky):**
- **Confirm** — primary button, disabled per the guard rail above.
- **Edit** is not a separate mode/button — every field is always click-to-edit; "Edit" as a concept is inline, not modal.
- **Reject** — secondary/important-styled button, opens a small confirmation modal requiring a reason (this document is not usable evidence) — distinct from simply not confirming.

### 12.3 Evidence/Document Viewer

Reused from §12.2's left panel as a standalone component wherever a document needs to be shown read-only (Report Drill-down, Submission History, Audit Trail detail) — same viewer, no verification controls attached.

### 12.4 Validation Result Component

A compact, per-category status list (Format ✓, Organizational ✓, Period ✓, Evidence ✓, Logical ✓, Anomaly — flagged), shown inline on a record's detail view and on the Verification screen after Confirm is pressed. Each category uses the same check/alert/x icon language as §12.2's field-level validation state, for visual consistency between field-level and record-level validation feedback.

### 12.5 Approval Component

On the Approval Queue (`03_APP_FLOW.md` §2.2), each record expands to show: evidence thumbnail + link to full viewer, the calculation trace summary (input → factor → output), and two clearly separated actions — **Approve** (primary) and **Return for Correction** (important-styled, opens a modal requiring a reason, mirroring §12.2's Reject pattern for consistency). The approver's own identity is never allowed to match the submitter/verifier — enforced server-side, but the UI also visually surfaces "Submitted by [name], Verified by [name]" so the approver has that context without digging.

---

## 13. Dashboard & Data Components

### 13.1 Dashboard KPI Cards — exact recommended set

Per the source direction (submission completion, evidence coverage, OCR status, validation status, approval status, Scope 1/2/3, BRSR readiness, anomalies, missing submissions, pending approvals), the Admin Control Tower uses a **two-row KPI layout**, not a single undifferentiated grid.

**Header stat strip (above both KPI rows):** a compact, single-line row of three plain counts — Total Organizations · Total Projects · Active Users (`Master_Approach.md` §33) — small `--kpi-supporting-text`-weight numbers, not full KPI cards (they're context, not a metric to optimize), sitting directly under the org/period context switcher. These three were previously omitted from this section without a documented reason; restored per audit finding M5.

**Row 1 — Completion pipeline (4 cards, same visual template, sequential left-to-right matching the actual pipeline order):**
1. Submission Completion % (of expected submissions this period)
2. Evidence Coverage % (records with attached, readable evidence)
3. Validation Completion % (verified records that have passed validation)
4. Approval Completion % (validated records that have been approved)

Each card: `--kpi-title` label, large `--kpi-number` (percentage, not a raw count — counts go in the supporting line), a thin horizontal progress bar beneath the number (not a circular gauge — flat bars read as data, gauges read as "dashboard decoration," per the explicit direction to avoid gaming-style metrics), and a `--kpi-supporting-text` line with the raw fraction ("142 / 168").

**Row 2 — Scope & readiness (4 cards):**
5. Scope 1 Completion % (icon: `flame`, `--scope-1` accent)
6. Scope 2 Completion % (icon: `zap`, `--scope-2` accent)
7. Scope 3 Completion % (icon: `link-2`, `--scope-3` accent — and where Scope 3 categories are only partially enabled, the card shows "X of Y categories active" as supporting text rather than pretending full coverage)
8. **BRSR Readiness %** — visually distinguished from the other seven (it's a composite, per `Master_Approach.md` §34), using `--kpi-important-accent`, and carrying a small "i" info-affordance that opens a tooltip/drawer explaining exactly what it's composed of and stating plainly it is an internal readiness indicator, not an official regulatory score.

**Below the KPI rows — Issue Panel** (not cards; a compact, dense list, since these are action items, not metrics): Projects with missing submissions · Records missing evidence · Low-confidence OCR records · Validation failures · Anomalous values · Pending approvals · Incomplete BRSR indicators. Each row: icon + count + one-line description + click target that deep-links into the relevant filtered queue (Submission Monitoring / OCR Monitoring / Validation Queue / Approval Queue), per `03_APP_FLOW.md` §2.2.

### 13.2 Charts

Used deliberately, never as the only way to reach information (per explicit "do not rely only on charts" direction, especially for BRSR — see §14). Chart types used in this product, and only these:
- **Horizontal stacked bar** — Scope 1/2/3 composition by project/subsidiary (categorical comparison, the most common ESG-dashboard need).
- **Line/area, simple** — trend across reporting periods for a single metric (e.g., Scope 2 emissions over the last 6 months).
- **Flat progress bar** (not a gauge/donut) — every completion percentage, per §13.1.
- No pie charts, no 3D charts, no gauge/speedometer charts anywhere in the product — these read as decorative and are explicitly the "gaming-style metrics" the source direction warns against.
- All charts render on `--chart-bg`, use `--chart-primary/secondary/tertiary` in that priority order, `--chart-grid` for gridlines (subtle, never dominant), and every chart has an adjacent or toggleable table view of the same data — a chart is a summary of a table, never a replacement for one.

### 13.3 Filters

A persistent filter bar above every data table (not a hidden "filters" drawer that requires a click to discover) — org node, reporting period, status, and metric/category as the four filters present on essentially every Admin table, per `03_APP_FLOW.md`'s repeated page specs. Filter chips (using the badge component, §11.7) show active filters and are individually removable.

### 13.4 Search

A single global search affordance in the top header (icon + expand-on-click input, not a permanently-open search bar competing for header space), scoped to the current section (searching within Submissions, within Users, etc.) rather than a single global-everything search for MVP — matches the page-scoped nature of the platform's data model.

### 13.5 Drill-down Navigation

The signature interaction (`03_APP_FLOW.md` Journey 5). Implemented as an **expandable in-context panel/breadcrumb trail**, not a series of full-page navigations — each drill-down level (BRSR Indicator → ESG Metric → Calculation → Verified Activity Data → Original Document) expands inline or into a side panel, with a persistent breadcrumb showing the full path so a user never loses their place in a 5-level-deep drill-down. The final level (Original Document) reuses the Evidence/Document Viewer component (§12.3) directly inline — the user should never need to "download" something to see the proof.

---

## 14. Notifications

Bell icon in the top header with an unread-count badge (`--status-error` red dot for urgency, not a number badge that can grow visually noisy — per anti-clutter direction). Dropdown shows the 5 most recent, each with an icon matching its type (verification needed, returned, approved, low confidence, deadline), a one-line description, relative timestamp, and click-through per `03_APP_FLOW.md` §0.2's deep-linking rule. "View all" links to the full Notifications page.

---

## 15. System States

### 15.1 Loading States

Skeleton screens (gray `--surface-elevated` blocks matching the eventual content's shape), never a bare spinner for anything that takes more than ~300ms and never a full-page blocking spinner for async operations (per `03_APP_FLOW.md` §0.1 — OCR and report generation are explicitly non-blocking; their "loading" state is a status badge, not a spinner screen).

### 15.2 Empty States

Always a short explanatory line **plus a specific next action**, never a bare "No data" — e.g., "No submissions yet for August 2026 · [Upload a document]" or "No projects assigned yet · Contact your Admin." Uses a simple line-icon illustration (Lucide, 48px, `--muted-foreground`), never a large decorative graphic.

### 15.3 Error States

Every error state names what happened and what to do next, per the exhaustive list in `03_APP_FLOW.md` (unauthorized, expired session, invalid file, OCR failure, low confidence, validation failure, duplicate, network failure, server error, etc.) — each maps to a specific inline message using `--status-error`/`--status-warning` per severity, never a generic "Something went wrong." Retry affordances are always present where the underlying action is retriable (network/server errors); they are absent where retrying wouldn't help (e.g., an unreadable file needs re-upload, not retry).

### 15.4 Confirmation States

Two tiers: a **toast** (bottom-right, auto-dismissing, `--status-success` accent) for routine success ("Document received, processing," "Saved") and a **modal** (§11.5) only for actions with real, hard-to-reverse consequence (Reject, Return, deactivate a user, close a reporting period). This distinction is deliberate — over-using modals for routine confirmations is exactly the kind of friction this product's core upload flow needs to avoid.

---

## 16. Responsive Behavior & Mobile Considerations

Per `03_APP_FLOW.md` §0.3, MVP is **desktop-first**; the design system is built at a `1280px`+ primary breakpoint. Below that:
- **Tablet (768–1279px):** sidebar collapses to icon-only (expandable on hover/click), tables gain horizontal scroll with sticky first column, the OCR Verification split-screen stacks vertically (document preview on top, fields below) rather than side-by-side — this is the one component that meaningfully changes structure at this breakpoint, since a 55/45 split is unusable under ~1000px.
- **Mobile (< 768px):** functional but not optimized for MVP — core flows (login, view status, view notifications) work; document upload remains available via the standard file input (which on mobile browsers natively offers camera capture, so the future field-capture use case noted in `03_APP_FLOW.md` §0.3 is not entirely blocked even though it isn't a designed-for experience yet). Admin data-table-heavy pages are explicitly not mobile-optimized for MVP — Admin work is assumed desktop-based.

---

## 17. Accessibility

**Baseline: WCAG 2.1 AA**, applied concretely, not aspirationally:

- **Contrast requirements:** per §6.10's palette-specific rules; additionally, all body text meets 4.5:1, all large text/UI component boundaries meet 3:1, verified against each theme individually (not just Theme 1).
- **Color is never the sole signal** — every status, confidence indicator, and validation state pairs color with an icon and/or text label (established throughout §11–§13).
- **Keyboard navigation:** every interactive element reachable via Tab in a logical order matching visual layout; the OCR Verification screen's field list is fully keyboard-navigable (Tab between fields, Enter to edit, Escape to cancel an edit) since this is the product's most-used and most-consequential interaction; visible focus rings on every focusable element (§11.2), never `outline: none` without a replacement.
- **Screen reader considerations:** every icon-only control has an `aria-label`; status badges announce their text label, not just their color; the confidence indicator announces as "Confidence: 62 percent, requires review" not just a colored dot; the drill-down breadcrumb (§13.5) is a proper navigable landmark, not a purely visual trail; toasts use `aria-live="polite"` so confirmations are announced without stealing focus.
- **Motion:** respects `prefers-reduced-motion` — transitions/animations (already minimal per §3) are disabled or reduced to opacity-only changes for users who request it.

---

## 18. UI Consistency Rules

1. One primary button per view. If two actions feel equally important, one of them isn't primary — demote it.
2. Every status anywhere in the product (record status, job status, validation status, approval status) draws from the same finite badge vocabulary (§11.7) — no page invents its own status language.
3. Every number that came from OCR/calculation is traceable — if a value is shown anywhere in the UI, there must be a path (even if several clicks deep) back to its source document, per the evidence-first principle. This is a design *constraint*, not just a feature of the Report Drill-down screen specifically.
4. Confidence and validation state are shown wherever a value that hasn't yet been human-confirmed is displayed — never presented as plain, "settled" data before it actually is.
5. Theme changes tokens only (§0.2) — no component may hard-code a hex value; everything routes through the CSS custom properties in §6.
6. Density is consistent: the same table/card/spacing scale is used in Admin and User contexts — Admin is not a "denser, uglier" version of the same product.

---

## 19. Key Screens — Admin

Each screen reuses the component library above; only layout/emphasis notes specific to that screen are called out here (full functional spec — routes, actions, states — is in `03_APP_FLOW.md` §2.2).

- **Admin Dashboard:** two-row KPI layout (§13.1) + Issue Panel, top of page; org/period context switcher pinned in the header, always visible so Admin never loses track of what scope they're viewing.
- **User Management:** table-first (§11.3), with a right-side drawer (§11.6) for create/edit rather than a full-page form — keeps the list context visible while editing.
- **Organization Hierarchy:** left-side tree navigator + right-side detail panel for the selected node (standard master-detail layout) — the tree itself uses indentation + Lucide `chevron-right` expand/collapse, no decorative connecting lines.
- **Project management:** a filtered view within Organization Hierarchy (project = one tree-node type), not a separate visual pattern.
- **Submission Monitoring / OCR Monitoring / Validation Queue / Approval Queue:** all four share one visual template — filter bar (§13.3) + table (§11.3) + row-click-to-detail-drawer (§11.6) — deliberately identical across all four so Admin's muscle memory transfers between them.
- **Conversion Factor Management:** table with inline version history (expandable row) rather than a separate versions page — makes the "never overwrite, always version" principle visually obvious.
- **BRSR Mapping:** table of metric→indicator mappings, grouped by BRSR section (using `--brsr-heading`/`--brsr-badge` tokens) — see §20 for the full BRSR interaction pattern.
- **ESG Explorer:** the filter bar is more prominent/multi-dimensional here than elsewhere (it's the general-purpose query tool) — otherwise standard table template.
- **Report generation:** a simple parameter form (period + org scope) + a "past runs" table below it — generation itself uses the non-blocking pattern (§15.1), never a modal wizard.
- **Report Drill-down:** the report's own rendered tables/charts, with every value clickable per §13.5's drill-down component.
- **Audit Trail:** table with heavy filtering (§13.3), each row expandable inline to show before/after values in monospace (§7) — never requires leaving the table to see event detail.

---

## 20. Key Screens — User

- **User Dashboard:** task-card-first (not KPI-card-first like Admin) — "3 documents need verification" reads as an actionable card, not a percentage. Upload CTA is the single most visually prominent element on the page.
- **Upload Document:** §12.1's component, full focus, minimal chrome around it — this page should feel almost empty by design.
- **OCR Processing:** not a distinct visual screen — represented as a status badge/filter within My Submissions (§0, consolidation confirmed in `03_APP_FLOW.md`).
- **OCR Verification:** §12.2's full split-screen spec — the most visually developed screen in the entire product, deliberately.
- **Submission Status / Returned Record / Approved Record:** all three are filtered views of one table template (My Submissions), status-tab navigation at the top (segmented control, not a dropdown — these are few enough options to show directly).
- **Submission History:** same table template as My Submissions, but read-only row treatment (no action buttons, just a "View" link) and a period filter that's more prominent, since browsing-by-period is the primary use case here versus triage in My Submissions.

---

## 21. BRSR Readiness Interface

Explicitly **not chart-only**, per source direction. The primary interaction pattern is a **navigable, expandable tree/accordion**, not a dashboard of BRSR-shaped charts:

```
BRSR Section (A / B / C — expandable)
  └─ BRSR Indicator (with a status: Complete / Partial / Missing evidence)
       └─ ESG Metric(s) mapped to this indicator
            └─ Calculation summary (input → factor → result)
                 └─ Evidence (thumbnail, click to open full viewer)
```

Each level shown as an expandable row (reusing the Organization Hierarchy tree pattern, §19, for visual consistency) with a status badge (§11.7) at the Indicator level so an Admin can scan "what's missing" without opening every branch. A single summary chart (the BRSR Readiness % card, §13.1) exists at the top as an entry point/overview, but the actual working interface for understanding *why* readiness is at a given level is this tree, not the chart — clicking the Readiness % card scrolls to and expands this tree filtered to incomplete indicators, directly connecting the summary number to the actionable detail. This structure is the same component used for the Report Drill-down (§13.5, §19) — BRSR navigation and report drill-down are the same interaction pattern applied at different entry points, not two different UIs to learn.

---

*End of 04_UI_UX_DESIGN_BRIEF.md. See `.grill/ui-design-system-decisions.md` for the reasoning behind the theme architecture and palette-sourcing decisions. This brief should be handed directly to frontend implementation as the `tailwind.config` / CSS-variable source — no further translation pass should be needed for the token values in §6–§10.*
