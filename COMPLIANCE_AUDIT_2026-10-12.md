# TraceESG — Privacy and legal compliance audit, 2026-10-12

_Fourth report of the 2026-10-12 audit (after the security, database and chatbot reports). Branch
`feature-security-audit-fixes`, uncommitted._

**What this is and is not.** A review by an engineer of what the application actually does, set against the
kinds of obligation that usually apply. It is **not legal advice** and it does not make the product
compliant. Statements about which law applies are an engineer's reading and need a qualified lawyer; every
such point is marked _legal review_. No company details, policies or certifications were invented — where a
fact is not in the repository, it says so.

Status words used below: **Compliant** (verified evidence) · **Partial** · **Missing** · **N/A** (with the
reason) · **Legal / external** (needs legal review or configuration outside the code).

## 1. Context established from the repository

| Question | Finding | Source |
| -------- | ------- | ------ |
| Operator | Not stated anywhere in the app. The footer reads "TraceESG by MEIL"; the project was built for MEIL (Megha Engineering & Infrastructures Ltd, India) as problem statement PS-08. Whether MEIL operates it, and under what entity, is **not verifiable from the code**. | landing footer, `PROGRESS.md` |
| Intended users | MEIL staff: Admins, Corporate ESG, Project Managers, HR, EHS, Finance/CSR, Procurement. Accounts are created by an Admin or by bulk import; there is no public sign-up. | `supabase/config.toml` (`enable_signup = false`), seeded roles |
| Countries served | India, as far as the content shows (SEBI BRSR, Indian DISCOM bills, rupees, Indian financial year). | specification, seed data |
| Business model | An internal enterprise tool. **No payments, pricing, subscriptions or advertising** exist in the code or its dependencies. | dependency list, route list |
| Where data is held | Supabase (Postgres, Auth, Storage). The project notes say the hosted project is in Mumbai; this was not checked in the Supabase dashboard. | `CONTEXT.md` |
| Outside services | Supabase; Brevo (email, SMTP); NVIDIA NIM (chatbot); Sentry (errors — off unless configured). No analytics, advertising, maps or social SDK. | §3 |

