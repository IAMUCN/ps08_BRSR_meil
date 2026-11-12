# ESG data analyst (chatbot)

The chatbot is called **Tracey** (owner's request, 2026-11-11): "Ask Tracey" in the top bar, her own mark
(`components/brand/tracey-mark.tsx`), and she answers to the name.

A read-only assistant inside TraceESG. A signed-in person asks a question in plain language ("compare this
month's electricity with last month") and gets a short worded answer with the figures, a table and a chart.

Decisions and their reasons: [`.grill/chat-analyst-decisions.md`](.grill/chat-analyst-decisions.md).
Deviations: D34 in `supabase/SCHEMA_DEVIATIONS.md`, A32 in `apps/web/APP_FLOW_DEVIATIONS.md`.

## Who can use it

Anyone whose role holds the permission **`chat.use`** ("Ask the ESG data analyst"), on Admin pages and on
everyone else's pages alike. Every role that existed when migration `0042` ran holds it; an Admin unticks it
for a role, or ticks it for a new role, on Admin → Roles & Permissions (the Admin role always holds every
permission). Without it the buttons are not shown and the server refuses every chat procedure. What a person
can ask about is still their org scope: every org unit for an Admin, their assignments and everything
beneath for anyone else. **An Admin also gets three lookups nobody else has** — people, individual records
with who submitted and approved them, and opening the Reports page (see "Admin only" below).

## The one rule

**The language model never produces a number and never decides who may see what.** It reads the question,
asks for one or more approved lookups, and words the result. The application runs the lookups, checks the
person's scope on each one, computes every figure with the same consolidation code as the screens and the
reports, and builds the tables and charts itself.

## How a question is answered

```
Browser panel ── Server Action ── tRPC chat.send
                                     │ 1. session → identity (never from the browser)
                                     │ 2. rate limit (20 questions per person per 10 minutes)
                                     │ 3. org units the person may see, read from the database now
                                     │ 4. earlier messages of this conversation, from the database
                                     ▼
                           lib/chat/orchestrate.ts  ◄────►  NVIDIA NIM (wording, choice of lookups)
                                     │  asks for a tool by name with JSON arguments
                                     ▼
                           lib/chat/tools.ts        name on the list? arguments pass the schema?
                                     │              org unit inside the person's scope?
                                     ▼
                           lib/chat/data.ts         fixed queries, as database role chat_reader,
                                     │              read-only transaction, 10-second limit
                                     ▼
                           answer = model's wording (plain text) + blocks built by the server
                                     │ saved with an audit entry (who, when, which lookups — not the words)
                                     ▼
                           Browser panel renders text, tables and SVG
```

| File | What it holds |
|---|---|
| `apps/web/lib/chat/tools.ts` | The approved tools: schemas, scope resolution, figures, blocks. Pure. |
| `apps/web/lib/chat/analysis.ts` | Period phrases → reporting periods; percentage change. Pure. |
| `apps/web/lib/chat/orchestrate.ts` | The loop between model and tools, its limits, the system prompt. Pure. |
| `apps/web/lib/chat/nim.ts` | The provider: request, model fallback, safe errors. The only place that sees the key. |
| `apps/web/lib/chat/data.ts` | Every SQL statement the tools run, as `chat_reader`. Server-only. |
| `apps/web/lib/chat/blocks.ts` | The response schema: stats, table, chart, note, source. |
| `apps/web/lib/trpc/routers/chat.ts` | `chat.send`, `chat.conversations`, `chat.conversation`, `chat.delete`. |
| `apps/web/components/chat/` | The launcher (top bar + floating button), the panel, the block renderer. |
| `supabase/migrations/0042_chat_analyst.sql` | The `chat_reader` role and the two conversation tables. |

## Setting it up

Four server-side environment variables (`apps/web/.env.example`). With any of the first three missing the
chatbot is **off**: no buttons are shown and `chat.send` answers "not set up".

| Variable | Value |
|---|---|
| `NVIDIA_NIM_API_KEY` | The key from NVIDIA Build. Server only. Never `NEXT_PUBLIC_`. |
| `NVIDIA_NIM_MODEL` | One model, or a comma-separated list in order of preference. |
| `CHAT_DATABASE_URL` | A connection string for the role `chat_reader` (not the main database user). |
| `NVIDIA_NIM_BASE_URL` | Optional. Default `https://integrate.api.nvidia.com/v1`. |

**Models.** Every request names one model; the key does not switch models by itself. When a model answers
"rate limited", "not found for this account", a server error, nothing usable, or not at all within 25
seconds, the next model on the list is tried. A refused key (401/403) stops at once. Use models that support
tool calling. On the owner's account on 2026-10-11 these passed a tool-calling probe:
`nvidia/nemotron-3-super-120b-a12b`, `z-ai/glm-5.3`, `z-ai/glm-5.3-flash`, `nvidia/nemotron-3-ultra-550b-a55b`,
`nvidia/nemotron-3.5-lightning-30b-a3b`, `openai/gpt-oss-20b`. The catalogue lists models the account cannot
call, so test before adding one. Suggested value:

```
NVIDIA_NIM_MODEL=nvidia/nemotron-3-super-120b-a12b,z-ai/glm-5.3,openai/gpt-oss-20b
```

**A model of your own.** Any server that speaks the OpenAI chat-completions protocol with tool calling works:
set `NVIDIA_NIM_BASE_URL` to it and `NVIDIA_NIM_MODEL` to its model name. Nothing needs training on MEIL's
data — the data never comes from the model. With a local model, no question leaves the network.

**The database role.** Migration `0042` creates `chat_reader` without a password. Where the chatbot is used:

```sql
alter role chat_reader login password '<a long random password>';
```

Then `CHAT_DATABASE_URL=postgresql://chat_reader:<password>@<host>:<port>/postgres`. On Supabase's pooler the
user name is `chat_reader.<project-ref>`; **this has not been tried on the hosted project yet** (migration `0042` is there since 2026-10-11; the role
has no password until the owner sets one). Locally,
`supabase/seed.sql` sets the password `chat_reader_local` on `pnpm db:reset`
(`postgresql://chat_reader:chat_reader_local@127.0.0.1:55322/postgres`); on a database that was not reset
since `0042`, run the `alter role` once by hand.

**Deployment.** Push migration `0042` first, set the role's password, then set the four variables on the web
host. A question can take up to 60 seconds; the host's function time limit must allow that.

## What leaves the system

Each question sends to the AI service: the question, up to 10 earlier messages of the same conversation, and
the results of the lookups — org unit names, period labels, metric names, summed figures, calculation factors
and their sources. **For an Admin's question it can also receive people's names, roles and org units, and who
submitted and approved a record** (the Admin-only lookups). Email addresses, employee ids and document file
names are shown to the Admin in the table the application draws and are **not** sent to the AI service
(since 2026-10-12, `CHATBOT_AUDIT_2026-10-12.md`). For everyone else it receives nothing about people. It never receives document text, OCR output, invoice numbers, audit entries or
written BRSR disclosures, whoever asks. NVIDIA's hosted
endpoints are a trial service with rate limits; read their terms on submitted prompts before relying on it.

## The approved tools

The model can ask for these and nothing else. Arguments are validated with a strict schema: an unknown
argument, a wrong type or a tool not on the list is refused and the refusal is handed back to the model.

| Tool | Arguments | Gives |
|---|---|---|
| `list_org_units` | `search?`, `type?` | The org units in the person's scope (up to 50). |
| `list_metrics` | `scope?` | Metric codes, names, units, scopes. |
| `get_totals` | `org_unit?`, `period`, `metric?`, `scope?` | Quantity, calculated result, awaiting approval, Scope 1/2/3 emissions. |
| `compare` | `a {org_unit?, period}`, `b {…}`, `metric?`, `scope?`, `measure?` | Two periods or two org units: difference and percentage change. |
| `get_trend` | `org_unit?`, `period`, `metric?`, `scope?`, `measure?` | One figure per reporting period (up to 36). |
| `rank_org_units` | `parent?`, `type?`, `period`, `metric?`, `scope?`, `measure?`, `limit?` | Org units beneath one, highest first (up to 20 of 500). |
| `get_completeness` | `org_unit?`, `period` | Expected and missing submissions; records by status (up to 24 periods). |
| `explain_calculation` | `org_unit?`, `period`, `metric` | Input, factor with version and source, formula, result (up to 5 records). |

**Admin only** (`.grill/chat-admin-access-decisions.md`). Offered to the model, and run, only when the
session is an Admin's; for anyone else a request for one is answered like a tool that does not exist.

| Tool | Arguments | Gives |
|---|---|---|
| `list_people` | `search?`, `role?`, `org_unit?` | To the model: name, roles, org units, active or not (up to 50). The table shown to the Admin adds email and employee id. |
| `list_records` | `org_unit?`, `period`, `metric?` | To the model: each record's value, status, submitted by, approved by (up to 50). The table shown to the Admin adds the file name. |
| `open_report_page` | `org_unit?`, `period` | A link to Reports with the org unit and period selected; the panel goes there. |

These run as fixed queries on the app's own connection in read-only transactions (`adminData` in
`lib/chat/data.ts`), not as `chat_reader`, which still cannot read users. `open_report_page` generates
nothing: a financial year opens as a financial year, one reporting period as one period, anything else as a
custom range, and the person presses Generate.

- `org_unit` is a name or code. It is looked up **only among the org units the person may see**, so one
  outside their scope reads exactly like one that does not exist. Left out, it means the person's own unit;
  with several, the tool asks which.
- `period` is exactly one of: `preset` (`this_month`, `previous_month`, `current_financial_year`,
  `previous_financial_year`, `year_to_date`, `till_date`), `financial_year` (starting year), `from` + `to`
  (ISO dates), or `label` (a reporting period's name).
- `measure` is `quantity` (kWh, litres — the default) or `emissions` (tCO2e).

Limits per question: 6 lookups, 5 turns with the model, 60 seconds, 8,000 characters of any one result shown
to the model, 900 output tokens, 2,000 characters of question.

## Numbers

- **Source:** the `consolidation_records` view and the `consolidate()` rules (`lib/consolidation/aggregate.ts`).
  A check on 2026-10-11 compared `get_totals` with the application's `consolidateNodes` for three org units
  and periods: every metric agreed.
- **Record statuses:** approved is the headline; everything else that is verified and not rejected is shown
  beside it as awaiting approval; rejected records are left out; unverified records are in no figure.
- **Not calculated** (usually a missing conversion factor): counted and reported, never treated as zero.
- **Percentages** are re-derived from summed counts across org units and periods, never averaged.
- **Units:** a quantity entered in MWh is converted to the metric's kWh; a unit that cannot be converted is
  shown apart. Emissions are totalled in tCO2e from kgCO2e or tCO2e only.
- **Missing data is not zero:** a period with no records is "no data" and a gap in a chart.
- **Percentage change:** none when either side has no data or the baseline is zero; the answer says why.
- **Periods:** whole reporting periods; financial years April to March; dates in India time. "Year to date" is
  the financial year so far. "Till date" is every period so far, and the answer states the dates and in how
  many periods records were found. Two dates snap to whole periods and the answer says which.
- **The wording** is the model's. The server regroups its figures (16,38,880) and adds a warning when a figure
  in the wording matches nothing in the data. The check is a heuristic; the tables are the figures to rely on.

## What it will not do

Write anything, approve or reject, upload, generate the official BRSR report (for an Admin it opens the
Reports page with the period selected; the person generates), run SQL or code, or answer about document
text and written disclosures. It answers about people for an Admin only.

## Read-only and authorization, layer by layer

1. **Identity** from the server session, and the `chat.use` permission (`permissionProcedure`); the browser sends only the question, a
   conversation id and the page's org unit and period ids, which are used only if inside the person's scope.
2. **Scope** read from the database on every question (`allowedUnits`): all org units for an Admin, otherwise
   the person's assignments and everything beneath — the rule of `consolidation.query`. Nothing is cached.
3. **Tools** resolve org units only inside that set, before any data is read.
4. **Queries** are fixed text in `lib/chat/data.ts`; only checked ids are bound as parameters.
5. **Database role** `chat_reader`: `SELECT` on a named list of tables and columns, read-only transactions by
   default and per transaction, 10-second statement limit. It cannot read users, assignments, documents, OCR
   tables, the audit log, settings, reports, disclosures or the conversation tables, nor the columns that name
   who submitted, verified or created something.
6. **Output:** the model's text is printed as text; tables and charts come from a validated schema.
7. **Saved conversations** are private to their owner; Admins cannot read them. An answer about an org unit
   the reader can no longer see, or one made with an Admin-only lookup by someone who is no longer an Admin,
   is withheld, and is not sent to the model as context either.
8. **Admin-only lookups** exist only when the server handed the tools an Admin's data access (`ctx.admin`),
   which it does from the session, never from the browser or the model.

This differs from "read through RLS" in the brief: the application's server has always read through its own
connection and checked scope in code (deviation D1), and the consolidation views are closed to the browser
role on purpose. D34 records the choice.

## Conversations

Saved in `chat_conversations` and `chat_messages`. Kept 90 days from the last message (removed when someone
next opens the list; there is no scheduler yet); deletable by their owner at any time. At most 50 per person
and 100 messages each. A saved answer shows the figures as they stood, with its date; a follow-up always looks
the data up again. Each question writes one audit entry, `chat.question_answered`, with the lookups made, the
org units covered and the model — not the question or the answer.

## Errors the person can see

| Situation | Message |
|---|---|
| Not set up | "The assistant is not set up on this server. Ask an Admin." |
| Key refused | "The AI service refused the request. Ask an Admin to check the assistant's key." |
| Every model rate limited | "The AI service is busy right now. Try again in a minute." |
| Too slow | "The assistant took too long. Try again, or ask a narrower question." |
| No usable reply | "The assistant could not produce an answer. Try rephrasing the question." |
| Too many questions | "That is a lot of questions in a short time. Try again in a few minutes." |

The provider's own error text is never shown or logged; the server log holds the model name and a status only.
A failed question is not saved; the panel offers "Try again".

## API

`chat.send` — input `{ conversationId?: uuid, message: string (1–2000), page?: { orgUnitId?, periodId?, path? } }`
(`path` only selects a page name from a fixed list on the server);
returns `{ conversation: { id, title, lastMessageAt }, messages: [question, answer] }`. A message is
`{ id, role, content, blocks, createdAt, hidden }`; `blocks` follow `lib/chat/blocks.ts`.
`chat.conversations` → the person's conversations. `chat.conversation({ id })` → its messages.
`chat.delete({ id })`. All require a signed-in, active user whose role holds `chat.use`. The browser reaches them through the Server
Actions in `lib/chat/actions.ts`.

## Testing

| Command | Covers |
|---|---|
| `pnpm --filter web test` | `tests/chat.test.ts`, 26 tests, no database and no model: figures against fixtures, units, periods and financial years, zero and missing baselines, scope refusals, unknown tools and bad arguments, an injected model, tool and turn limits, stale context, model fallback, safe errors, the key and settings absent from browser code. |
| `pnpm db:test` | `chat_analyst.test.sql`, 24 tests: the `chat.use` permission and what `chat_reader` holds, and acting as it — reads figures, cannot read users, the audit log, OCR text or conversations, cannot update, delete or insert. |

Not automated: an end-to-end scenario in `apps/web/tests/e2e` (it would need a stand-in model server), and
the removal of expired conversations. The check with a real model and a real browser on 2026-10-11 was run by
hand from scripts that are not in the repository.

## Trying it by hand

1. `pnpm db:start`; on a database not reset since `0042`: `npx supabase migration up`, then the `alter role`.
2. In `apps/web/.env.local` set the four variables (local `CHAT_DATABASE_URL` above). Restart `pnpm dev`.
3. Sign in. Click **Ask** in the top bar or the round button at the bottom right. On a desktop the pane
   docks at the right and the page narrows; keep using the page, move to another page — it stays open.
4. Ask "What was the electricity consumption of Project X in September 2026?" — a worded answer, two figure
   tiles, a table, and a "Covers:" line. Compare the figure with Admin → Scope 2 for the same unit and period.
5. Ask "Now compare it with the previous month." — it should still mean Project X.
6. As a Project Manager, ask about a project that is not yours — it should say it is not available.
7. Ask it to approve a record or to produce the BRSR report — it should decline.
8. **Saved** lists the conversation; reopen it after a reload; delete it.
9. Admin → Audit Trail shows `chat.question_answered` entries without the question text.

## Known limits

- NVIDIA's hosted endpoints: trial service, rate limits, no uptime commitment, third-party data terms.
- Answer quality depends on the model. The figures do not, but the wording can be clumsy or add an inference
  of its own (seen once: naming months that have no reporting period).
- The figure check on the wording is a heuristic; whole numbers under 100 are not checked.
- Reporting periods are monthly: there is no day-level data, so "today" has no figure of its own.
- No downloadable export of an answer; no typed questions about people, documents or written disclosures.
- Expired conversations are removed when the chat is next opened, not on a schedule.
- `chat_reader` through Supabase's pooler on the hosted project is untested.
