# Grill: Phase 1 — Project Setup
Date: 2026-09-17

## Intent
Start implementation of the EmeilSG / PS-08 platform with Phase 1 of `06_IMPLEMENTATION_PLAN.md` only: an empty, buildable, lint-clean monorepo at the `BRSR_MEIL/` project root, then stop.

## Constraints
- `BRSR_MEIL/` is the application root; `ps_documents/` is documentation only — no code inside it, no doc edits.
- Follow the documents' stack (TRD §3, §31) and phase order; no Phase 2+ work (no schema, auth, OCR logic, real screens).
- No global tool installs on the developer machine.

## Key decisions
- Decision: Next.js 16 + Tailwind CSS v4 + current shadcn/ui. Reason: current stable, satisfies TRD's "Next.js 14+"; design tokens are unchanged, they live in CSS (`@theme`) rather than `tailwind.config`. Alternative considered: Next 14 + Tailwind v3 to match the UI brief's literal `tailwind.config` wording — rejected as older with more upgrade work later.
- Decision: Commit the corrected implementation documents as their own commit before scaffolding. Reason: keeps the Phase 1 diff reviewable on its own. Alternative considered: leave docs uncommitted alongside scaffold files.
- Decision: The 3-theme `data-theme` mechanism uses the documented UI brief §6.1 core values (plus the documented §6.5/§6.9/§8 values that shadcn's required variables need), not neutral placeholders. Reason: placeholder values would be invented; real values already exist in the brief. Extended tokens (sidebar, tables, charts, status chips) are added in Phase 4/19. Alternative considered: literal "placeholder" tokens per the plan wording.
- Decision: OCR worker uses PaddlePaddle + PaddleOCR on Python 3.12, installed from a pinned `requirements.txt` into `apps/ocr-worker/.venv`, with README instructions for using it. Reason: user confirmed PaddlePaddle; verified PaddlePaddle has no Python 3.14 wheels (machine default is 3.14), while 3.12 resolves paddlepaddle 3.3.1 / paddleocr 3.7.0.
- Decision: pnpm run via corepack (`corepack pnpm`), pinned with `packageManager` in root `package.json`. Reason: pnpm is not installed globally; corepack avoids a global install.

## Surfaced assumptions
- CI can't be proven green locally (no push, no `gh`); the same lint/typecheck commands are run locally instead.
- tRPC setup is not assigned to any phase before Phase 3 references its context — left to Phase 3, not added now.
- TRD §33 defines only `NEXT_PUBLIC_SUPABASE_URL` for the Supabase URL, so the worker's `.env.example` reuses that exact name.

## Out of scope
- Model weight download (Phase 2B), database migrations (Phase 2), auth (Phase 3), any product screens.