**Which law (engineer's reading — _legal review_).** With an Indian operator, Indian employees and data in
India, the Digital Personal Data Protection Act, 2023 and its Rules are the main reference, alongside the
Information Technology Act and its rules; check which provisions are in force on the go-live date. Nothing in
the product targets people in the EU, UK or California, so GDPR or CCPA would matter only if such people use
it (for example staff of an overseas MEIL entity). India's accessibility law and standards may apply to the
operator; the report uses WCAG 2.1 AA as the yardstick because the project's own UI brief does.

## 2. The 20 areas

| # | Area | Status | Evidence and gap |
| - | ---- | ------ | ---------------- |
| 1 | Privacy policy | **Missing** | No privacy notice exists in the app or the repository. A draft built only from verified behaviour is in `docs/PRIVACY_NOTICE_DRAFT.md`; operator identity, contact, legal basis and retention periods are left as questions. _Legal review._ |
| 2 | Terms of service | **Missing** | No terms or acceptable-use statement. For an internal tool this is usually an internal policy rather than public terms; an outline is in the same draft file. _Legal review._ |
| 3 | Refund policy | **N/A** | No payment is taken anywhere (no payment code, provider or price). |
| 4 | Cookie policy | **Partial** | No document, but the inventory is short and verified (§3.2) and is written into the draft notice. |
| 5 | Cookie consent | **N/A today** | Only strictly necessary storage exists: the sign-in session and a 15-minute set-password marker (both HttpOnly), plus two browser-storage preferences (theme, chat pane open). No analytics, advertising or tracking code is present (searched the source and the dependency list). A banner would be needed the day a non-essential tracker is added. |
| 6 | Form consents | **Partial** | Forms: sign-in, reset password, profile, document upload, bulk import. None links to a notice. Bulk import lets HR enter other people's name, email and employee id; the person's first notice is an email saying an account was created. No consent is recorded anywhere — the likely basis is employment, not consent. _Legal review_ of basis and notice. |
| 7 | Data minimisation | **Partial** | Good: rate-limit buckets are hashed; the chatbot audit entry holds no question text; Sentry's personal-data collection is switched off; since today the AI provider no longer receives emails, employee ids or file names. Gaps: the permanent audit log stores IP address, browser string and session id for every action; the full OCR text of every upload is kept indefinitely; a deleted user's email and name are written into the permanent audit log; a bulk-import password travels by email. |
| 8 | Third-party SDKs | **Partial** | Inventory in §3.3. No contract or data-processing terms are recorded for Brevo or NVIDIA; NVIDIA's terms for the free endpoints are unreviewed. _External._ |
| 9 | Dark patterns | **Compliant** | No consent flow, subscription, cancellation, countdown or pre-ticked choice exists. Destructive actions ask for confirmation; the duplicate-upload warning must be acknowledged but never blocks. |
| 10 | Hidden fees | **N/A** | Nothing is sold. |
| 11 | Fake reviews | **Compliant** | The landing page has no testimonials, ratings, customer logos or named endorsements (all section text read). |
| 12 | Unsupported claims | **Partial** | See §4. One fixed today (deadlines labelled "statutory"). |
| 13 | Image alternatives | **Compliant** (static check) | Three `<img>` elements, all with `alt`: the document viewer uses the file name; the decorative banner uses empty alt. Landing photographs are CSS backgrounds beside text labels. Icons are `aria-hidden`. Not checked with a screen reader. |
| 14 | Colour contrast | **Partial** | Computed from the colour values, not measured in a browser. Below 4.5:1: Corporate theme's secondary button text (3.62); landing step numbers in pale grey on white (2.56); white on emerald in the illustrative screen (2.54). The red call-to-action passes (4.59), main text passes in all three themes. The last full axe run (Phase 19) predates the landing page and the redesign. |
| 15 | Keyboard navigation | **Not verified** | By reading: dialogs and menus are Radix components (focus trap, Escape), buttons have a visible focus style, the FAQ uses native disclosure elements. No "skip to content" link. The native mouse cursor is hidden site-wide in favour of a custom one, and that component is mounted twice. Needs a keyboard and screen-reader pass in a browser. |
| 16 | Business details | **Missing** | No operator name, address, contact or grievance contact anywhere. "Request a demo" opens an email with **no recipient**. _Legal review_ of what must be published. |
| 17 | Children's data | **N/A** | A workplace tool with Admin-created accounts for employees; nothing is directed at children and there is no sign-up. |
| 18 | Email unsubscribe | **N/A** | Four kinds of email are sent, all operational: account created, password reset code, missing-submission reminder, deadline reminder / escalation. No marketing email exists. If newsletters are ever added, an unsubscribe is needed. |
| 19 | Licensed assets | **Partial** | Fonts (Inter, JetBrains Mono, Lora) come through `next/font`, which serves them from the app itself. Icons: lucide (ISC). Dependencies are permissive licences apart from those noted in §5. **The six landing photographs have no recorded source or licence.** The repository's licence file is GPL-2.0 while the footer says "All rights reserved". |
| 20 | Data deletion | **Partial** | §6. An Admin can delete an account only if it left no data; otherwise it is deactivated. A person can delete their own chat conversations. There is no documented way to ask for access, correction or erasure, and no process reaching Brevo or the AI provider. |

## 3. Personal-data map

### 3.1 What is collected, why, and how long it stays

| Data | Where | Purpose | Kept |
| ---- | ----- | ------- | ---- |
| Display name, work email, employee id (optional), active flag, theme | `users`; email and password hash in Supabase Auth | Sign-in, showing who did what | Until deleted; cannot be deleted once any record or audit entry refers to the person |
| Roles and org-unit assignments, who assigned them | `user_org_assignments` | Authorisation | Revoked rows are kept |
| Every action: who, what changed, **IP address, browser, session id** | `audit_logs` | Assurance and security | Permanent; the table refuses update and delete for every role |
| Who uploaded, verified, approved each record | record and approval tables | Evidence chain | With the record |
| Uploaded documents and **the full text OCR read from them** | Storage; `ocr_extractions.raw_output` | Evidence; re-reading with new rules | No limit set. Documents can name people: consumer names on bills, people in HR or safety statements |
| Questions typed to the chatbot | `chat_conversations`, `chat_messages` | The person's own history | 90 days, purged when someone next opens the chat; self-deletable |
| Notifications | `notifications` | In-app messages | No limit set |
| Password-reset codes (hashed), sign-in attempt counters (hashed) | `password_reset_otps`, `rate_limit_events` | Security | Codes 10 minutes of validity, rows not purged; counters 15–60 minutes |
| Report snapshots and PDFs | `report_runs`, Storage | The filed report | No limit set |

No special-category data is asked for. Workforce figures are counts, but a source document can contain more
than the count.

### 3.2 In the browser

| Item | Kind | Purpose | Life |
| ---- | ---- | ------- | ---- |
| `sb-…-auth-token` (may be split in parts) | Cookie, HttpOnly, SameSite=Lax | Sign-in session | Session / refresh lifetime set in Supabase |
| `traceesg-password-setup` | Cookie, HttpOnly | Allows setting a password right after an emailed link | 15 minutes |
| Theme choice | localStorage | Avoids a flash of the wrong theme | Until cleared |
| Chat pane open or closed | localStorage | Keeps the pane as it was | Until cleared |

### 3.3 Who else receives data

| Recipient | What | When | Open point |
| --------- | ---- | ---- | ---------- |
| Supabase | Everything | Always | Region and backup access to confirm in the dashboard |
| Brevo (SMTP) | Recipient name and email; the message, which for bulk import includes an initial password and for a reset a one-time code | Each email | No processing terms recorded; password in email |
| NVIDIA NIM | The question, up to 10 earlier messages, lookup results: org-unit names, figures, factor sources; for an Admin also people's names, roles, org units | Each chatbot question, if the chatbot is configured | Terms unreviewed; where it is processed is unknown. `NVIDIA_NIM_BASE_URL` can point to a model inside the network instead |
| Sentry | Error messages from the server | Only if `SENTRY_DSN` is set | Off today |

A development-only feedback widget (`agentation`) loads only when `NODE_ENV` is `development` and talks to
`localhost`.

## 4. Claims checked against the product

| Claim | Where | Finding |
| ----- | ----- | ------- |
| "Statutory Due Date", "statutory BRSR reporting deadlines" | Deadline emails and the Deadlines page | The date is the closing date an Admin sets for a reporting period (or the period's end), not a legal deadline. **Fixed:** now "Due date". |
| "Portfolio-Wide Deployment for MEIL" | Landing, capability card | The product is not deployed (deployment is the remaining phase). Unsupported as worded — owner to reword. |
| "TraceESG by MEIL. All rights reserved." | Landing footer | Authorship or endorsement by MEIL is not evidenced in the repository, and the licence file says GPL-2.0. Owner to confirm both. |
| "Can OCR errors reach a report? No." | Landing FAQ | Too absolute: a person can confirm a wrongly read value, and a manual exception lets values be typed. The mechanism described next to it (provisional until confirmed, flagged fields must be reviewed) is accurate. |
| "Immutable Timestamped Records" | Landing, audit-trail card | Accurate for the audit log and stored calculations, which the database makes append-only; records themselves are editable until approved. Wording is broader than the control. |
| Internal carbon price of ₹2,500 attributed to a "MEIL Corporate Sustainability Committee guideline" | Seed row in migration `0046` | No such guideline is in the repository; it reads as an invented source and is what the app falls back to. Owner to replace with a real, sourced value or remove. |
| "No public sign-up. Deactivated users lose access immediately." | Landing, security section | Supported: sign-up is disabled in the Auth configuration; deactivation is covered by database tests. |
| "Each change writes an audit entry in the same transaction" | same | Supported by the code read in this audit, with one gap found and fixed (the carbon CapEx evaluation). |
| "Every request is checked on the server against role, organization scope and state" | same | True after this audit's fixes; before them five routers lacked the scope check (security report F-01…F-11). |
| Sample figures and screens | Landing | Labelled "sample" or "Illustrative screen" — fine. |

`ASSURANCE.md` and the generated report's own wording were not reviewed for claims.

## 5. Licences

- Dependencies (production): MIT, Apache-2.0, ISC, BSD and similar; nothing copyleft that conflicts with the
  repository's own GPL-2.0. `sentry` is FSL-1.1; `agentation` (development only) is PolyForm Shield — both
  restrict some commercial uses and are worth a glance by whoever owns licensing.
- Six photographs in `apps/web/public/landing/` were added on 2026-10-09 with no note of where they came
  from. Four unused design screenshots (about 6.8 MB) sit in the same public folder and are downloadable by
  anyone; they show an earlier landing design, no personal data.

## 6. Requests from people about their data

| Need | Today | Gap |
| ---- | ----- | --- |
| See what is held | An Admin can see a person's account and everything they did in the audit trail; the person sees their profile, submissions and conversations | No export; no stated way to ask |
| Correct | The person edits their display name; an Admin manages the rest | Email cannot be changed in the app |
| Erase an account | `users.delete` removes the account and its assignments **only if nothing refers to it**; then the Auth account is removed | For anyone who ever submitted, approved or was audited, deletion is refused and the account is deactivated instead. The deletion entry itself stores the email and name permanently |
| Erase documents | A wrong multi-bill PDF can be discarded; a failed upload replaced | No removal of an evidence file or its OCR text once recorded; abandoned uploads stay in Storage |
| Processors | — | Nothing asks Brevo or the AI provider to delete anything; backups keep deleted data until they expire |
| Consent | — | None is collected or recorded; none of the processing appears to rest on consent (_legal review_) |

Keeping the evidence chain and the audit trail is a legitimate reason to refuse some erasure, but the reason,
the retention period and who decides must be written down. That is a policy decision, not a code change.

## 7. Changed in this pass

- "Statutory" wording removed from the deadline email, the in-app notice and the Deadlines page
  (`lib/deadlines/service.ts`, `app/admin/deadlines/{page.tsx,deadlines-client.tsx}`). Unit tests 191/191,
  typecheck, lint and format pass; the page was not viewed in a browser.
- Earlier today, relevant here: HttpOnly session cookies; email, employee id and file names no longer sent to
  the AI provider; search words kept out of the audit log.
- New: `docs/PRIVACY_NOTICE_DRAFT.md` — **a draft for a lawyer to complete, not a policy.**

Nothing else was changed, because the right outcome depends on facts or decisions that are not in the code.

## 8. What the owner and a lawyer need to decide

1. **Who the operator is**, its address and a contact for privacy questions — then the notice can be finished
   and linked from the sign-in page and the footer, and "Request a demo" given a recipient.
2. **Legal basis and notice for employees** whose accounts are created by an Admin or HR.
3. **Retention periods**: audit log (including IP addresses), uploaded documents and OCR text, notifications,
   report files, deactivated accounts.
4. **How a person asks** for access, correction or erasure, who answers, and what is refused and why.
5. **Processor terms** with Supabase, Brevo and the AI provider, and whether data may leave India for the
   chatbot — or serve the model inside the network.
6. **Landing wording** in §4, the licence statement, and the source of the six photographs.
7. **The ₹2,500 carbon price** and its stated source.
8. A browser pass for contrast, keyboard and screen reader before go-live.
