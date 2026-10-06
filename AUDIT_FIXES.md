# Audit fixes — work queue

From the final implementation audit of 2026-10-06 (score **52 / 100**, hackathon readiness **NOT READY**; becomes
*conditionally ready* once the four P0 items are done). This file is the to-do list for later sessions. Tick items
off here and note the commit; fold the outcome into `PROGRESS.md` when a group finishes.

Audit facts used below were **verified on 2026-10-06** against the local stack (worker unit 40, web unit 78, DB 164,
e2e 189 all passing) and read-only against hosted. Paths are as named in the audit — confirm each exists before
editing. Role per `CLAUDE.md`: everything here is **feature** work unless it says otherwise.

## Needs the owner before starting

- **Factor values (P0-1).** The owner must supply, or approve, the Indian-source values and their citations. I could
  not verify per-fuel numbers, so do not invent them (Master Approach §12: never guess).
- **Hosting (P0-4).** Same open question as `CONTEXT.md` §2.
- **Source 2** (the BPUT PS8 statement) is not in the repo, so anything depending on its wording is unverifiable.

## P0 — must fix

- [ ] **P0-1 Emission factors are wrong or missing.** _(2026-10-07: values approved by the
  owner and checked against the CEA and IPCC documents — table in `.grill/audit-p0-decisions.md`. **Still to do:
  an Admin enters them on hosted** at `/admin/conversion-factors` and retires the 0.02 factor. Waste and travel
  factors still have no source.)_ The only hosted factor is **0.02 kgCO2e/kWh, "IPCC26", no
  geography** — about 35× too low and not Indian. CEA's CO2 Baseline Database v21.0 (Nov 2025) gives FY2024-25
  weighted-average grid **0.710 tCO2/MWh = 0.710 kg/kWh**
  (https://cea.nic.in/wp-content/uploads/baseline/2025/12/User_Guide_V_21.0.pdf). No fuel factors exist anywhere
  outside local synthetic data (India's BTR1 via UNFCCC uses IPCC 2006 national/default values; per-fuel numbers not
  extracted).
  Do: replace/supersede the hosted grid factor; enter fuel factors (diesel, petrol, CNG, LPG, …) each with source
  text, year, geography and effective dates, via `/admin/conversion-factors` (new versions, never edit a used one).
  Done when: a hosted grid-electricity record calculates ≈ kWh × 0.710, every factor row cites its source.
- [x] **P0-2 Report is not the SEBI table.** _(Done 2026-10-07: SEBI tables, previous year, tCO2e,
  intensity, assurance note, methodology and factor sources; inputs per financial year on Admin → Reports, D26/A24.
  Not done: waste by category and recovered quantities, break-up by gas.)_ Rebuild report output (`lib/reports/html.ts`, `snapshot.ts`) to the
  current BRSR Q7 (GHG), Q9 (waste) and Leadership Q2 (Scope 3) tables: current **and previous FY** columns, **tCO2e**
  (not "1,500 kgCO2e (1.5 tCO2e)"), Scope 1 and Scope 2 as a table, intensity per ₹ of turnover, PPP-adjusted
  intensity, physical-output intensity, an assurance note, and a methodology / GWP / factor-source / boundary
  statement. Needs new inputs: turnover, PPP, assurance (an `org_settings` value or a per-report field — ask).
  Reference: L&T's FY2025-26 report in `ps_documents/provided_docs` uses the new numbering and layout. SEBI format:
  https://www.sebi.gov.in/sebi_data/commondocs/jul-2023/Annexure_II-Updated-BRSR_p.PDF
- [x] **P0-3 BRSR indicator codes follow the superseded May-2021 format.** _(Done 2026-10-07:
  migration `0033`, D25. Pushed to hosted 2026-10-07.)_ Re-seed from the July-2023 format
  (new migration — next number is the highest on `main` + 1; migration `0022` holds the old seed, do not edit it).
  Principle 6: GHG = **Q7**, waste = **Q9**, Scope 3 = Leadership **Q2**; employees = **Q20**, CSR = **Q24**. App
  currently uses `P6-E6`, `P6-L4`, `P6-E8`, `A-18`, `A-22`, `P1-E2`, `P3-E8`, `P6-E3`, `P8-E4`. Keep the
  `reports_value` mapping behaviour of D18 (P6-E8 reports waste quantity, P6-L4 the emissions). BRSR Core (9
  attributes, Annexure I) is only partly covered — note, don't build, unless asked.
  Do this **before or with** P0-2 so the report uses the new codes. Record a deviation entry (next free D number).
- [ ] **P0-4 Not deployed.** _(Owner, 2026-10-07: hosting comes after the app is fully done.)_ Phase 21 (`06_IMPLEMENTATION_PLAN.md`): blocked on the hosting decision. Afterwards
  re-run the audit on the live URL.

## P1 — should fix

- [ ] **Scope 1 gaps:** refrigerants / SF6 (fugitive), process emissions, coal, PNG, LNG (PRD §20 lists LNG and
  coal), stationary vs mobile split. Seed as configuration like migration `0017`. Fuel factors currently apply per
  litre/kg with no NCV or gas-split method.
- [ ] **Scope 3 gaps:** 2 of 12 categories live (waste, business travel). Add employee commuting, logistics,
  purchased goods; KT says all three scopes, PRD §22 says a subset — KT takes precedence. Pattern: migration `0019`.
- [ ] **Travel mode does not change the factor** (a flight and a train give the same result). Per-mode factors or
  passenger-km in the engine + seed.
- [ ] **Hierarchy not enforced in the database.** Direct inserts were accepted for a project under a project, a
  subsidiary under a project, and a cycle (only the FK and "root must be a group" exist). Add a trigger mirroring
  `canBeChildOf` in `lib/org/rules.ts` plus a cycle check; add a pgTAP test.

## P2 — nice to have

- [ ] **Calculations deletable at DB level.** Add the same append-only/delete guard the audit log has (migration
  `0027`). Also **investigate the 5 locally approved grid bills (20–21 Sept 2026) whose `calculation.completed`
  audit entries exist but whose calculation rows are gone** — cause not established, no app path deletes them.
- [ ] **Security headers** (frame protection, CSP, HSTS, nosniff) in `apps/web/next.config.ts` — `next.config.ts` is a
  *shared file*: keep the change small and say so in the PR.
- [ ] **Audit lacks IP, session, user-agent**; `validation.completed` is logged after `approval.submitted` — log in
  true order.
- [ ] **Levels are a fixed DB enum + TS constant**; PRD §11 says adding a level should be configuration.
- [ ] **One evidence file per record in the UI** (`esg_record_documents` already supports many); the hash is not
  re-checked when a file is read back.
- [ ] **Factor `geography` is stored but never used** when picking a factor — use it (CEA regional option) or drop it.

## P3

- [ ] `AUTH_SECRET` is documented but unused — remove or implement. Web app has no Sentry (the worker does).

## Not code — still open from earlier (see `PROGRESS.md` §5)

Hosted Auth settings (sign-up off, 12+ chars with composition) are unverified; rotate the database password
(shared in chat); no load test at 300 projects × 5–10 users.

## Checks for any fix here

`pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm db:test` for schema changes, the e2e suite
(local only) for report/calculation changes; worker unit tests + Ruff only if `apps/ocr-worker` changed. The audit's
probe scripts were in the previous session's scratch folder and are not in the repo; the session transcript is
`C:\Users\nihar\.claude\projects\D--Non-Newtonian-Things-BRSR-MEIL\b2516d37-4e81-410e-802b-a3c1831a5cde.jsonl`
(final audit report is its second-to-last long assistant message).
