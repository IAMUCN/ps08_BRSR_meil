# Grill: the chatbot for Admins, and reports for a custom period
Date: 2026-10-11

## Intent
The owner asked three things in one message: the chatbot on the Admin side should have full access, "even
the email, name of employees"; it must stay strictly inside each person's scope and give nothing outside it;
and when someone asks to see the report of a custom period, the chatbot should take them to the Reports page
with that period selected — for which the Reports page first needs custom-period generation.

Nothing was asked back; the points below were decided by the feature session and are the owner's to overturn.

## Key decisions
- **Custom period = a range of reporting periods.** Records belong to reporting periods (whole months), so a
  custom period is "from period A to period B", stored as two dates (`report_runs.period_from`,
  `period_to`, migration `0043`, D35) and covering every reporting period lying wholly between them. The form
  has two period pick-lists rather than two date boxes, so a range that holds no period cannot be chosen.
  Alternative considered: free dates — rejected, a date inside a month would silently report nothing or the
  whole month.
- **A custom-period report is built like a single-period one:** no previous-year column and no turnover /
  intensity inputs (those are per financial year); the written disclosures printed are those of the financial
  year the range starts in. Its name is "1 Jul 2026 to 30 Sep 2026".
- **"Full access" for an Admin = two more lookups, not a wider database role.** `list_people` (name, email,
  employee id, roles, org units, active or deactivated) and `list_records` (each record's value, status, who
  submitted it, who approved it, the document's file name). Not included: document and OCR text, the audit
  log, written BRSR disclosures — say so if they are wanted.
- **`chat_reader` is unchanged.** It still cannot read users. The Admin lookups are fixed queries on the
  app's own connection, in read-only transactions, handed to the tools only when the session is an Admin's.
  Reason: widening the role would let every non-Admin question reach the users table at the database level
  with only code in the way; this keeps the database refusing it for them. Alternative considered: grant
  `chat_reader` SELECT on users — rejected for that reason, and it would need the role's migration changed.
- **Not an Admin: the tools do not exist.** They are not offered to the model and a request for one is
  answered exactly like a tool that was never written. The system prompt for a non-Admin still says there is
  no information about people. A saved answer made with an Admin lookup is withheld from its owner if they
  are no longer an Admin, and is not sent to the model as context.
- **Scope for everyone else is as before:** org units are resolved only among those the person may see, on
  every lookup; nothing here changes it.
- **The chatbot opens the page; the person generates.** `open_report_page` (Admin only, because the Reports
  page is) returns a link the server built — `/admin/reports?org=…` with `fy=`, `period=` or `from=&to=` —
  and the panel goes there at once; the form starts on that selection. The chatbot stays read-only: nothing is
  generated until the person presses the button. A financial year opens as a financial year (keeps the
  previous-year column), one reporting period as one period, anything else as a custom range.
- **A link block can only be the Reports page.** The response schema refuses any other address.

## Surfaced assumptions
- "The user" who wants a report is an Admin: the Reports page is Admin-only. A non-Admin is told an Admin
  generates reports.
- Employee names and emails asked about by an Admin are sent to the AI service (NVIDIA's trial endpoints
  today) as part of the lookup result, like every other lookup result. The earlier statement "it never
  receives user names or emails" is no longer true for Admin questions.

## Open questions
- Should a non-Admin (a Project Manager, say) see the people or the submitters inside their own scope? Today:
  no, nobody but an Admin.
- Should the Admin's access also cover the audit trail, document text and written disclosures?
- NVIDIA's terms on submitted prompts, now that personal data can be in them.

## Out of scope
- The chatbot generating a report by itself.
- Any change to `chat_reader` or to what a non-Admin can ask.
