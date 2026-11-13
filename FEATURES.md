# EmeilSG — Feature inventory (final submission, 2026-11-13)

One list of everything built, under the product's final names. **EmeilSG** is the web application; **Tracey** is
its ESG data analyst chatbot. Other documents (README, PPT_CONTEXT, PROGRESS) summarise this file; if they
disagree, this file and `CONTEXT.md` are the later word. Each line says where to find the detail.

> The Docker image `traceesg-ocr-worker` and the `@traceesg.test` fixture accounts keep the old name on purpose
> (renaming them would break running containers and test data). Nothing a person sees says TraceESG.

---

## 1. Capture: from a bill to a verified record

| Feature                               | What it does                                                                                                                                                                                               | Detail                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Upload by rows (Manual)               | A table: bill type, billing period, typed value(s), unit, required evidence. OCR reads every bill and the two readings are compared; a mismatch is settled on Verify                                       | `.grill/row-upload-decisions.md`, D59, A60    |
| Automatic mode                        | Drop the bills; EmeilSG reads, splits and files them (one upload for every bill, PDFs up to 50 pages)                                                                                                      | `.grill/merged-upload-decisions.md`, D57, A58 |
| Several files / several bills         | Several files on one activity, or several bills in one file (page from / to), merged cells, drafts, an eye button to preview before sending                                                                | A60                                           |
| Billing period and late bills         | Each bill asks for its billing period; a past due month is accepted and marked **late**; future months are never offered                                                                                   | A60                                           |
| OCR worker                            | PaddleOCR reads PDFs and photos; deterministic rules extract the fields (`rules-18`); a missing field is left empty, never guessed; electricity (DISCOM), water, fuel, travel tickets (passengers counted) | `apps/ocr-worker`, `.grill/ocr-*`             |
| Verify extraction                     | Document beside the fields, boxes on the document, confidence guard rail, typed-vs-read comparison, Reporting period picker, category-mismatch warning and activity change, supporting files               | A56, A55                                      |
| Several open periods and late uploads | Each period has a due date and a "late until" date; late and duplicate flags (same file, same bill) go to review                                                                                           | D46, A42                                      |
| Expected-submission progress          | The Upload page ticks off what a project still owes                                                                                                                                                        | D53, A51                                      |
| Typed travel                          | Distance × passengers for travel and staff buses                                                                                                                                                           | migration `0078`                              |

## 2. Check and calculate

| Feature                          | Detail                                                                                                                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validation engine                | Six categories, configurable rules; zero values are flagged; typed total must match the bills; anomaly against the project's history                                                                                               |
| Calculation engine               | Deterministic, append-only calculations with the factor version stored; direct multiply, percentage and subtract formulas                                                                                                          |
| Conversion factors               | Versioned **per financial year**, each with source link, publisher and read date; a new version is a draft until a second Super Admin approves; fetch from official sites; yearly review; calorific-value factors for energy in GJ | D50, D54, A46, A52 |
| Approval                         | A second person approves or returns; nobody approves their own record                                                                                                                                                              |
| BRSR gaps against the L&T report | Energy in GJ, water by source and treatment level, waste by category and operation, MSME and within-India lines, PPP source and assurer, year-on-year notes, **17 typed SEBI tables with Excel import**                            | D60, A61           |
| Written disclosures              | All 146 questions of Sections A, B, C; typed answers per financial year; disclosure owners                                                                                                                                         | D32, A28           |

## 3. Monitor and analyse

| Feature                                        | Detail                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Control Tower (Dashboard)                      | Completion pipeline, Scope 1/2/3 completion, BRSR Readiness %, issue panel, KPI trends by financial year                                    |
| Role-wise dashboards                           | One per role; employee register; overdue escalation (1 / 3 / 7 days)                                                                        | migrations `0080`–`0084`              |
| Scope 1 / 2 / 3                                | Totals, by activity and org unit, trend, drill-down to the bill; **Table or Chart (donut + bars)**                                          |
| Submission Monitoring, Data Explorer           | Every record, filters, search, CSV export, OCR column, stage tracker                                                                        |
| Carbon Intelligence                            | Year-wise emissions by scope and activity, suggested actions, emission threshold alerts (daily check), Forecast and Simulator tabs          |
| Decision Center & RAG                          | Decision rules, decarbonization suggestions, risk evaluations, recommendations, grounded assistant, predictive forecasts, what-if scenarios | `docs/INTELLIGENCE_IMPLEMENTATION.md` |
| Carbon credits                                 | Registry ledger, retirements, reconciliation, procurement quotation, links to outside markets                                               |
| Reporting Deadlines                            | Status board, daily reminders (in app and by email), schedule and sent log                                                                  | D49, A45                              |
| **Financial year + Period pickers everywhere** | Choose the financial year, then a period that has begun; nothing in the future is offered; the default is the current period                | A62                                   |
| Top-bar search                                 | Records, people, org units, reports, pages — only what the person may open (Ctrl+K)                                                         |

