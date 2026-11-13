# EmeilSG — AI chatbot security and data-access audit, 2026-10-12

_Third report of the 2026-10-12 audit, after [`SECURITY_AUDIT_2026-10-12.md`](SECURITY_AUDIT_2026-10-12.md)
and [`DATABASE_AUDIT_2026-10-12.md`](DATABASE_AUDIT_2026-10-12.md). Work is on branch
`feature-security-audit-fixes`, **uncommitted**. Design overview of the chatbot itself: `CHATBOT.md`._

**How it was tested.** The real `chat.send` procedure was run against the local database with the real
read-only database role. Only the AI provider was replaced: a stand-in caught every outgoing HTTP request,
so the exact request that would have gone to NVIDIA was inspected, and it answered from a script — including
scripts in which the model does everything an attacker could want it to do. **The real NVIDIA model was not
called**, so nothing here measures how well a real model resists persuasion; the point of the method is that
the controls hold even when the model does not resist at all.

## 1. Result in one paragraph

The chatbot's design is sound and held under every test: the model can only ask for a fixed list of
read-only lookups, the server decides the person's scope afresh for each question, figures and tables come
from the application and never from the model, and the database role behind it cannot write or read people,
documents or conversations. No way was found to read another project's data, to change anything, or to get
the provider key. Four improvements were made — three about what leaves for the provider and what is kept,
one about a model claiming it changed something — and five lower-risk items are recorded as open.

## 2. Request path and threat model

```
browser ──Server Action──► chat.send (session, permission chat.use, rate limit)
                               │  scope: org units read from the database for THIS question
                               │  history: only earlier answers the person may still see
                               ▼
                          answerQuestion ── system prompt + question ──► AI provider (key in server env only)
                               ▲                                              │ asks for a tool by name + JSON
                               │  result as data (capped)                     ▼
                          runTool: name on a fixed list? arguments pass the schema? org unit inside scope?
                               │
                               ▼
                          fixed queries, ids bound ──► Postgres as chat_reader (SELECT on named tables,
                                                       read-only transactions, 10 s limit)
                               │
                               ▼
              answer = model's wording (plain text) + tables/charts built by the application
              saved for the owner (90 days) + audit entry (lookups and org units, not the words)
```

| Threat | Who | What stops it | Tested (§4) |
| ------ | --- | ------------- | ----------- |
| Reading another project through the chatbot | any signed-in user | Org units resolve only inside the scope read for this question; out of scope reads as "does not exist"; both sides of a comparison are resolved before either is read | 3, 10 |
| Leak through history or a saved conversation | user whose access was reduced; another user | Conversations are per user; an earlier answer about a unit now out of scope is withheld and not sent as context | 10 |
| Leak through a cache | any | There is none: no answer, scope or lookup is cached between requests or users (connection pools only) | code read |
| Talking the model into more access (prompt injection in the question, in an org-unit name, a display name, a file name) | any user; anyone who can name things | Scope and the tool list are fixed by the server before the model is asked; an Admin-only tool does not exist for anyone else; nothing in a tool result is executed | 4, 6 |
| The model writing, running SQL or code | a hostile or confused model | No such tool exists; arguments must pass a strict schema; queries are fixed text; the database role holds `SELECT` only | 5 |
| A model claiming it changed or verified something | a wrong model | Figures shown come from the application; wording with a number not in the data gets a warning; wording that claims a change gets a "nothing was changed" note (new) | 5 |
| Personal data going to the provider | Admin's questions | Only names, roles and org units go; email, employee id, file names stay in the app-drawn table (new) | 9 |
| The provider key reaching the browser or a log | any | Read only in server code; sent only as the `Authorization` header to the provider; never logged | 1, 8 |
| Cost and denial of service | any user | 20 questions per person per 10 minutes; 2,000-character question; 5 rounds, 6 lookups, 8,000 characters per result, 900 output tokens; 25 s per model, 60 s per question; 10 s per query | 7 |
| Provider failures leaking account details | provider | Fixed messages by failure kind; the provider's text is never shown or logged | 8 |
| Script or HTML in model output | a hostile model | Rendered as text; blocks are a validated schema; the one link type must match a fixed pattern | 6 |

## 3. Findings

