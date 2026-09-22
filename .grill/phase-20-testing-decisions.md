# Grill: Phase 20 — Testing and edge cases

Date: 2026-09-22

## Intent

Deliberate, systematic verification against the plan's edge-case list (§6) and testing categories (§5):
targeted automated checks where a regression would be expensive, and a manual `QA_CHECKLIST.md` for the
rest, each case with its expected behavior and a recorded pass/fail (`06_IMPLEMENTATION_PLAN.md` Phase 20).

## Key decisions

- Decision: **commit a curated end-to-end suite.** A cleaned-up harness plus the scripts that guard expensive
  regressions — the critical Scenarios A–D, RLS/authorization boundaries, the OCR guard rail, approvals and
  reporting — run with one command against a local stack, with no secrets in the repository. Browser checks
  stay an optional documented run. Alternatives: commit all ~30 scratch scripts (slow, order-sensitive);
  unit and database tests only (the most valuable checks couldn't be re-run by anyone else).
- Decision: **synthetic documents only.** The OCR harness and integrated checks run on generated documents;
  the checklist records that accuracy on real MEIL documents is untested until samples are provided.
- Decision: **database tests join CI.** The GitHub Actions job starts local Supabase and runs the pgTAP
  suite; end-to-end tests stay local (they need the app server, the OCR worker image and a browser).
  Alternatives: leave CI to Phase 21; run end-to-end tests in CI too (heavy, slow).

## Surfaced assumptions

- The suite provisions what it needs itself (test users with per-run passwords, clearly labelled synthetic
  conversion factors), so it runs on a freshly reset local database, not only on data earlier phases left.
- Scripts run in a fixed order through one runner that clears the rate-limit counters between them.
