# Grill: 06_IMPLEMENTATION_PLAN.md structure decisions
Date: 2026-09-16

## Intent
Produce `06_IMPLEMENTATION_PLAN.md` — a phase-by-phase build order for an AI coding agent, derived from the five approved documents plus `05_BACKEND_SCHEMA.md`, that an agent (or the team) can execute without skipping dependencies or inventing architecture.

## Constraints
- Must preserve the given 21-phase structure's principle (foundations before dependent features) but may restructure/merge phases where the actual dependency graph justifies it — explicitly permitted by the brief.
- User required an actual dependency check before approving any parallelization, not an assumed one.

## Key decisions
- Decision: **Two tracks, not one, and not three.** Track A = the main TS app, strictly sequential (Phase 1 → 2 → 3 → 4 → 5 → ... exactly as gated in the original phase list, since each of those genuinely depends on the one before it: Phase 4 org/admin needs Phase 3 auth to exist meaningfully; Phase 5 upload needs Phase 4's org-assignment data to know a user's scope). Track B = the Python OCR worker, branching off once Phase 2 (database schema) lands, developed/tested independently (manually-seeded job rows, direct Storage uploads, no login/org/UI required), converging back into Track A at the Phase 6/7 integration point. Reason: verified by an explicit dependency check, not assumed — the OCR worker connects via a Supabase *service-role* key, not a user session, and its core logic never reads org/user/auth context, so Phases 3-5 are provably not prerequisites for it. Alternative considered: a third parallel track for UI/component-library work — rejected, since that work is the same team in the same repo/language as Track A, not a genuinely separate effort; it isn't a distinct track, it's just how Phase 1 naturally starts.
- Decision: fold this two-track structure directly into the phase numbering (Track B phases run alongside, not instead of, the corresponding Track A phase numbers) rather than inventing a separate parallel-numbering scheme, so the document stays legible against the originally-requested 21-phase list.

## Surfaced assumptions
- The original 21-phase brief reads as fully linear (Phase 6 "OCR pipeline" listed strictly after Phase 5 "Document ingestion"); the surfaced correction is that this linear reading wastes the confirmed Python teammate's time and real hackathon hours, since the OCR worker's only genuine blocker is the schema landing (Phase 2), not the upload UI being finished (Phase 5).
- Testing rigor (full automated suites per the brief's extensive testing-category list vs. a lighter smoke-test + manual-checklist approach given hackathon time pressure) was not separately re-grilled this session — decided directly in the document as a pragmatic default (targeted automated checks per phase's Definition of Done, plus a consolidated manual QA checklist covering the full edge-case list from the brief), consistent with the project's established hackathon-timeline reality from earlier sessions, and flagged transparently in the document rather than silently assumed.

## Out of scope
- No third parallel track for design-system/component work — treated as part of Track A, not a separate effort.
