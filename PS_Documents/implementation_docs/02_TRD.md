# Technical Requirements Document (TRD)
## PS-08 — Evidence-First ESG/BRSR Reporting Platform (TraceESG)

**Document ID:** 02_TRD.md
**Version:** 1.0
**Status:** Draft for review
**Source of truth, in order:** (1) `Master_Approach.md` — product architecture, not to be contradicted; (2) `01_PRD.md` — approved product requirements. This document converts those requirements into concrete technical decisions. It describes **how** the system is built, not **what**/**why** — those live in the PRD and are not repeated here except where needed to justify a technical choice.

**Context this TRD was written under:** MEIL is the sponsoring organization for PS-08 and will use this platform in a real pilot if the team's submission wins. This is therefore not a throwaway hackathon demo — every technology choice below optimizes for "fast enough to build under hackathon time pressure, credible enough to keep running post-win," not for demo tricks that would need to be rebuilt later.

---

## 1. Technical Objective

Build a working, deployable, evidence-first ESG/BRSR platform that implements the full pipeline defined in `Master_Approach.md` — document upload → OCR → confidence-scored extraction → human verification → validation → deterministic calculation → Scope 1/2/3 classification → consolidation → BRSR mapping → admin reporting with drill-down — using a stack the team can actually execute against its real skill profile and timeline, and that does not require a rewrite if MEIL adopts it post-hackathon.

---

## 2. Architecture Principles

1. **One application runtime.** All application logic (frontend, API, auth-adjacent code, validation, calculation engine, BRSR mapping, consolidation, reporting) is TypeScript, in a single Next.js/Node codebase. No polyglot app logic.
2. **OCR is the one deliberate exception.** OCR extraction is isolated in its own Python worker process because the chosen OCR engine (PaddleOCR) is a Python library. This is a contained, well-defined boundary — the worker does exactly one job (extract fields + confidence from a document) and nothing else.
3. **Managed platform over hand-rolled infrastructure, where it doesn't cost control.** Supabase (Postgres + Auth + Storage + RLS) replaces what would otherwise be a large amount of hand-written auth, storage-integration, and authorization-middleware code, without giving up Postgres portability.
4. **Configuration over hard-coding**, per `Master_Approach.md` §46 — organizational hierarchy, roles/permissions, conversion factors, and BRSR mappings are all data, not code.
5. **Determinism where it's regulatory.** The calculation engine is plain, auditable TS logic against versioned data — never an LLM call, never a black box.
6. **Evidence and audit trail are structural, not bolted on.** Every table that represents a reported value carries FKs back to its source document, OCR extraction, verification event, and calculation trace from day one — retrofitting this later is far more expensive than building it in.
7. **India-region hosting wherever a provider supports it**, even before it's contractually required, because migrating a populated database/storage bucket across regions later is painful.
8. **No infrastructure the team can't operate.** No Kubernetes, no self-managed message broker, no bespoke ML infra — every component is either a managed service with a usable free/cheap tier, or a single process the team can run and reason about directly.

---

## 3. Recommended Technology Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) + TypeScript + React |
| Backend/API | Node.js, inside the same Next.js app (Route Handlers / Server Actions) + a typed internal API layer (tRPC) |
| Database | Supabase Postgres |
| Auth | Supabase Auth |
| Authorization | Postgres Row-Level Security (RLS) + application-level permission checks |
| Object/File Storage | Supabase Storage |
| OCR/Document Intelligence | Self-hosted PaddleOCR (Baidu), Python worker, weights from Hugging Face Hub |
| Background jobs/queue | Postgres-backed job table (`document_jobs`), polled by the Python worker |
| Validation | Zod |
| Data fetching/state | TanStack Query (client) + Next.js Server Components/Server Actions (server) |
| PDF/report generation | Headless-Chromium HTML-to-PDF (`puppeteer-core` + `@sparticuz/chromium`) |
| Hosting — app | Vercel |
| Hosting — OCR worker | Render (or Railway) — persistent container |
| Error tracking | Sentry (JS + Python SDKs) |
| CI/CD | GitHub Actions + Vercel/Render auto-deploy |
| Region | India-region where available (Supabase Mumbai-adjacent region; app/worker hosts set as close as each provider allows) |

Two reasonable options were evaluated for each major decision below; the table above is the outcome, not the only viable path.

---

## 4. Frontend Framework

**Technology:** Next.js 14+ (App Router), React, TypeScript.

**Purpose:** Serves the Admin and role-based user dashboards, document upload UI, OCR verification screen, and report views.

**Why chosen:** Whole team is TS-comfortable; Next.js gives file-based routing, server components, and a first-class Vercel deployment story in one framework — minimizing the number of decisions (routing, bundler, server/client data-fetching pattern) the team has to make separately under time pressure.

**Alternative considered:** Vite + React SPA with a separate Express API. Rejected — would require standing up and deploying a second service just for the API, contradicting the "one app" decision and adding a second thing to keep alive during the demo.

**Trade-off:** Next.js's server/client component model has a real learning curve if unfamiliar; mitigated by the team's stated TS comfort and Next.js's dominance in the current TS ecosystem (abundant reference material).

**Cost:** Free (open source); hosting cost covered under Vercel below.

---

## 5. Backend Framework/Runtime

**Technology:** Node.js (via Next.js Route Handlers and Server Actions), with tRPC for internal typed API calls between the Next.js frontend and its own backend logic.

**Purpose:** Implements the API surface for auth-adjacent operations, document upload orchestration, verification, validation, the calculation engine, BRSR mapping, consolidation, and report generation.

**Why chosen:** Keeps the "one app, one language" decision literal — there is no separate backend service to deploy. tRPC gives end-to-end type safety across the whole app without hand-writing/maintaining a REST or OpenAPI schema, which is a meaningful speed win for a small team on a deadline.

**Alternative considered:** A separate Express/Fastify API service. Rejected — would be a second deployable with no benefit here, since Next.js API routes already run on Node and can hold all the same logic.

**Trade-off:** tRPC is TS-only by design, which is fine internally, but it means the Python OCR worker cannot call the app via tRPC — the worker/app boundary uses a plain REST/webhook endpoint and/or direct Postgres access instead (see §11, §23).

**Cost:** Free (open source).

---

## 6. Database

**Technology:** Supabase Postgres (managed PostgreSQL).

**Purpose:** System of record for the organizational hierarchy, users/roles/permissions, ESG records, documents metadata, OCR extractions, verifications, validations, calculations, conversion factors, BRSR mappings, consolidation, audit log, and reports.

**Why chosen:** Relational integrity is essential here — the whole evidence-lineage requirement in `Master_Approach.md` §22 (`Document → OCR → Verification → Calculation → Scope → BRSR → Report`) is a chain of foreign keys. Postgres is the right model for that. Supabase adds managed hosting, Auth, Storage, and RLS on top of plain Postgres, which the team already has working familiarity with.

**Alternative considered:** A self-managed Postgres instance (e.g., on a VPS or RDS) with separately built auth/storage. Rejected — same database engine, strictly more work to reach the same capability, no upside given the team's existing Supabase familiarity.

**Trade-off:** Real platform dependency on Supabase (migrating off later means reimplementing Auth, Storage, and RLS-based authorization elsewhere) — accepted because the underlying data stays plain Postgres, so the worst case is a genuine-but-bounded migration, not a rewrite.

**Cost:** Supabase free tier covers the hackathon build; paid tiers (still moderate) needed once real data volume/usage grows post-pilot.

---

## 7. Authentication

**Technology:** Supabase Auth.

**Purpose:** User login/session management for all roles (Admin, HR, Project Manager, EHS/Environment, Finance/CSR, Procurement, Corporate ESG/Sustainability).

**Why chosen:** Comes bundled with the chosen database platform; issues JWTs that can carry custom claims (role, organization-scope) consumed directly by RLS policies — removing the need to hand-build session management, password handling, or token issuance.

**Alternative considered:** NextAuth.js / Auth.js with a custom Postgres adapter. Rejected — would duplicate what Supabase Auth already provides, and would not integrate as cleanly with RLS.

**Trade-off:** Coupled to Supabase's auth model and rate limits on its free tier — acceptable at hackathon/pilot scale.

**Cost:** Included in Supabase's plan; no separate line item.

---

## 8. Authorization/RBAC

**Technology:** Postgres Row-Level Security (RLS) policies, keyed off a `user_org_scope` table (user → role → organization-node assignment), enforced at the database layer; application-level permission checks in the Next.js backend as a second layer for actions that aren't pure row visibility (e.g., "can this role trigger report generation").

**Purpose:** Implements the `User → Role → Organization Scope → Permissions` model from `Master_Approach.md` §4, and ensures a user only ever sees/acts on rows within their assigned organizational scope (Group/Subsidiary/BU/Region/Project/Site/Department).

**Why chosen:** RLS enforces authorization at the data layer, so a bug in application code cannot leak cross-project data — the database itself refuses the query. This is a stronger guarantee than application-only checks and maps naturally onto the hierarchical org-scope model.

**Alternative considered:** Application-layer-only authorization (every query manually filtered in code). Rejected as the sole mechanism — too easy to miss a filter in one code path and leak data; kept only as a secondary layer for non-row-level actions.

**Trade-off:** RLS policies are less familiar to write/debug than plain application code for a team newer to Postgres-level security; mitigated by keeping policies simple and centered on one `user_org_scope` join.

**Cost:** No additional cost — a Postgres feature, included in Supabase.

---

## 9. Object/File Storage

**Technology:** Supabase Storage (S3-compatible object storage), private buckets, signed URLs for access.

**Purpose:** Stores original uploaded documents (bills, invoices, certificates) and any Excel-sheet uploads, per `Master_Approach.md` §36.

**Why chosen:** Bundled with the same platform as the database and auth; supports private buckets with RLS-style access policies, and signed URL generation for time-limited, authorized document access from the frontend.

**Alternative considered:** Raw AWS S3 bucket managed separately. Rejected — would require separately configuring IAM, CORS, and access policies outside Supabase, for no functional gain given Supabase Storage already meets the requirement.

**Trade-off:** Same platform-dependency trade-off as §6; storage is S3-compatible under the hood, so migration is feasible if ever needed.

**Cost:** Included in Supabase free tier up to its storage cap; scales with paid tiers.

---

## 10. OCR/Document Intelligence Technology

**Technology:** PaddleOCR (Baidu, open source), self-hosted — model weights downloaded from the Hugging Face Hub and run locally inside a dedicated Python worker process (not a hosted Hugging Face Inference Endpoint).

**Purpose:** Implements the extraction step of the evidence-first pipeline — document type identification and field extraction with confidence scores, per `Master_Approach.md` §10–§12 and PRD §19.

**Why chosen:** Explicit team decision, for two concrete reasons: (1) cost — no per-call billing, since it's the team's own compute running an open-source model; (2) reliability — a third-party hosted free-tier endpoint risks cold-start delays or throttling during a live demo, which self-hosting avoids entirely once the model is downloaded and warm.

**Alternative considered:** A managed OCR/document-intelligence API (AWS Textract, Azure Document Intelligence, Google Document AI). Rejected — real per-page cost at scale, and a live network dependency during judging. Also considered Tesseract.js (pure JS/WASM, would have kept OCR inside the single TS runtime) — rejected on extraction-quality grounds: classic Tesseract underperforms modern deep-learning OCR on real-world messy scanned bills/invoices, which directly undermines the evidence-first differentiator (more OCR errors → more manual correction burden → weaker demo).

**Trade-off:** Introduces Python as a second runtime, scoped strictly to this one worker; the team has a Python-skilled member to own it. Requires choosing a CPU-friendly PP-OCR model variant (no GPU provisioning) to keep hosting cheap and simple.

**Cost:** Free (open-source model, self-hosted); only cost is the compute host for the worker (see §12).

---

## 11. Background Job/Queue Strategy

**Technology:** A Postgres-backed job table (`document_jobs`) in Supabase — rows created by the Next.js app on upload, polled (short interval) by the Python OCR worker, updated with status/results as processing progresses.

**Purpose:** Decouples document upload (fast, synchronous, user-facing) from OCR processing (slower, must not block the UI), per the asynchronous-OCR requirement in `Master_Approach.md` §12 and PRD §19.

**Why chosen:** Avoids introducing a separate message broker (e.g., Redis) as new infrastructure to operate, when the job state naturally already belongs in Postgres next to the document/ESG record it's processing — one source of truth, one thing to back up, one thing to monitor.

**Alternative considered:** Redis + BullMQ (a common Node queue pattern). Rejected for this build — would add a service to provision, host, and keep alive for marginal benefit at hackathon/pilot volume; can be revisited if OCR throughput ever demands a heavier queue.

**Trade-off:** Polling is less instantaneous than a push-based queue (small latency between job creation and pickup); acceptable given OCR processing itself takes longer than the polling interval anyway. Postgres `LISTEN`/`NOTIFY` can reduce this further without adding new infrastructure, and is the recommended upgrade path if polling latency becomes noticeable.

**Cost:** No additional infrastructure cost — reuses the existing Supabase Postgres instance.

---

## 12. Hosting/Deployment

**App (Next.js):** **Vercel.** Zero-ops, first-class Next.js support, generous free tier, gives a judge-clickable live URL with minimal setup.

**OCR worker (Python/PaddleOCR):** **Render** (or Railway as an equivalent fallback) — a persistent container, not a serverless function, because the worker must keep the PaddleOCR model loaded in memory between jobs. A cold reload of the model on every invocation (as a serverless function would force) would be slow and would undercut the "self-hosted, no per-call cost" rationale for choosing PaddleOCR in the first place.

**Why this split, not a single provider:** Vercel cannot run a long-lived, stateful Python process; a single-VM alternative (running both app and worker together) was considered and left open as a future consolidation, but Vercel is the faster path to a live, judge-facing app right now, and Render/Railway's free/cheap tiers make the second host low-cost.

**Region:** India-region set wherever each provider supports it. **Known constraint:** Supabase supports a Mumbai-adjacent region; Vercel and Render/Railway have more limited India-region availability at the time of writing — this is a real gap to revisit before any production pilot, not something to assume is solved by this TRD.

**Cost:** Vercel and Render/Railway both have usable free tiers for a hackathon build; a real pilot will need to move to paid tiers on at least the worker host (Render/Railway free tiers commonly sleep idle services, which is unacceptable for a system judges/users expect to be live).

---

## 13. Third-Party Services/APIs

| Service | Purpose | Notes |
|---|---|---|
| Supabase | Postgres, Auth, Storage, RLS | Core platform dependency, see §6–§9 |
| Hugging Face Hub | Source of PaddleOCR model weights | Download-time dependency only — once weights are cached in the worker's deployment, the app has no runtime dependency on Hugging Face's availability |
| Sentry | Error tracking (JS + Python) | See §19 |
| Resend (or equivalent) | Transactional email for notifications (P1) | Optional for MVP; only needed once email notifications (PRD §32) are built |

No other third-party regulatory data, calculation, or AI service is used to produce a reported value — consistent with PRD §12's "AI must not be the sole authority for regulatory calculations."

---

## 14. Key Libraries

- **Next.js**, **React**, **TypeScript** — app framework/language.
- **tRPC** — typed internal API layer between Next.js frontend and backend logic.
- **Zod** — schema validation (form input, API payloads, OCR-extracted field shape validation).
- **TanStack Query** — client-side data fetching/caching for dashboards, submission lists, status views.
- **Supabase JS client** (`@supabase/supabase-js`) — DB/Auth/Storage access from the Node/Next.js side.
- **PaddleOCR** (Python) + **PaddlePaddle** framework — OCR inference in the worker.
- **puppeteer-core** + **@sparticuz/chromium** — server-side HTML-to-PDF report rendering (see §17).
- **Sentry SDKs** (`@sentry/nextjs`, `sentry-sdk` for Python) — error tracking across both runtimes.
- **date-fns** — date/period handling (reporting period logic, effective-date checks on conversion factors).

---

## 15. State/Data-Fetching Strategy

Server Components and Server Actions handle most initial-load and mutation logic directly against Supabase/tRPC on the server, minimizing client-side state. Where client-side interactivity is needed (e.g., the OCR verification screen's live edit/confirm flow, dashboards with filters), **TanStack Query** manages fetching, caching, and revalidation against the tRPC API. This avoids introducing a heavier client-state library (Redux, Zustand) that this app's data shape doesn't need — most state is server-owned records, not complex client-only UI state.

---

## 16. Validation Technology

**Zod**, used at three points: (1) API input validation at the tRPC layer (reject malformed requests before they touch business logic); (2) OCR-extracted field shape/type validation before a record can move to human verification; (3) the domain validation engine itself (format, organizational, period, evidence, logical checks per PRD §29) is implemented as explicit TS validation functions operating on Zod-validated data, not generic form-validation — this is business logic, not just input sanitization, and is written and tested as such.

---

## 17. PDF/Report Generation Approach

**Technology:** Server-rendered HTML → PDF via headless Chromium (`puppeteer-core` + `@sparticuz/chromium`, the standard combination for running headless Chrome inside a serverless/constrained environment like Vercel).

**Why chosen:** BRSR/ESG reports involve complex tabular layouts (consolidated tables across org levels, drill-down references) that are far easier to express and iterate on as styled HTML/CSS (reusing the same components the dashboard already renders) than to rebuild in a PDF-specific layout engine.

**Alternative considered:** `@react-pdf/renderer` (React-based, purpose-built PDF layout library). Rejected as the primary approach — its own layout primitives don't reuse existing dashboard HTML/CSS, meaning report layouts would effectively be built twice; kept as a fallback option if headless-Chromium cold-start size/time on Vercel becomes a practical problem.

**Trade-off:** Headless Chromium is a heavier dependency than a pure-JS PDF library; `@sparticuz/chromium` exists specifically to make this workable within Vercel's serverless constraints, but it's a known source of cold-start latency and deployment-size limits worth monitoring.

**Cost:** Free (open source); runs within existing Vercel hosting.

---

## 18. Logging/Monitoring

- **App (Next.js/Node):** Vercel's built-in request/function logs for baseline visibility; structured logging via `pino` for anything beyond simple request logs (e.g., calculation-engine execution, validation failures) so logs are queryable, not just printed text.
- **OCR worker (Python):** Standard Python `logging` module, structured (JSON) output, captured by Render/Railway's log stream.
- Both feed into Sentry for error-level events (see §19); logs stay in each platform's own log stream for lower-severity operational visibility, since a dedicated log-aggregation platform (Datadog, etc.) is not justified at this scale/cost point yet.

---

## 19. Error Tracking

**Technology:** Sentry, with SDKs installed in both the Next.js app and the Python OCR worker.

**Why chosen:** One error-tracking platform covering both runtimes, with a genuinely usable free tier, first-class Next.js integration (source maps, server + client error capture), and a mature Python SDK for the worker.

**Alternative considered:** Provider-native logs only (Vercel + Render dashboards) with no dedicated error tracker. Rejected — no cross-runtime error aggregation, no alerting, no stack-trace grouping; not sufficient once the system has two separate processes that can each fail independently.

**Cost:** Sentry's free tier covers hackathon/early-pilot error volume.

---

## 20. Security Architecture

- **Authentication:** Supabase Auth-issued JWTs, short-lived, refreshed via Supabase's standard flow.
- **Authorization:** RLS at the database layer (§8) as the primary control; application-level checks as a second layer for non-row-level actions (e.g., who may trigger a consolidated report generation, who may edit conversion factors).
- **Service-role key discipline:** the Supabase service-role key (which bypasses RLS) is used **only** in trusted server-side contexts (Next.js Server Actions/Route Handlers, the Python worker) and is never sent to the client.
- **Document access:** Supabase Storage buckets are private; the frontend never gets a public bucket URL — it gets short-lived signed URLs generated server-side after an authorization check.
- **Least privilege:** every role's permission set is scoped to its assigned organizational nodes only (PRD §33), enforced by RLS, not by trusting the frontend to only request what it's "supposed to."
- **Admin-only configuration actions:** conversion factor management, BRSR mapping management, organizational hierarchy management, and user/role management are all gated behind an explicit Admin-role check in both RLS policy and application logic (defense in depth).

---

## 21. Data Encryption Approach

- **In transit:** TLS is enforced end-to-end by the managed providers — Vercel, Supabase, and Render/Railway all terminate TLS by default; no custom transport-security code is written.
- **At rest:** Supabase Postgres and Supabase Storage encrypt data at rest by default as part of the managed platform; the team does not build or manage its own encryption-at-rest layer, since duplicating a guarantee the platform already provides would add risk (custom crypto) without benefit.
- **Secrets:** never committed to the repository; managed via each platform's environment-variable/secret store (Vercel project env vars, Render/Railway env vars, GitHub Actions secrets for CI). See §33 for the list of variable **names** (no values).

---

## 22. API Architecture

Internal API (Next.js frontend ↔ Next.js backend logic): **tRPC**, fully typed, no separate schema definition/maintenance.

External-facing boundary (Python OCR worker ↔ app): a small set of plain **REST** endpoints/webhooks (since the worker is not TypeScript and cannot consume tRPC), plus direct, scoped Postgres access via the `document_jobs` table described in §11. This boundary is intentionally minimal — the worker's contract with the rest of the system is "read a pending job, write back extracted fields + confidence scores + status," nothing more.

No public, versioned, third-party-facing REST API is built for the MVP — out of scope per PRD §36 (no external integrations yet); the seam for one exists at the tRPC/REST boundary if needed later (see §42).

---

## 23. OCR Pipeline Architecture

```
Next.js app                              Python OCR worker
------------                              -----------------
1. User uploads document
2. File → Supabase Storage (private bucket)
3. Document row created (status: Document_Uploaded)
4. document_jobs row created (status: Pending)
                                           5. Worker polls document_jobs for Pending rows
                                           6. Worker downloads file from Supabase Storage
                                           7. PaddleOCR loads (already warm) → runs inference
                                           8. Worker extracts fields + per-field confidence scores
                                           9. Worker writes results back:
                                              - OCR_extraction row (raw extracted values)
                                              - OCR_field rows (value, confidence, field name)
                                              - document_jobs row updated (status: Completed | Failed)
10. App polls/subscribes to job completion
11. Verification screen renders document + extracted fields + confidence
12. User confirms/edits/rejects → verified value stored, tagged to user + timestamp
13. Validation engine runs (§16 / PRD §29)
14. Calculation engine runs (§24)
```

**Failure handling:** if the worker cannot process a document (unreadable file, unsupported format, model error), the `document_jobs` row is marked `Failed` with an error reason; the document record is marked `Incomplete` per PRD §19 rule 11 — the system never invents a value for a field it couldn't extract.

**Confidence threshold:** a configurable per-field confidence threshold (stored as configuration, not hard-coded) determines whether a field is flagged as "requires verification" in the UI; low-confidence fields cannot be silently confirmed.

---

## 24. Calculation Engine Architecture

Implemented entirely in TS, inside the main Node backend (see §2 principle 5 and the explicit team decision that the calc engine stays out of Python).

```
Verified Activity Data (from Postgres)
   → Unit Normalization (pure TS function, supported-unit table)
   → Conversion Factor Selection (query ConversionFactor by activity_type + effective date + geography)
   → Formula Application (pure TS function, versioned formula reference)
   → Result (emission value + unit)
   → Scope Classification (Scope 1 / Scope 2 / applicable Scope 3, per metric configuration)
   → Calculation record persisted:
        input_value, input_unit, normalized_value, factor_id, factor_version,
        formula_version, output_value, output_unit, calculated_at, engine_version
```

Every calculation is a pure function of its stored inputs — given the same activity data and the same factor version, it is exactly reproducible (PRD §30). No LLM or non-deterministic component sits anywhere in this path.

---

## 25. Conversion Factor Architecture

Stored as a Postgres table (`conversion_factors`), per `Master_Approach.md` §25 and PRD §20:

```
factor_id, factor_name, activity_type, source, value,
input_unit, output_unit, geography, standard_reference,
version, effective_from, effective_to, status, notes
```

Never hard-coded in application code. Admin (and authorized ESG personnel, gated by role) manage factors through an admin UI backed by standard CRUD against this table; factor lookups in the calculation engine always resolve to the version effective for the record's reporting period, never "whatever the latest row is" — this is what makes past calculations reproducible even after a factor is later updated.

Exact factor values and standards are **[VERIFY AGAINST AUTHORITATIVE SOURCE]** during data setup, per PRD §20/§40 — this TRD defines the storage/versioning mechanism, not the values themselves.

---

## 26. BRSR Mapping Architecture

Stored as Postgres configuration tables (`brsr_sections`, `brsr_indicators`, `esg_metric_brsr_mapping`), per `Master_Approach.md` §28 and PRD §27:

```
ESGMetric --(many-to-many via mapping table)--> BRSRIndicator --(belongs to)--> BRSRSection
```

Each `ESGMetric` row carries: unit, frequency, source type, evidence requirement, validation rule reference, calculation rule reference, applicable scope, and its BRSR mapping. Report generation queries this mapping layer to assemble BRSR output — the report renderer has no hard-coded BRSR questions in its code, only a template that walks the configured mapping. Exact BRSR section/indicator structure is **[VERIFY AGAINST AUTHORITATIVE BRSR SOURCE]** before populating this configuration.

---

## 27. Audit Trail Architecture

A single `audit_log` table, append-only (no updates/deletes at the application layer):

```
event_id, user_id, timestamp, action, record_type, record_id,
old_value (jsonb, nullable), new_value (jsonb, nullable), reason (nullable)
```

Written by a shared server-side helper called at every material action (document upload, OCR completion, field edit, verification, validation result, factor selection, calculation, approval/rejection, configuration change, report generation) — implemented once, called everywhere, so no code path can silently skip audit logging. RLS restricts read access to Admin/authorized reviewer roles; no role can write directly to this table except through the shared helper (enforced via a Postgres role/policy that only the backend's service role can insert).

---

## 28. Notification Architecture

MVP: in-app notifications only — a `notifications` table (user_id, type, payload, read_at), populated by the same server-side action helpers that write audit events, rendered as a notification list/badge in the dashboard. Covers PRD §32's required triggers (verification required, low-confidence extraction, validation failure, record returned, approval required, deadline approaching, missing documents).

P1 (Should Have): email notifications via a transactional email provider (e.g., Resend), triggered from the same events — deferred from MVP per PRD §14, not built until the in-app path is solid.

---

## 29. Scalability Strategy

- **Database:** Supabase Postgres connection pooling (PgBouncer, included) to handle concurrent access as user/project count grows; indexes on the organization-hierarchy foreign keys and reporting-period columns, since nearly every query filters by org scope and period (per `Master_Approach.md` §46 point 14).
- **OCR worker:** stateless with respect to job assignment (any worker instance can pick up any pending job from `document_jobs`), so horizontal scaling is "run more worker instances," not an architecture change.
- **App:** Vercel scales the Next.js app automatically; no action needed at hackathon/early-pilot scale.
- **Organizational hierarchy:** modeled as a single self-referencing table (or a small set of tables) with a configurable depth, not a fixed number of hard-coded levels/tables per PRD §11 — adding a subsidiary or a new project is a data insert, not a schema change.

---

## 30. Backup/Recovery Approach

Relies on the managed platforms' built-in guarantees rather than custom backup tooling: Supabase provides automated daily backups (point-in-time recovery available on paid tiers) for Postgres, and Storage objects are stored redundantly by the underlying S3-compatible infrastructure. For the hackathon phase this is sufficient; before a real pilot goes live, upgrading to a Supabase tier with point-in-time recovery is a configuration change, not an architecture change — flagged here as a pre-production checklist item, not solved by this TRD.

---

## 31. Folder/Project Structure

Single monorepo, pnpm workspaces:

```
/apps
  /web              — Next.js app (frontend + backend logic + tRPC API)
  /ocr-worker        — Python OCR worker (PaddleOCR)
/packages
  /shared-types      — TS types shared across app code (generated/hand-written DB types)
/supabase
  /migrations        — SQL migrations (schema, RLS policies)
/ps_documents         — existing project documentation (PRD, TRD, source material)
```

Two apps, one monorepo — kept simple deliberately; no shared-code package between `web` and `ocr-worker` since they're different languages (their only contract is the `document_jobs` table + Storage, both external to either codebase).

---

## 32. Naming Conventions

- **Database:** `snake_case` table and column names (Postgres convention); table names plural (`users`, `esg_records`, `conversion_factors`).
- **TypeScript:** `PascalCase` for types/components, `camelCase` for variables/functions, files kebab-case (`ocr-verification-screen.tsx`).
- **Python:** standard PEP 8 — `snake_case` for functions/variables, `PascalCase` for classes.
- **API (tRPC) procedures:** namespaced by domain (`documents.upload`, `verification.confirm`, `factors.list`), mirroring the module boundaries in this TRD.

---

## 33. Environment Variables

Names only — no values. Never committed to source control.

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET_EVIDENCE=

# Database (direct Postgres access, e.g. for migrations)
DATABASE_URL=

# OCR worker
OCR_MODEL_PATH=
OCR_WORKER_POLL_INTERVAL_MS=
OCR_WORKER_INTERNAL_API_KEY=

# App <-> worker boundary
APP_WEBHOOK_SECRET=

# Error tracking
SENTRY_DSN=
SENTRY_AUTH_TOKEN=

# Email (P1)
RESEND_API_KEY=

# Auth
AUTH_SECRET=

# General
NODE_ENV=
```

---

## 34. Development Environment

- Node.js + pnpm for the `web` app; local `.env.local` pointing at either a hosted Supabase dev project or the Supabase CLI's local Docker-based stack (Postgres + Auth + Storage emulated locally) for offline development.
- Python (via `venv`/Poetry) for the `ocr-worker`, with the same `document_jobs`-polling logic running against the same dev Supabase project.
- Shared `supabase/migrations` directory applied via the Supabase CLI so both frontend and worker developers stay on the same schema.

---

## 35. Production Environment

- Next.js app deployed to Vercel (production project, India-region-adjacent settings where configurable), connected to the production Supabase project (India/Mumbai-adjacent region).
- OCR worker deployed to Render/Railway as a persistent service, connected to the same production Supabase project, with the PaddleOCR model weights baked into the deployed image (not downloaded at cold start) to avoid a Hugging Face Hub runtime dependency in production.
- Environment variables set per-platform via each provider's secret/env store (§33).

---

## 36. Deployment Architecture

```
                 ┌─────────────────────┐
   Browser  ───▶ │   Vercel (Next.js)   │
                 │   app + tRPC API     │
                 └─────────┬────────────┘
                           │  reads/writes
                           ▼
                 ┌─────────────────────┐
                 │  Supabase (Postgres, │
                 │  Auth, Storage, RLS) │
                 └─────────┬────────────┘
                           ▲  polls document_jobs,
                           │  reads/writes Storage
                 ┌─────────┴────────────┐
                 │ Render/Railway        │
                 │ Python OCR worker     │
                 │ (PaddleOCR, warm)     │
                 └───────────────────────┘
```

Two independently deployed services (Vercel app, Render/Railway worker) sharing one Supabase backend as the integration point — no direct network call is required between the app and the worker for the core OCR flow (they communicate via the shared `document_jobs` table and Storage bucket), which keeps the two deployments loosely coupled and independently restartable.

---

## 37. CI/CD Approach

**GitHub Actions:**
- On every PR: typecheck (`tsc --noEmit`), lint, and run any unit tests for the `web` app; lint/type-check (e.g., `mypy`/`ruff`) for the `ocr-worker`.
- On merge to `main`: Vercel auto-deploys the `web` app (Vercel's native GitHub integration, no custom workflow needed); Render/Railway auto-deploys the `ocr-worker` on push (native GitHub integration on both platforms).
- Supabase schema migrations applied via the Supabase CLI, run as an explicit step (not blindly automatic against production) to keep schema changes reviewable.

No custom deployment scripting is built beyond what these platforms' native GitHub integrations already provide — consistent with the low-operational-complexity principle.

---

## 38. Technical Constraints

- No GPU available/assumed — the OCR worker must run a CPU-friendly PaddleOCR/PP-OCR model variant.
- Vercel serverless functions have execution-time and memory limits — nothing long-running or stateful (like holding a loaded ML model) can live in a Vercel function; this is precisely why the OCR worker is hosted separately (§12).
- Render/Railway free tiers commonly idle/sleep unused services — acceptable for early hackathon testing, **not** acceptable for the actual judging window or any pilot; the worker must run on a tier that stays warm during demo/production.
- True India-region availability differs across providers (Supabase yes; Vercel/Render more limited) — a known, currently-unresolved constraint, not something this TRD claims to have fully solved.

---

## 39. Performance Expectations

Stated qualitatively, not as invented SLAs: document upload should feel instant to the user (synchronous, fast write to Storage + DB); OCR extraction runs asynchronously in the background and the user is not blocked waiting for it — the verification screen becomes available once the worker completes the job, with the UI reflecting job status in the meantime (Pending/Processing/Completed/Failed). Calculation and validation, being pure in-process logic against already-loaded data, are expected to be near-instant relative to OCR. No numeric latency targets are asserted here without load-testing data; they should be established empirically once the MVP is running.

---

## 40. Security Constraints

- No secret values in source control or in any project document (§33 lists names only).
- Service-role Supabase key never reaches the client; used only in trusted server contexts.
- All document access goes through signed URLs, never public bucket links.
- Admin-only actions (user/role management, factor management, BRSR mapping management, hierarchy management) are enforced by RLS policy, not merely hidden in the UI.
- No generative AI component has write access to a final reported ESG/BRSR value — AI-assisted features (classification, anomaly/duplicate detection, mapping suggestions) always produce a suggestion a human or deterministic rule confirms, never a direct write to a calculation or report.

---

## 41. Third-Party Dependency Risks

| Dependency | Risk | Mitigation |
|---|---|---|
| Supabase | Platform lock-in for Auth/Storage/RLS | Underlying data is plain Postgres — a migration is real work but not a rewrite |
| Hugging Face Hub | Only a download-time dependency for model weights | Weights are baked into the deployed worker image; no runtime dependency on HF availability in production |
| PaddleOCR / PaddlePaddle | Smaller ecosystem/community than mainstream cloud OCR APIs; self-support burden | Owned by the team's Python-skilled member; CPU-friendly model variant reduces infra risk |
| Render/Railway free tier | Idle-sleep behavior unacceptable for live demo/production | Must move to an always-on paid tier before judging/pilot, not left on free tier |
| Vercel/Render India-region gaps | Data may not fully reside in India end-to-end yet | Explicitly flagged as unresolved (§12, §38); revisit before any real pilot commitment |

---

## 42. Future Integration Strategy for SAP/Oracle/IoT

Per `Master_Approach.md` §46 point 10 and PRD §14 (P2), no ERP/IoT integration is built for the MVP. The architecture leaves a seam for it: the `document_jobs`/evidence-record model treats "a document was uploaded and extracted" as one specific ingestion path — a future SAP/Oracle connector or IoT meter feed would populate the same downstream tables (`ESGRecord`, verified activity data) through a new ingestion adapter, without needing to touch the calculation engine, validation engine, BRSR mapping, or consolidation logic, all of which operate on verified activity data regardless of how it arrived. This is a design intention to preserve, not a component being built now.

---

## 43. Architecture Decision Summary

| # | Decision | Alternative rejected | Core reason |
|---|---|---|---|
| 1 | Single TypeScript runtime for the app (Next.js/Node) | TS + Python split across app logic | Team-wide TS comfort; avoids polyglot deploy overhead under deadline |
| 2 | Self-hosted PaddleOCR (Baidu) in an isolated Python worker | Managed OCR API; Tesseract.js | Cost control, demo reliability, and extraction quality on real bills |
| 3 | Supabase for Postgres + Auth + Storage + RLS | Self-managed Postgres + custom auth/storage | Matches existing team skill, collapses plumbing under time pressure |
| 4 | Calculation engine in TS, inside the main app | Calculation engine in Python | Deterministic arithmetic, not ML; stays transactionally close to API/audit writes |
| 5 | Vercel (app) + Render/Railway (OCR worker) split hosting | Single-provider/single-VM hosting | Vercel can't hold a warm ML model; worker needs a persistent process |
| 6 | Postgres-backed job table for OCR async processing | Redis + BullMQ | Avoids new infrastructure; job state naturally lives next to the record it's processing |
| 7 | tRPC for internal API, plain REST/webhook for app↔worker boundary | Full REST/OpenAPI across the board | End-to-end type safety within the TS app; REST only where the language boundary forces it |
| 8 | India-region hosting wherever available now | Region-agnostic hosting, revisit later | Migrating populated data across regions later is far more expensive than choosing correctly up front |

---

*End of 02_TRD.md. See `.grill/trd-tech-stack.md` for the full reasoning trail behind these decisions. Downstream documents (SRS, database design, API specification, OCR/document-intelligence specification, calculation-engine specification, BRSR mapping document, role/permission matrix, UI/UX specification, security design, testing plan, deployment plan) should build on this TRD together with `Master_Approach.md` and `01_PRD.md`.*