## 4. Report

| Feature                   | Detail                                                                                                                                                                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BRSR report (SEBI format) | PDF with every question, previous-year column, tables, SDG tags; every figure drills down to the original document                                                                                                                                                                 |
| Templates                 | BRSR, BRSR Core, GHG inventory (with an Excel workbook), executive summary                                                                                                                                                                                                         |
| Covering                  | One period, a financial year, **a quarter (1st–4th of the financial year)**, or a custom range                                                                                                                                                                                     |
| One unit, one report      | A project's, business unit's or subsidiary's report holds only the data recorded under that unit and the units beneath it; company-wide written answers, typed SEBI tables and turnover-based intensities appear in the group's report only (A64). Every table fits the page width |
| Report forwarding         | A ready report is forwarded for verification up the hierarchy, with a trail                                                                                                                                                                                                        |
| Audit Evidence Bundle     | Cryptographic evidence package (manifest, checksums, lineage, missing-evidence list)                                                                                                                                                                                               |
| Assurance                 | `ASSURANCE.md`: how BRSR Core KPIs are supported for an assurer; the Assurance Reviewer role is read-only                                                                                                                                                                          |

## 5. People, access and security

| Feature                  | Detail                                                                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Roles                    | Super Admin (at most two), Administrator (one org unit and beneath), **BU Manager** (one business unit and its projects), Corporate ESG, Project Manager, EHS, HR, Procurement, Finance/CSR, Employee (uploads on behalf of a role), Assurance Reviewer; custom roles possible |
| Roles & Permissions      | Permission matrix with names, **suggested permissions per role**, **search**, selected-first order, Edit role                                                                                                                                                                  |
| Organization             | Group → Subsidiary → Business Unit → Project, levels are configuration; a unit under several parents; several groups; bulk import and **Export hierarchy**; expected submissions                                                                                               |
| Sign-in                  | Password, **Continue with Google** (registered accounts only), **two-step sign-in with an authenticator app (Google Authenticator) for every sign-in**, "Try another way" by emailed code, Super Admin reset for a lost phone                                                  |
| Invitations and sessions | Invitation links (no password emailed), 3-hour idle and 72-hour limits, one sign-in per account with takeover                                                                                                                                                                  |
| Audit                    | Append-only audit log with address and device, scoped Audit Trail, My Activity, CSV export                                                                                                                                                                                     |
| Security work            | Seven audits (security, database, chatbot, privacy, UI, accessibility, dependencies) with fixes; row-level security; org-scope checks; rate limits; CSRF origin check                                                                                                          |

## 6. Tracey, the ESG data analyst

A read-only chatbot behind the **Ask Tracey** button. A language model words the answer; the application supplies
every figure from approved tools that run inside the person's org scope. Works with NVIDIA NIM, any OpenAI-style
endpoint, or a local Ollama model (set `OLLAMA_BASE_URL`, e.g. through ngrok); providers fail over. Saved
conversations (90 days), an audit entry per question, Admin-only people and record lookups, fixed refusals outside
scope. See `CHATBOT.md`.

## 7. Platform

Phones and tablets (bottom bar, installable app), Help page, three themes, WCAG AA contrast, the landing page with
**Request a demo**, hourly hosted-to-local database copy, local database server runbook, release checklist
(`RELEASE.md`), deployment guide (`DEPLOYMENT.md`), production database runbook (`docs/PRODUCTION_DATABASE.md`).

---

## 8. Not done, or waiting on a person

| Item                                                       | State                                                                                                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Industry's extra report list and base company tables       | Never received                                                                                                                               |
| Hosted migrations | Complete through `0088` (`0078` applied and `0068`–`0076` recorded on 2026-11-13). Vercel must be redeployed so the code matches |
| Hosted OCR worker                                          | Older rules until the `rules-18` image replaces it                                                                                           |
| Supabase MFA (TOTP) on the hosted project                  | Must be switched on in the dashboard, or nobody can sign in with 2FA required                                                                |
| `CRON_SECRET` on Vercel                                    | The project has `CRON_KEY` and `NVDIA_NIM_BASE_URL` (misspelled); the code reads `CRON_SECRET` and `NVIDIA_NIM_BASE_URL` / `OLLAMA_BASE_URL` |
| Factors with no sourced value                              | PNG, steam / heat, spend-based travel, commuting, freight; NOx, SOx, PM; waste                                                               |
| Sample SEBI table figures                                  | The 29 typed table-years on hosted are labelled SAMPLE DATA; replace before any real filing                                                  |
| Calorific-value drafts                                     | Nine drafts entered on hosted; a second Super Admin must approve them                                                                        |
| Not tried in a real browser or by a person                 | Quarter and Tracey on Vercel, 2FA end to end, BU Manager screens, a screen reader                                                            |