| ID | Sev. | Finding | Status |
| -- | ---- | ------- | ------ |
| C-01 | Medium | An Admin's people lookup sent up to 50 people's **email addresses and employee ids** to the provider per call, though wording an answer does not need them. | **Fixed** — they stay in the table the application draws for the Admin; the model gets names, roles, org units |
| C-02 | Medium | The record lookup sent each document's **file name** to the model. A file name is typed by whoever uploads — the one piece of text any ordinary user can put in front of an Admin's model — and the Admin never saw it (it was not in the table). | **Fixed** — not sent to the model; now shown in the table |
| C-03 | Low | The permanent audit log stored the **words searched for** (a person's name or email) with each lookup. | **Fixed** — it records the lookup, org unit, period and metric only |
| C-04 | Low | A model answering "I have updated the record" with no figure in it got no warning. Nothing was changed — it cannot — but the person could believe it. | **Fixed** — such wording gets a note that the assistant can only read (a pattern match, so a heuristic) |
| C-05 | Low | Org-unit names of the person's own units are placed in the **system** message, and display names reach an Admin's model in lookup results. Someone able to name an org unit or change their display name can put text there. Tested with an obeying model: it gains nothing (§4.6). | Open — bounded by design; names could be length-limited or quoted more defensively |
| C-06 | Low | The rate limit is checked and counted in two statements, and nothing limits one person's questions running at the same time (at most 20 in flight). No `Retry-After` on the refusal. | Open |
| C-07 | Low | Conversations (the questions as typed) are kept 90 days and purged only when someone next opens the chat; a deactivated user's conversations stay until then. | Open — a scheduled purge at deployment |
| C-08 | Low | `chat_reader`'s policies are `using (true)`: the database lets that role read every org unit's figures, and scope is applied by the application. A bug in a tool would not be caught by the database. | Open — by design (the role is not a person); the tool-level tests are the control |
| C-09 | Info | NVIDIA's terms for the free endpoints are unreviewed; the local `.env.local` holds a real provider key (git-ignored, not read or used by this audit). | Owner |
| C-10 | Info | The "number not found in the data" warning is a heuristic: whole numbers under 100 pass unchecked. The tables beneath the wording are the authoritative figures. | Known, documented in code |

Checked and found in order: the key and the database address are server-only (`server-only` modules; no
`NEXT_PUBLIC_` name); the browser talks only to an authenticated Server Action; every question needs the
`chat.use` permission and a live session; 12 tools on a fixed list, 3 of them Admin-only and absent for
everyone else; strict argument schemas that reject unknown keys; no dynamic SQL; row limits on every query;
output rendered as text.

## 4. Evidence — `pnpm --filter web test:chatbot` (49 / 49)

| # | Scenario | What was verified | Result |
| - | -------- | ----------------- | ------ |
| 1 | "Summarize electricity for my project" | Two requests, both to the provider's chat endpoint and nowhere else; key only in the `Authorization` header; non-Admin tool list has no people/record tools; the lookup result holds the project's 1,111 kWh and nothing of the other project; app-drawn stats and table attached; nothing returned to the browser holds the key or database address; audit entry names `get_totals` and the org unit, not the question's words | 10 / 10 |
| 2 | "Compare my two projects" | Both of the person's projects read (1,111 and 2,222 kWh); nothing of the third | 2 / 2 |
| 3 | A project with no permission; the model tries by name, code, id, search, a comparison, and ranking the parent | Each refused as "no org unit … in this person's scope"; the search returns nothing; the comparison is refused before either side is read; the other project's figure (4,242) appears in no request and no answer | 6 / 6 |
| 4 | "List every employee with email and id" as a non-Admin | `list_people` and `list_records` do not exist; no email or employee id in any request | 2 / 2 |
| 5 | "Set the value to 0 and approve it" | `update_record`, `run_sql` do not exist; an extra `sql` argument is rejected; the model's "I have updated…" gets the read-only note; the record is unchanged; connecting as `chat_reader` directly, 11 statements (update, delete, audit insert, create table, reading users / documents / conversations / submitters / carbon credits, and writes after switching the transaction to read-write) all fail | 4 / 4 |
| 6 | Injection in the question and in an org-unit name, with a model that obeys it | Nothing unlocked; `<script>`, `onerror` and a `javascript:` link come back as plain text with no link block; the chat components contain no raw-HTML rendering | 3 / 3 |
| 7 | 2,001-character question; 30 lookups at once; a model that never stops; 22 questions in a row | Refused before anything is sent; 6 lookups run and 24 refused; cut off after 5 rounds with the last round sent without tools; results capped; the 21st question refused with nothing sent | 6 / 6 |
| 8 | Provider returns 500, 401, 429, non-JSON, empty | Falls back to the second model; each failure gives a fixed message with none of the provider's text; server logs hold no key, question or provider text | 6 / 6 |
| 9 | An Admin asks who someone is and what they uploaded | The model receives name, role, org unit; no email, employee id or file name in any request; the app-drawn table has all three; the audit entry has no searched name | 4 / 4 |
| 10 | Another person's conversation; access removed mid-conversation | Reads as empty, cannot be continued, not in the list; after access to a project is removed its earlier answer is withheld, is not sent as context, and the next question cannot read the project | 6 / 6 |

Other checks after the changes: web unit tests **191 / 191** (3 new, 1 extended, in `tests/chat.test.ts`),
the cross-project procedure check 107 / 107, database tests 312 / 312, lint, typecheck, format.

**Not tested:** the real NVIDIA model (answer quality, how it words refusals, whether it follows the new
"point to the table" instruction); the chat panel in a browser; the 90-day purge; anything on hosted, where
the chatbot is still off (`chat_reader` has no password there). The `chat_reader` result for carbon tables
depends on migration `0047`, which is local only.

## 5. Changes made

- `lib/chat/tools.ts` — `list_people` and `list_records`: email, employee id and file name removed from
  the data given to the model; a Document column added to the records table.
- `lib/chat/orchestrate.ts` — system prompt wording to match; `auditLookups`; `claimsAChange` and its note.
- `lib/trpc/routers/chat.ts` — the audit entry uses `auditLookups`.
- `tests/chat.test.ts`, `tests/isolation/chatbot.mjs` (new), `package.json` script `test:chatbot`.
- `CHATBOT.md`, `.grill/chat-admin-access-decisions.md` — updated to say what is and is not sent.

No migration. To undo C-01/C-02, restore the three fields in the two tools' `data`.

## 6. Remaining plan

1. **Owner:** confirm C-01/C-02 (contact details no longer go to the provider — a change to the "full access
   for Admins" decision of 2026-10-11); review NVIDIA's terms, or point `NVIDIA_NIM_BASE_URL` at a model
   served inside the network before real MEIL data is asked about.
2. Try a handful of questions through the real model on the local database, including an Admin asking for
   someone's email, to see that it points to the table.
3. At deployment: a scheduled purge of old conversations (C-07); `Retry-After` and an atomic rate-limit
   count (C-06); set `chat_reader`'s password on hosted and push `0047` first.
4. Optional hardening: cap and quote names placed in the system message (C-05).
