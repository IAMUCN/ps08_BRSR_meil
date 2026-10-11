# Grill: read-only ESG data analyst chatbot

Date: 2026-10-11

## Intent

Let MEIL staff ask questions about the ESG data they are allowed to see, in plain language, and get answers
whose numbers come from the application's own consolidation and calculation code. This is for real MEIL use,
not only for the demonstration. The language model chooses which approved read-only tool to call and words the
answer; it never produces a figure and never decides who may see what.

## Constraints

- Strictly read-only towards ESG business data, enforced by the database, not by the prompt.
- Same organizational scope as the screens: a user asks only about org units inside their assignments.
- No new framework or charting library; the app's own components, tokens and inline SVG.
- The API key stays on the server. No secret in the repository, the client bundle, logs or responses.
- Numbers are deterministic: approved is the headline, awaiting approval beside it, rejected excluded,
  uncalculated counted and never read as zero, financial years April to March.
- The specification in `ps_documents/` is not edited; differences are recorded as deviations.

## Key decisions

- Decision: inference goes to NVIDIA's shared cloud (`integrate.api.nvidia.com`) for now, with the key the
  owner created as `ps08_chatbot`. Reason: it is free and available today. Alternative considered: wait for a
  locally served model. The provider is a plain OpenAI-style endpoint behind `NVIDIA_NIM_BASE_URL`, so a local
  model is a configuration change. No training on MEIL data is needed in either case.
- Decision: a dedicated read-only database role for the chat tools, with its own connection string
  (`CHAT_DATABASE_URL`). Reason: the owner chose the strongest separation because this is for real use.
  Alternatives considered: the app's main connection inside read-only transactions (no migration, weaker
  separation); reading through RLS as the brief words it (rejected: the consolidation views are closed to the
  browser role on purpose, and it would create a second authorization model). The scope check itself stays in
  server code on the main connection, as every screen does it (deviation D1); this differs from the brief's
  "never bypass RLS" wording and is recorded as a deviation.
- Decision: the read-only role may read a named list only: org tree, reporting periods, metrics with scopes
  and categories, records as numbers, calculations with inputs and factor versions, validation results,
  expected submissions. Reason: it bounds what can ever reach the model. Not readable: users, emails, role
  assignments, audit log, notifications, settings, documents, OCR text and extracted fields, reports, BRSR
  written disclosures. Consequence accepted: the chatbot cannot say who submitted a record or what a bill says;
  it points to the record on the existing screens.
- Decision: "a report" in chat is a rich answer in the panel: summary, headline figures, a table, a chart and
  a line stating the org unit, period and record statuses covered. Reason: creating the official BRSR PDF is a
  write and Admin-only. Asked for that, the chatbot refuses and links to Admin → Reports. A downloadable export
  of a chat answer was left out.
- Decision: charts are inline SVG drawn by the app (bars for comparisons, a line for trends), built by the
  server from tool results. Reason: the app has no charting library and already draws its own. The model only
  chooses whether a chart is shown.
- Decision: the entry points are a button in the top bar of both shells and a floating button at the bottom
  right; both open the existing side panel. Reason: the user keeps the page they were on, and its org unit and
  period can be the starting context once the server has re-checked them. Alternative considered: a separate
  assistant page.
- Decision: the feature session builds the UI as well, in new files under `components/chat/`, touching the
  existing top bar by one line, and records it in `UI_NOTES.md`. Reason: the owner asked for it; otherwise
  nobody could try the chatbot until the ui role had built the panel.
- Decision: conversations are saved. Rules: private to the person (Admins cannot read them); one audit entry
  per question with who, when, tools, org unit and period but not the text; a saved answer is frozen and shows
  when it was produced; a follow-up always recalculates; an answer about an org unit the user can no longer see
  is hidden; kept 90 days from the last message, deletable by the user at any time; 50 conversations per user,
  100 messages per conversation. Alternatives considered: nothing kept; an audit trail without content.
- Decision: `NVIDIA_NIM_MODEL` is one model or a comma-separated list tried in order when a model is rate
  limited, out of quota or unavailable; any other error stops. Reason: the owner expected the key to switch
  models by itself; as far as known the API needs a model named in every request, so the app does the
  switching. Only models that pass a tool-calling probe go on the list. Each saved answer records the model.
- Decision: using the chatbot is a permission, `chat.use`, granted per role on Roles & Permissions; every
  role that exists today holds it. Reason: the owner asked for it on every person's pages, Admin included,
  and then for its availability to be a permission. Alternative considered: on for every signed-in person.
- Decision: 20 questions per user per 10 minutes through the existing rate-limit table, and the last 10
  messages sent as context. Reason: same mechanism as sign-in and uploads.

## Surfaced assumptions

- That a local model would have to be trained on MEIL data. It does not: the data never comes from the model.
- That one NVIDIA key moves to another model when a quota runs out. Probed on 2026-10-11: every request names a
  model, four listed models answered "not found for account", six passed a tool-calling probe (`CHATBOT.md`).
- That "never bypass RLS" describes this application. Its server already reads through a privileged connection
  and enforces scope in code.
- Reporting periods are whole months, so "today" and "between two dates" resolve to whole reporting periods,
  and the answer states the periods actually used.
- Role categories restrict what a role uploads, not what it reads inside its org scope; chat follows that.

## Open questions

- NVIDIA's terms for prompts sent to the free endpoints, and their rate limits, before MEIL relies on this.
- When the read-only role's password is set on hosted and migration `0042` is pushed (owner's go-ahead).

## Out of scope

- Generating, changing or deleting the official BRSR report, or any other write, through chat.
- Exporting a chat answer as a file.
- Admins reading other people's conversations.
- Questions about people, document text, invoice numbers or written BRSR disclosures.
- A scheduled purge job; expired conversations are removed when the chat is next opened.
