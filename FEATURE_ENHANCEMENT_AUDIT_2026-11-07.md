# Feature enhancement roadmap — Phase 0 audit (2026-11-07)

Phase 0 of `PS_Documents/implementation_docs/feature_enhancement.md`. Read-only: no application code, migration or
hosted data was changed. Each of the 40 source requirements was checked against the code on branch
`feature-tree-notifications-periods` (`27af805`). The statuses are kept in that document's appendix.

## 1. Architecture as it stands

| Layer | What it is | Where |
|---|---|---|
| Web app | Next.js 16.3.8 (App Router, Turbopack), React 19, Tailwind v4, shadcn/ui | `apps/web` |
| API | tRPC 11, 25 routers; every procedure checks session, permission and org scope on the server | `apps/web/lib/trpc/routers/*` |
| Database access | postgres.js through `lib/db.ts` (bypasses RLS, so scope is checked in code: `lib/auth/scope.ts`) | `apps/web/lib/db.ts` |
| Database | Supabase PostgreSQL 17.6, 53 migrations, 50 tables, RLS on every table, append-only audit log and calculations, `pg_cron` job (period auto-close) | `supabase/migrations` |
| Auth | Supabase Auth, HttpOnly cookies, invitation links (`0051`), session limits 3 h idle / 12 h absolute (`0052`, `user_sessions`) | `apps/web/lib/auth/*` |
| Roles | `admin` = Super Admin (max 2), `org_admin` = Administrator scoped to a unit and below, 6 functional roles; 17 permissions | `0009`, `0050` |
| Files | Private Supabase Storage buckets `evidence` and `reports`; each upload stored under its own UUID, never overwritten | `routers/documents.ts` |
| OCR | Python 3.12 PaddleOCR worker polling `ocr_jobs`; rule-based field extraction and keyword classification (`rules-13`); runs as a Docker container on the owner's laptop | `apps/ocr-worker` |
| Reports | Snapshot (version 4, SEBI BRSR full format) rendered to PDF by headless Chromium | `lib/reports/*` |
| Email | Brevo SMTP (`nodemailer`) | `lib/email/brevo.ts` |
| Chatbot | NVIDIA NIM, read-only tools, `chat_reader` role | `lib/chat/*` |
| Hosting | Vercel (`emeilsg-devx.vercel.app`, deploys from `origin` = MACRO72, live build `b462a2b`); hosted Supabase `qcobpqkmlojyznkefnpt` (Mumbai) | `DEPLOYMENT.md` |

Database overview: `database_dump/DATABASE_DOCUMENTATION.md` (written 2026-11-05: every table, relationships, which
columns hold personal data).

## 2. The workflow today

```
Upload (role + activity + project) ── same-file / same-period warnings, must be acknowledged
  → OCR job (worker) ── classify among the activity's document types, extract fields + confidence
  → Verify extraction (submitter) ── flagged fields must be edited or acknowledged; zoomable viewer
  → Validation (6 categories, in Confirm's transaction) ── fail = returned, flag = Admin review queue
  → Calculation (versioned factor; missing factor blocks the number, not the queue)
  → Approval (approver in scope or Admin; no self-approval) ── approve / return with reason
  → Consolidation (org tree, shared units) → Control Tower, Scope 1/2/3, Data Explorer
  → Report (Admin / Administrator) → PDF + drill-down to the original document
Reporting period: draft → open → closed (auto-closed at submission_closes_on by pg_cron, 0053)
Every step writes an audit entry in the same transaction.
```

## 3. Baseline (before any change)

