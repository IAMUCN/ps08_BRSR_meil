# EmeilSG — Context for the Mid-Evaluation Presentation

Everything built so far, written so a presentation can be made from it without opening the code.
Prepared 2026-10-09 and **brought up to date for the final submission on 2026-11-13** (88 database migrations; the
full feature list is `FEATURES.md`; sections 0, 4 and 17 below reflect the final state, the others describe the
core flow, which has not changed) from the repository and the project records (`PROGRESS.md`, `CONTEXT.md`, `.grill/`). Where something is unfinished or untested, this file says so — do
not present those items as done.

**Hackathon:** BPUT Hackathon 2026, Problem Statement 8 — _Development of an Online Portal for BRSR Reporting of
Corporate ESG Report._ **Industry partner:** Mega Engineering and Infrastructure Limited (MEIL).

---

## 0. What changed since the mid-evaluation (read this first)

The product is **EmeilSG**; its chatbot is **Tracey**. Everything below was added after the first version of this
file; `FEATURES.md` has the complete list and where each feature lives.

- **Manual entry for every submission** (the jury's feedback): the Upload page is a table of rows — bill type, billing
  period, the value typed from the bill, the unit, the evidence. OCR still reads each bill; the typed and read values
  are compared, and a difference must be settled on Verify. An Automatic mode keeps the drop-the-bills flow.
- **Tracey, the ESG data analyst:** ask questions about the data you may see; the language model only words the
  answer, every figure comes from read-only tools inside your org scope. Runs on NVIDIA NIM or a local Ollama model.
- **Two-step sign-in** with an authenticator app for every sign-in (and Google sign-in for registered accounts);
  one session per account; session time limits; invitation links instead of emailed passwords.
- **More roles and scope:** Super Admin, Administrator, **BU Manager**, Corporate ESG, Employee (uploads for a
  project manager), Assurance Reviewer; role-wise dashboards; employee register; overdue escalation.
- **The full SEBI format:** all 146 questions, 17 typed SEBI tables with Excel import, energy in GJ, water and
  waste breakdowns; zero values flagged. Figures typed for demonstration are labelled SAMPLE DATA.
- **Reports:** BRSR, BRSR Core, GHG inventory (also as Excel), executive summary; covering a period, a financial
  year, **a quarter (1st–4th)** or a custom range; forwarding for verification; an audit evidence bundle.
- **Carbon Intelligence and the Decision Center:** year-wise trends, suggested actions, emission alerts, forecast,
  what-if simulator, decision rules, risk and recommendations, carbon credit registry. (This replaces the old
  "AI analytics: not built" line.)
- **Operations:** several open periods with late uploads, daily deadline reminders, factor sources with approval and
  yearly review, financial-year and period pickers that never show the future, phone and installable app.

---

## 1. The one-line pitch

**EmeilSG is an evidence-first BRSR portal: people upload the bill, the system reads it, a person confirms it,
and every number in the final SEBI-format report can be clicked back to the original document.**

Three ideas to repeat through the deck:

1. **Evidence first.** Nobody types an emission figure. Every record starts as an uploaded bill, invoice or
   certificate.
2. **AI assists, a person decides.** OCR proposes the values; a person always reviews them; the calculation is
   a fixed formula with a stored factor, never an AI guess.
3. **Audit-ready by construction.** Who uploaded, who verified, who approved, which factor version was used —
   all recorded in a log that cannot be edited, even by the server.

---

## 2. What the industry asked for, and where we stand

From the KT session (`ps_documents/provided_docs/KT_Session_Transcript_and_Context.md`).

| What MEIL asked for | Status |
|---|---|
| Scope 1 — stationary, mobile, process, fugitive (refrigerants, SF6) | Built |
| Scope 2 — purchased power and steam; green power told apart from grid | Built |
| Scope 3 — supplier materials, logistics in and out, commuting, waste, travel by flight / train / bus | Built (6 of 10 categories active) |
| Every entry backed by an official document; traceable; auditable | Built — the core of the product |
| File handling: same filename from different users, who uploaded what | Built |
| Group → Company → Business Unit → Project; entry at project level; rolled up | Built; levels are configurable |
| Own authentication, roles, passwords | Built |
| Emission factors that change over time, not hard-coded, Indian sources | Built; 28 sourced factors entered on the local database |
| Fuel grades kept separate (HSD, petrol, LPG, CNG, PNG, coal grades) | Built |
| About 300 projects, 5–10 users each; data kept across financial years | Built; checked at 300 projects |
| SEBI-format emissions report (Section C) | Built |
| Validation rules; ease of data entry; report quality | Built |
| The industry's additional list of reports | **Not received yet** — nothing to build until they send it |
| The industry's base company tables | **Not received yet** — we use our own tables |
| AI analysis on top of the data | Built after data capture: Tracey (read-only analyst), Carbon Intelligence, Decision Center |

They also said: teams may use their own sample data for mid evaluation; real company data comes to finalists.

---

## 3. How a number is born (the main flow)

```
Upload  →  OCR reads it  →  Person verifies  →  Validation  →  Calculation  →  Approval  →  Roll-up  →  Report
(bill)     (background)     (split screen)      (6 checks)     (factor ×)      (2nd person)  (hierarchy)  (SEBI PDF)
```

1. **Upload** — the user picks the project and the activity (for example "Diesel") and drops a PDF or photo.
   The file's fingerprint (SHA-256) is checked on the server; a duplicate file or a second bill for the same
   month raises a warning that must be acknowledged.
2. **OCR** — a background worker reads the document and proposes the fields: quantity, unit, invoice number,
   billing period. Each field carries a confidence score. A field that cannot be found is left empty, never
   guessed.
3. **Verify** — document on the left, extracted fields on the right. Low-confidence or critical fields are
   flagged; the **Confirm button stays disabled** until each is corrected or marked correct.
4. **Validate** — six kinds of check run automatically (section 7).
5. **Calculate** — quantity × the emission factor in force for that period = kg CO2e. The factor value used is
   stored with the result, so the same record always gives the same number.
6. **Approve** — a different person approves or returns it with a reason. **Nobody can approve their own record.**
7. **Consolidate** — approved records roll up Project → Business Unit → Company → Group.
8. **Report** — a PDF in SEBI's layout. Click a figure in the report and reach the original bill in three clicks.

---

## 4. Users and roles

Eleven roles, thirty-four permissions, all configuration (a Super Admin can add roles, edit them and change the permission matrix; each built-in role has a suggested permission set).

| Role | What they do |
|---|---|
| Super Admin (at most two) | Group-wide configuration and every org unit: organisation, users, factors, mapping, periods, reports, audit trail |
| Administrator | One org unit and everything beneath it: people, hierarchy, queues, figures, reports, uploads |
| BU Manager | One business unit and the projects beneath it (same powers as an Administrator, assignable only at a business unit) |
| Project Manager | Uploads fuel and electricity bills for their project |
| EHS | Waste, water, refrigerants, air emissions |
| HR | Headcount and training records; bulk-imports employees |
| Procurement | MSME sourcing, materials |
| Finance / CSR | Travel, CSR spend, fines |
| Corporate ESG | Approves or returns records, reviews flagged values, generates reports |
| Employee | Uploads on behalf of a Project Manager |
| Assurance Reviewer | Read-only: audit trail, evidence, monitoring |

- A user only sees and uploads for the org units they are assigned to, and only the activities their role owns
  (a Project Manager is never offered a water bill).
- Accounts are created by an Admin — there is no public sign-up.
- Two areas: `/admin` for Super Admins and Administrators (what each page shows follows their scope), `/app` for everyone.
- Every sign-in needs a code from an authenticator app (or an emailed code through "Try another way").

---

## 5. Screens (every page that exists)

**Sign-in:** Login · Forgot password (6-digit code by email) · Set / reset password (live strength meter).

**For users (`/app`)**

| Screen | Purpose |
|---|---|
| Dashboard | Documents to verify, returned items, the project's Scope 1/2/3 totals |
| Upload | One bill, or one PDF holding several bills; drag and drop; animated progress; stays on the page for the next bill |
| Split a multi-bill PDF | The system proposes where each bill starts and what it is; the user checks, edits, confirms, or discards |
| Verify extraction | The split screen described above; reject; manual exception when OCR fails; add supporting files |
| My Submissions | Seven status tabs; whole row clickable; PDFs still waiting to be split are listed on top |
| Approvals | For approvers: calculation trace, document, Approve / Return |
| Notifications | Bell in the top bar plus a full page |
| Bulk import | Employees and org units from an Excel template |
| Profile | Name, password change, forgot-password link |

**For Admins (`/admin`)**

| Screen | Purpose |
|---|---|
| Control Tower | Completion pipeline, Scope 1/2/3 completion, BRSR Readiness %, issue panel |
| Organization | The hierarchy tree; add / move / deactivate; configurable levels; expected submissions |
| Users · Roles & Permissions | Invite, assign, deactivate; permission matrix |
| Reporting Periods | Open / close periods; reopening needs a written reason |
| Submission Monitoring | Every record, filterable; "missing submissions"; CSV export |
| OCR Monitoring | Job status, confidence, retry failed jobs |
| Validation Queue | Flagged records: accept or return |
| Approval Queue | Admin's view of approvals |
| Conversion Factors | Emission factors with versions, sources, gases covered |
| BRSR Mapping | Which activity feeds which BRSR question; readiness tree down to the document |
| BRSR Disclosures | The written answers of SEBI's format, typed once per financial year |
| Scope 1 · Scope 2 · Scope 3 | Totals, by activity, by child org unit, trend, drill-down to the bill |
| Data Explorer | Every record with its values, by period or financial year |
| Reports | Generate a report; turnover / PPP / assurance inputs; every run kept |
| Report detail | The drill-down: report value → question → activity → calculation → document |
| Audit Trail | Every action, filterable, with before / after values; CSV export |

Three colour themes (Corporate, Special, Dark) with a toggle in the top bar; works on tablet and phone widths.

---

## 6. What the system measures

### Scope 1 — direct emissions

| Kind | Activities |
|---|---|
| Stationary / mobile combustion | Diesel (HSD), petrol, CNG, LPG, LNG, PNG; coal by grade — anthracite, bituminous, sub-bituminous, lignite |
| Fugitive | Refrigerant top-ups R-22, R-32, R-134a, R-410A; SF6 |
| Process | Process CO2 (from a process statement) |

Each fuel record can say whether it was used in a generator, a vehicle or equipment — that is how the report
separates stationary from mobile combustion.

### Scope 2 — purchased energy

Grid electricity · renewable electricity (kept separate, zero-factor market-based) · purchased steam ·
purchased heat / cooling.

### Scope 3 — value chain (6 of 10 candidate categories active)

| Category | Activities |
|---|---|
| Purchased goods | Steel, cement (by weight) |
| Upstream transport | Road freight in, by light / medium / heavy truck (by distance); freight by spend |
| Waste in operations | Waste disposed, with treatment route and waste category |
| Business travel | Air, rail, bus / road in passenger-km; travel by spend |
| Employee commuting | Bus in passenger-km; commuting by spend |
| Downstream transport | Road freight out, by truck class |

### Other measured items

Water withdrawal, discharge and consumption · air emissions (NOx, SOx, particulate matter) · employees by
gender · employees trained · MSME share of procurement · CSR expenditure · fines and penalties.

**Everything above is configuration, not code:** activities, fields, formulas, units rules and document types
are rows in the database. Adding 18 activities in one go needed no change to the calculation engine.

---

## 7. Validation — how bad data is stopped

Runs automatically when a person confirms a record.

| Check | Example |
|---|---|
| Format | Required fields present; numbers are numbers and not negative |
| Organisation | The project is active and inside the submitter's scope |
| Evidence | A document is attached and was read (a hand-typed exception is always flagged) |
| Units | Only units allowed for that activity (litres for diesel, kWh / MWh for electricity) |
| Period | The bill's dates overlap the reporting period |
| Duplicates | Same invoice number, or a second grid bill for the same month |
| Anomaly | More than double or less than half the project's usual figure (needs three earlier periods) |

A hard failure goes back to the submitter with the reason; a flag goes to an Admin, who accepts or returns it.
The same rules run in the browser and on the server, so the API refuses what the screen blocks.

---

## 8. Calculation and emission factors

- **Deterministic engine** (version `calc-1.1.0`): normalise the unit → pick the factor version in force for the
  record's period → apply the formula → store the result with the factor value used.
- **Formula types:** multiply (emissions), percentage (for example % women, re-derived from counts), subtract
  (water consumed = withdrawn − discharged).
- **Units handled:** litres, kg, tonnes, kWh, MWh, km / passenger-km, SCM, normal cubic metres, kilolitres, m³.
- **Factors are versioned.** A new version closes the previous one; a version that a calculation has used can
  never be changed (the database refuses). Past periods keep the factor that applied then.
- **No factor, no number.** A missing factor shows "Not calculated yet" with the reason and blocks approval — it
  never produces a zero.
- **Calculations are append-only**: nothing can delete or alter one.

### Factors researched and entered (local database), with sources

| Activity | Value (kg CO2e per) | Source |
|---|---|---|
| Grid electricity | 0.710 / kWh | Central Electricity Authority, CO2 Baseline Database v21.0 |
| Diesel, petrol | 2.651 / L, 2.287 / L | IPCC 2006 Guidelines, default values |
| LPG, CNG, LNG | 2.985, 2.693, 2.693 / kg | IPCC 2006 |
| Coal: anthracite, bituminous, sub-bituminous, lignite | 2.625, 2.441, 1.816, 1.202 / kg | IPCC 2006 |
| R-22, R-32, R-134a, R-410A, SF6 | 1,760 · 677 · 1,300 · 1,923.5 · 23,500 / kg | GHG Protocol GWP values (IPCC AR5) |
| Process CO2 | 1 / kg | The statement already gives CO2 mass |
| Business travel: air, rail, bus | 0.121 · 0.007837 · 0.015161 / passenger-km | India GHG Program (WRI India, CII, TERI), 2015 |
| Road freight: light, medium, heavy truck | 0.3070 · 0.5928 · 0.7375 / vehicle-km | India GHG Program, 2015 |
| Steel | 2.54 / kg | Ministry of Steel (Rajya Sabha reply, Dec 2024) |
| Cement | 0.63 / kg | NITI Aayog roadmap, as quoted by CSE |

**Say honestly:** only the grid and steel values are from Indian-government publications. Fuel and coal values
are IPCC defaults; the transport values are India-specific but from a 2015 non-government study. **No factor
yet** for PNG (needs the supplier's gas density), purchased steam / heat (the supplier's own figure), the
spend-based activities, and waste — no credible Indian source was found.

---

## 9. OCR and document handling

- **Worker:** Python, PaddleOCR (PP-OCRv5 mobile models, CPU only), in a Docker container. It polls a job
  queue, so uploads never wait on a screen. About 10 seconds per A4 page on a laptop.
- **Rule-based extraction** (current rules version `rules-12`): which fields to look for comes from the
  database; how to find them is label matching. No value is invented.
- **Reads real Indian electricity bills:** tested on a real TPCODL bill — consumption from "UNITS ADVANCED",
  billing period from the meter-reading dates, the unit taken as kWh at low confidence so a person must confirm
  it, and the utility recognised from a list of distribution companies.
- **Document types** recognised by keywords: fuel invoices, electricity bills, renewable certificates, waste
  certificates, travel invoices, refrigerant records, material invoices, freight invoices, water bills, stack
  monitoring reports, HR / procurement / CSR statements, penalty orders.
- **A PDF with several bills:** upload one PDF (up to 20 pages); the worker proposes how it splits and what each
  bill is; the user confirms; each bill becomes its own record. A wrong PDF can be discarded.
- **Failure paths:** unreadable file → clear reason, re-upload a clearer copy, or type the values by hand with a
  written justification (flagged for review).
- **Several evidence files per record:** supporting files can be attached until approval.
- **Storage:** private bucket, no public links; every file is fingerprinted and re-checked when read — a file
  that no longer matches its fingerprint is refused.

**Say honestly:** apart from one real electricity bill, OCR has only been run on synthetic sample documents.

---

## 10. Consolidation and scale

- Rolls up through **any number of levels**; the level names themselves are configuration
  (Group → Company → Business Unit → Project is set up by adding levels, not by code).
- Database rules stop an inverted hierarchy, a second group, or a loop.
- **Percentages are never added or averaged** — they are recomputed from summed counts.
- Only approved records count; records awaiting approval are shown beside the total, never inside it.
- Works by reporting period or by **Indian financial year (April–March)**.
- **Scale check:** 300 projects and 86,400 records — a full-year group roll-up took **0.23 seconds**.

---

## 11. The report

A PDF generated on the server, stored privately, every run kept.

**What it contains**

- Greenhouse gas summary: Scope 1, 2, 3 in tonnes of CO2e, **current and previous financial year**.
- **SEBI's own tables** for Principle 6: Scope 1 and 2 with intensity per rupee of turnover, per PPP-adjusted
  turnover and per physical output; Scope 3; waste (categories A to H, recovered and disposed by route); air
  emissions; water.
- **Break-up by gas** (CO2, CH4, N2O, HFCs, SF6) and **Scope 1 by source** (stationary, mobile, process, fugitive).
- **Consolidation table:** each child org unit's totals.
- **Methodology section:** the boundary, every factor used with its source and version, the assurance statement.
- A note when the report covers only part of the year.
- **The whole SEBI BRSR format:** Section A (26 questions), Section B (12), Section C (108 across the nine
  principles) — 146 questions in SEBI's order and wording, structured like the L&T FY2025-26 reference report.
- **UN Sustainable Development Goals table:** all 17 goals against the questions tagged to each.

**How the 146 questions are answered**

| Kind | Count | Where the answer comes from |
|---|---|---|
| Measured | 10 | Approved, evidence-backed records |
| Written | 136 | Typed by an Admin on BRSR Disclosures, once per financial year; empty ones print "Not reported" |

**The signature feature — drill-down:** report value → BRSR question → activity → calculation → verified data →
original document, three clicks.

**Say honestly**

- Written answers are plain text; L&T prints structured tables for many of them (employees by category, policy
  matrix, safety statistics).
- Energy is calculated in GJ from fuels and electricity once calorific-value factors are approved; the SEBI tables (water by source, waste by category, workforce and the rest) are typed grids with Excel import; zero values are flagged.
- SEBI's format contains no SDGs; the SDG table is our addition and is labelled as an indicative mapping.
- PDF for every template; the GHG inventory also comes as an Excel workbook.

---

## 12. E, S and G coverage

| Pillar | From documents (measured) | Typed |
|---|---|---|
| **Environmental** | Scope 1, 2, 3; water; waste; air emissions | Energy in joules, water discharge, biodiversity, compliance statements |
| **Social** | Employees by gender, training coverage, MSME sourcing, CSR spend | Safety incidents, wages, human rights, complaints, community |
| **Governance** | Fines and penalties | Policies, board oversight, anti-corruption, conflicts of interest |

The industry limited the hackathon scope to emissions (E). S and G are in the report; a few items are measured.

---

## 13. Security and audit

- **Audit log is append-only** for every role, the server included: no update, delete or truncate.
- Each entry records who, what, before / after values, the network address, browser and sign-in session.
- A record's **complete history** on one screen: upload, OCR, every field edit, validation, calculation,
  approval, every report that included it.
- **All writes go through the server**; the browser has no write access to any table. Row-level security on
  every table.
- No self-approval — blocked in the application and in the database.
- Sign-in throttling (5 failed attempts per account), upload limits, cross-site request protection, security
  headers.
- Passwords: 12+ characters with upper, lower, number and symbol; deactivated users lose access immediately.
- A written security review with each finding fixed or recorded (`SECURITY_REVIEW.md`).
- Error reporting to Sentry is wired in, with personal data collection switched off.

---

## 14. Technology

| Layer | Choice |
|---|---|
| Web app | Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui |
| Server API | tRPC procedures (every one checks session, scope, role and state) |
| Database | PostgreSQL on Supabase — 40 migrations, row-level security, triggers for the rules that must never break |
| Auth and storage | Supabase Auth; private Supabase Storage buckets |
| OCR worker | Python 3.12, PaddleOCR, Docker |
| PDF report | Headless Chromium rendering self-contained HTML |
| Email | Brevo SMTP (password codes, bulk-import credentials) |
| Repository | pnpm monorepo: `apps/web`, `apps/ocr-worker`, `packages/shared-types`, `supabase/` |
| CI | GitHub Actions: lint, typecheck, unit tests, format, database tests, worker tests |

Architecture in one sentence: **the web app writes a job, the worker reads the document and writes the result
back, the database enforces the rules, and nothing reaches the report without passing every stage.**

---

## 15. Testing

| Kind | Result at last run |
|---|---|
| Web unit tests | 93 / 93 |
| Database tests (pgTAP) | 218 / 218 |
| OCR worker unit tests | 43 / 43 |
| End-to-end suite — Scenarios A–F, authorization, edge cases, real worker image | 231 checks, all passing (2026-10-08) |
| Real-browser pass (17 Admin + 5 user screens) | 48 / 48, no console errors (2026-10-08) |
| Accessibility (WCAG 2.1 AA, all three themes) | Passing (Phase 19) |
| Scale | 300 projects, 86,400 records: 0.23 s |

End-to-end scenarios: A diesel (Scope 1) · B electricity (Scope 2) · C HR headcount with a genuinely
low-confidence field · D the consolidated report down to each original document · E a multi-bill PDF ·
F new activities (a flight and a train of the same distance give different results).

**Say honestly:** the end-to-end suite and the browser pass were **not re-run** after the 2026-10-09 changes
(full BRSR format, disclosures screen, upload changes, PDF discard). Rehearse those before the demo.

---

## 16. How the project was built

- **20 planned phases completed** (setup → database → auth → organisation → upload → OCR → verification →
  validation → calculation → Scope 1 → Scope 2 → Scope 3 → role modules → BRSR mapping → consolidation → Control
  Tower → reporting → audit and security → UI polish → testing). Phase 21, deployment, is pending.
- **Two self-audits** against the problem statement: 52 / 100 (2026-10-06), then 72 / 100 after fixes
  (2026-10-08); the gaps found were then closed (these are our own estimates, not a jury's).
- **Written specification first:** product, technical, flow, UI and schema documents; every decision recorded
  in `.grill/`; every deviation from the specification numbered (32 schema, 28 app-flow).
- Requested during the build and added: bulk import, emailed-code password reset, password policy, theme
  toggle, multi-bill PDFs, hierarchy levels as configuration, several evidence files, SDG tags, the full BRSR
  format.

---

## 17. Not done, or not ready — do not present as finished

| Item | State |
|---|---|
| Hosted travel fields (migration `0078`) | Applied 2026-11-13; the deployed web app must be redeployed to match |
| Hosted OCR worker | Older rules until the `rules-18` image replaces it |
| Factors for PNG, steam / heat, spend-based activities, waste, NOx/SOx/PM | None with a source — those activities show "Not calculated" |
| Calorific values (energy in GJ) | Nine drafts on hosted; a second Super Admin must approve them |
| Typed SEBI table figures | Labelled SAMPLE DATA; replace with MEIL's before any filing |
| Industry's report list and company tables | Never received |
| Real MEIL documents | Not available until the final round; OCR tried on a few real bills only |
| Handwritten bus tickets | Waits for sample photos |
| Two-step sign-in, Tracey on Vercel, BU Manager screens | Built and unit/database tested; not yet confirmed end to end in a browser on the live site |
| Accessibility | Automated checks pass; no screen-reader or human pass |

---

## 18. Suggested slide order

1. **Title** — EmeilSG; problem statement; team.
2. **The problem** — auditors reject numbers without documents; 300 projects; data scattered.
3. **Our idea** — evidence first; AI assists, people decide; audit-ready (section 1).
4. **The flow** — the eight-step diagram (section 3).
5. **Scope 1, 2, 3 coverage** — the three tables (section 6).
6. **Upload and OCR** — screenshots: upload, verify split screen, multi-bill split (sections 5, 9).
7. **Validation and approval** — the checks table; no self-approval (section 7).
8. **Calculation and factors** — formula, versioning, factor table with sources (section 8).
9. **Hierarchy and roll-up** — Group → Company → Business Unit → Project; 0.23 s at 300 projects (section 10).
10. **The report** — SEBI tables; the full 146-question format; drill-down to the bill (section 11).
11. **Security and audit trail** (section 13).
12. **Architecture and technology** (section 14).
13. **Testing** — the numbers (section 15).
14. **Requirement checklist** — the table from section 2.
15. **Honest gaps and next steps** — section 17; ask for the report list and the company tables.
16. **Live demo.**

## 19. Live demo script (about 8 minutes)

1. Sign in as a Project Manager; upload a diesel bill.
2. Verify screen: flagged field; Confirm disabled until checked.
3. Upload the same bill again → duplicate warning.
4. Calculation trace: quantity × factor, with the source.
5. Sign in as the approver; approve (the uploader cannot).
6. Admin: Control Tower → Scope 1 → drill Group → Company → Business Unit → Project.
7. Generate the report; open Principle 6.
8. Click a figure → original bill. End here.

Extras if time allows: an electricity bill and a flight ticket (all three scopes), the multi-bill PDF, the audit
trail, BRSR Disclosures.

**Before the demo:** enter the factors and retire the old 0.02 grid factor; build the org tree; have a few
approved records in several projects; type a few Section A answers; keep Docker running; rehearse once on the
same machine; keep one record already processed as a fallback.

## 20. Questions to expect

| Question | Answer |
|---|---|
| Where do the factors come from? | CEA, IPCC 2006, GHG Protocol / AR5, India GHG Program, Ministry of Steel — shown on screen with each calculation |
| What if a factor changes next year? | Add a new version; old periods keep the old one; used versions are locked |
| What if OCR reads it wrong? | A person always confirms; low-confidence fields block Confirm; edits are audited |
| Can someone change a number later? | Not silently — calculations and the audit log are append-only |
| 300 projects? | Tested: 86,400 records roll up in 0.23 s |
| Where is the AI? | OCR reads documents; Tracey answers questions about the data (the model words it, the application supplies every figure); Carbon Intelligence and the Decision Center suggest actions. A person always confirms captured values and calculations are fixed formulas |
| Is the whole BRSR covered? | All 146 questions print; emissions are evidence-backed; the written disclosures are typed |
| Why no typed entry for emissions? | Auditors need the document; the document is the entry |
| What about S and G? | In the report; a few items measured (gender, training, MSME, CSR, fines), the rest typed |
