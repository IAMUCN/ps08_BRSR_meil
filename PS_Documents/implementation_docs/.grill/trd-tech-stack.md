# Grill: 02_TRD.md technology stack and architecture decisions
Date: 2026-09-16

## Intent
Produce `02_TRD.md` (Technical Requirements Document) for PS-08, translating `Master_Approach.md` and `01_PRD.md` into concrete, defensible technical decisions — not a generic/default stack pick, but one shaped by the team's actual real-world plan and skills.

## Constraints
- This is a hackathon submission (PS-08), but not throwaway: MEIL is the problem-statement sponsor and will actually use the project if the team wins. The build must be credible enough to survive becoming a real pilot, not just impress judges for a demo.
- No confirmed access to MEIL's internal IT stack/approved vendors yet (win is not guaranteed) — cannot design around unknown MEIL infrastructure constraints.
- Team skill profile: broad TypeScript comfort across the team; one member with real Python depth; one member with real Java depth; some existing Postgres/Supabase familiarity.
- Decision: only one language runtime for "the app" itself (TypeScript/Next.js/Node) — no polyglot app logic.
- OCR is the one deliberate exception to single-runtime: must use Baidu's PaddleOCR, self-hosted (weights downloaded from Hugging Face Hub, run locally — not a hosted HF Inference Endpoint), which requires Python and therefore its own worker/service.
- Data residency: for now, deploy in an India region wherever the chosen providers support it (not yet a hard contractual requirement, but treated as a real constraint given BRSR/SEBI context and MEIL being an Indian company).

## Key decisions
- Decision: App runtime = single TypeScript codebase (Next.js + Node backend). Reason: team-wide TS comfort, avoids polyglot deployment/context-switch overhead under hackathon time pressure. Alternative considered: TS frontend + Python backend split for OCR *and* calc engine — rejected because it would spread regulatory-calculation ownership across two languages/repos for no real benefit (calc engine needs no ML/data-science capability).
- Decision: OCR = self-hosted PaddleOCR (Baidu), weights downloaded from Hugging Face Hub and run locally in a dedicated Python worker process, not called as a hosted API. Reason: team explicitly chose this for cost control ("unlimited"/no per-call billing) and reliability (no dependency on a third-party free-tier endpoint that could sleep/throttle during judging). Alternative considered: managed OCR API (AWS Textract / Azure Document Intelligence / Google Document AI) — rejected on cost and the team's explicit preference for open-source; also considered Tesseract.js (pure JS, single-runtime) — rejected on extraction-quality grounds for messy real-world bills/invoices, which matters directly for the evidence-first differentiator.
- Decision: Backend platform = Supabase for Postgres (relational data), Storage (evidence documents, Excel sheets), and Auth, with Row-Level Security doing much of the organization-hierarchy/role authorization work. Reason: matches existing team Supabase familiarity, collapses auth/storage/DB plumbing into one platform under time pressure, and RLS maps naturally onto the Group→Subsidiary→BU→Region→Project→Site→Department scoping model. Alternative considered: self-managed Postgres + hand-rolled auth/storage — rejected as materially slower to build with no compensating benefit given the team already knows Supabase.
- Decision: Calculation engine (unit normalization, factor selection, formula, scope classification) lives in TS inside the main Node backend, not in the Python OCR worker. Reason: it's deterministic arithmetic against versioned factor data, not an ML workload; keeping it in TS keeps it transactionally close to the API layer, validation engine, and audit-log writes. Alternative considered: placing it in the Python service alongside OCR — rejected, would split regulatory-correctness ownership unnecessarily across languages.
- Decision: Hosting = Vercel for the Next.js app, a persistent-process host (Render/Railway) for the Python OCR worker. Reason: Vercel serverless functions can't hold a loaded PaddleOCR model in memory between calls (cold-start reload would be slow and could undercut the "no per-call cost" rationale for self-hosting); the worker needs a long-lived process. Alternative considered: single-provider hosting (e.g., all on one VM) — left open as a future consolidation option, not chosen now because Vercel is the fastest path to a judge-clickable live app.
- Decision: Deploy in an India region wherever providers support it (e.g., Supabase's Mumbai-adjacent region), even without a contractual requirement yet. Reason: region/residency is expensive to retrofit after real data exists; costs nothing extra now. Flagged as a known constraint: Render/Railway may not offer a true India region, unlike Supabase — this is a gap to note explicitly in the TRD rather than paper over.

## Surfaced assumptions
- The team was implicitly assuming OCR could be "just an API call" (managed OCR service) before settling on self-hosted PaddleOCR — surfaced and resolved in favor of self-hosting for cost/reliability control.
- The Java-skilled team member was initially implied to possibly own a separate service; clarified that there is no dedicated Java component — that person pairs on TS or Python as needed rather than standing up a third runtime.
- "Real world" initially read as ambiguous (speculative vs. confirmed); clarified MEIL is the actual sponsor and will adopt the project contingent on winning the hackathon — this is the deciding factor for treating the architecture as production-credible, not throwaway.

## Open questions
- Exact background-job/queue mechanism between the TS app and the Python OCR worker (a Postgres-backed job table with polling/LISTEN-NOTIFY vs. introducing Redis) was not explicitly confirmed by the user — defaulted to a Postgres-based queue in the TRD to avoid adding Redis as new infrastructure, consistent with the low-ops-complexity goal already established. Flagged as a default, not a user-confirmed choice.
- PDF/report generation library, logging/monitoring/error-tracking tooling, CI/CD specifics, and folder/naming conventions were not individually grilled — treated as standard engineering defaults within the already-confirmed stack (TS + Supabase + Vercel + Render/Railway + Python OCR worker) rather than strategic forks requiring user input.

## Out of scope
- No polyglot "app" (confirmed: TS-only for app logic; Python strictly scoped to OCR).
- No hosted/managed OCR API (confirmed: self-hosted only).
- No commitment to MEIL's actual internal IT stack (not yet knowable pre-win).