| Check | Result |
|---|---|
| `pnpm typecheck` | Pass |
| `pnpm lint` | Pass |
| `pnpm format:check` | Pass |
| `pnpm test` (web unit) | 218 / 218 pass |
| Production build | Not run in Phase 0 (last passed on `27af805`'s predecessor work, 2026-11-01) |
| Database tests (pgTAP), end-to-end suite | Not run: they need the local Supabase stack. Last full end-to-end run 519/519 (2026-10-13); `feedback-2026-11.mjs` 88/88 (2026-11-01) |
| Live site | `/` and `/login` return 200; runs `b462a2b`, two commits behind `ucn/main` |

## 4. The 40 requirements against the code

Legend — **Exists**: built, needs only verification; **Partial**: some of it is built; **Missing**: nothing built.

| # | Requirement | Found | Evidence and gap |
|---|---|---|---|
| 1 | Original document as attachment; unify Submission + OCR Monitoring | Partial | The record drawer (Submission Monitoring, Data Explorer, queues) already shows the document in `DocumentViewer`. OCR Monitoring's drawer shows fields only, no document. The two pages are separate. |
| 2 | PDF preview instead of filename | Partial | Preview exists in the drawer; the table rows show the filename. Which screen the complaint is about must be confirmed. |
| 3 | Mobile navigation, bottom tabs, scrolling | Missing | Below 1280px the sidebar becomes an icon rail; no bottom navigation. ui lane. |
| 4 | Simplify pending-approval UI | Partial | `/app/approvals` and `/admin/approval-queue` exist. "Simpler" is undefined. |
| 5 | Scope 1/2/3 chart/table toggle | Partial — **cause found** | The Chart button only changes the "By organization unit" section, which appears only when the unit has children. At a project, or a unit with no children, it changes nothing visible; categories, activities and records are always tables (`components/scope/scope-dashboard.tsx`). |
| 6 | Ask button UI and glow | Exists | `components/chat/chat-launcher.tsx`. Design change, ui lane. |
| 7 | Factor source URL, automatic extraction | Partial | A free-text `source_reference` is required; no URL field, no publisher, no fetch. |
| 8 | Unwanted tap cursor on mobile / desktop-site | Partial — **conflict** | The custom cursor runs when any input is a fine pointer (`registry/magicui/pointer.tsx`, changed 2026-11 so it shows on the owner's pen laptop). On touch devices with a fine-pointer input, taps move the custom cursor. Fixing this must not undo that fix. |
| 9 | Forward reports to upper-level verification | Missing | Reports have no forwarding, recipient or verification state. |
| 10 | Reminders 5 d, 3 d, same day; email; visual | Partial | Three separate mechanisms: (a) an in-app "deadline approaching" note once per period when ≤ 3 days remain, written only when the person's bell polls, no email; (b) the Deadlines page's escalation sweep (due soon ≤ 7 d, overdue +3 d / +7 d, in-app + email, deduplicated), run only when a Super Admin presses the button; (c) manual "Send reminders" for missing submissions. Nothing runs on a schedule. |
| 11 | Show/hide password on forgot-password | Partial | `PasswordInput` is on sign-in, change-password and invite; forgot-password and reset-password still use a plain field. |
| 12 | Audit Trail search bar | Missing | Filters by user, event, entity, id, dates; no free-text search. |
| 13 | Human-readable permission labels | Partial | Roles screen shows the code (`document.upload`) in monospace above its description. |
| 14 | Mobile application | Missing | After feature freeze by the document's own rule. |
| 15 | Handwriting recognition, Excel recreation, confidence boxes | Missing — **blocked** | The OCR model is a printed-English recogniser. The reference diagram from Nihar has not been provided. |
| 16 | Parent-child reminders from one week | Partial | The sweep in 10(b) has recipients by owner and escalation; parent-entity recipients unclear. |
| 17 | SEBI API for annual factors | Missing — research | SEBI's BRSR is a disclosure format; no SEBI emission-factor API is known. CEA's grid factor is an annual publication, not an API. To be confirmed by research before any build. |
| 18 | Super Admin one active login | Missing | `user_sessions` records every sign-in (`0052`) but does not limit how many are open. |
| 19 | Context-aware search | Partial | Records search (`q`) exists in Data Explorer and Submission Monitoring only. |
| 20 | Security audit | Partial | Seven audits on 2026-10-12 (open: 2 Medium, 18 Low). Code since then — migrations `0050`–`0053`, invitation links, sessions, `setEmployeeId`, notification pop-ups — has not been audited. |
| 21 | FAQ, documentation, blueprint | Missing | No help route. The landing page has an FAQ section. |
| 22 | Duplicate review flow; show every stage | Partial | Same-file (SHA-256, organisation-wide) and same project+period+activity warnings must be acknowledged; duplicate invoice numbers are flagged at validation; every stage has a status. No single stage tracker on a record. |
| 23 | Same-name file storage and replacement | Exists (rules) | Files are stored under a new UUID each time, never overwritten; file names are never compared; re-upload after rejection links `replacesDocumentId`. Policy across periods is not written down. |
| 24 | One-week window, daily notifications | Missing | 10(a) fires once; 10(b) is manual. |
| 25 | Category filter by OCR-detected bill type | Missing | `documents.document_type_id` is set by OCR or the person; no filter on it. |
| 26 | OCR Monitoring UI, colour coding | Partial | Status and confidence filters and badges exist. |
| 27 | Billing period missing from images | Unknown | Rules read labelled periods and PREV/PRES dates. Needs the failing image to reproduce. |
| 28 | Automatic category detection | Partial | Classification chooses only among the document types of the activity the person picked. The multi-bill split proposes the activity. |
| 29 | Every user sees their own logs | Missing | Audit Trail needs `audit.view` (Super Admin only). |
| 30 | Hierarchy- and role-specific audit access | Missing | As 29. |
| 31 | 3–4 report templates | Missing | One template: SEBI BRSR full format. |
| 32 | No multiple logins from one device | Missing — **undefined** | Meaning must be decided (§5). |
| 33 | Year-wise trends and recommendations | Partial | KPI trends by financial year (Control Tower), Forecast and Simulator exist. No recommendations. |
| 34 | Alert when emissions exceed expected average | Partial | Per-record anomaly check (× 2 or ½ of the median of 3+ earlier periods) flags records at validation. No alert on totals. |
| 35 | Carbon-credit reference and external redirect | Partial | Carbon credits pages exist (ledger, batches; a configured or invented price). No external reference. |
| 36 | Zoom on the verification page | Exists | `DocumentViewer` zooms 50–300 % on PDFs and images. To verify in a browser on the owner's device. |
| 37 | Local database server | Partial — **deferred by the owner** | A sanitised dump and its validation exist (`database_dump/`). The owner deferred the move until after the HoD demo and a data wipe. |
| 38 | OCR to Excel, red cells, synchronised highlight | Missing | Extraction is field-based, not tabular; OCR line boxes are already stored (`ocr_extractions.raw_output`), so highlighting a field's source region is feasible. |
| 39 | Define financial / reporting / submission periods | Exists (mostly) | Periods with open/close, `submission_closes_on` auto-close, FY April–March in consolidation and reports, centrally set by a Super Admin. Grace period and late submission not defined. |
| 40 | Landing page UI/UX | Exists | ui lane, `docs/LANDING_PAGE_BRIEF.md`. |

## 5. Risk and dependency register

| Risk | Effect | Mitigation |
|---|---|---|
| Phase 1.1 (local database) is first in the document but deferred by the owner | Following the document literally would move the database before the HoD demo | Owner decides order (question 1) |
| Live site is `b462a2b`; `ucn/main` is `27af805` | Anything new is invisible on the live site until `origin` is pushed | Owner decides when |
| One hosted database shared by the dev server and the live site | A migration pushed for development changes the live site's database at once | Migrations only after the owner's go-ahead; additive first |
| OCR worker runs on the owner's laptop | Uploads stall when the laptop sleeps or memory runs out | Host decision (open since Phase 21) |
| Two roles, two lanes | About a third of the items (3, 6, 8, 40, parts of 1, 2, 5, 9, 12) are ui-lane work | Owner confirms who builds them |
| Requirements 32, 15, 17, 27, 2, 4 are undefined or need input | Building on a guess | Questions before each phase |
| Machine memory (~12 GB) | Full test runs need the local stack; one heavy process at a time | Known procedure (`CONTEXT.md` §5) |

## 6. Decisions needed (from the document's §5, plus what Phase 0 found)

Asked one at a time in the session; answers are recorded in `.grill/feature-enhancement-roadmap-decisions.md`.
