# TraceESG — Privacy notice (DRAFT)

> **Draft for legal review. Not published, not a policy, and not legal advice.** Written by an engineer from
> what the application was verified to do on 2026-10-12 (`COMPLIANCE_AUDIT_2026-10-12.md`). Everything in
> `[square brackets]` is a fact or decision nobody has supplied yet — do not publish with any of them unfilled.
> If the application changes, this must change with it.

## Who we are

TraceESG is operated by `[legal name of the operating entity]`, `[registered address]`.
For any question about your personal data, contact `[name or role, email, postal address]`.
`[If a grievance officer or data protection officer is required: name and contact.]`

## Who this notice is for

People who are given a TraceESG account by their organisation: `[e.g. employees and contractors of …]`.
Accounts are created by an administrator; there is no public registration. The service is not intended for
children.

## What we hold about you

- **Your account:** your name, work email address, employee id if your organisation entered one, your roles
  and the parts of the organisation you are assigned to, whether your account is active, and your display
  theme. Your password is stored only as a hash by our authentication provider.
- **What you do in the application:** documents you upload, values you confirm or correct, approvals and
  returns you make, reports you generate. Each action is written to an audit log with the time, your
  network address (IP), your browser type and your sign-in session.
- **Documents you upload** and the text read from them. These are business documents, but they can contain
  personal details of other people (for example a name on a bill or in a safety statement).
- **Questions you type to the assistant**, if it is enabled for you.
- **Notifications** addressed to you.

We do not use advertising or analytics trackers.

## Why we use it

| Purpose | Data |
| ------- | ---- |
| Letting you sign in and see only what your role allows | Account, roles, assignments |
| Keeping a traceable record behind every reported ESG figure | Uploads, confirmations, approvals, audit log |
| Protecting accounts (limiting sign-in attempts, password reset) | Email, network address (counted in hashed form) |
| Sending you operational emails: account created, password reset code, reminders of missing submissions and deadlines | Name, email |
| Answering your questions in the assistant | Your question, earlier messages of the same conversation |

`[Legal basis for each purpose — to be stated by counsel.]`

## Who receives it

- **`[Supabase, legal entity]`** — hosts the database, sign-in and file storage, in `[region — to be confirmed]`.
- **`[Brevo, legal entity]`** — delivers our emails. An email can contain your name and, when your account is
  first created, a temporary password.
- **`[AI provider — NVIDIA or an internally hosted model]`** — only when the assistant is used. It receives
  the question, earlier messages of that conversation and the figures looked up to answer it. For questions
  asked by an administrator it can also receive people's names, roles and organisation units. It does not
  receive email addresses, employee ids, document contents or file names. `[Where it is processed and under
  which terms — to be confirmed.]`
- **`[Sentry]`** — error reports from the server, `[only if enabled]`.

`[Statement on transfers outside India, if any.]`

## How long we keep it

| Data | Period |
| ---- | ------ |
| Assistant conversations | 90 days after the last message; you can delete a conversation yourself at any time |
| Password reset codes | Valid for 10 minutes |
| Sign-in attempt counters | 15 to 60 minutes |
| Account | `[to be decided]`. An account that has submitted or approved anything is deactivated rather than deleted, so that the record behind reported figures stays intact |
| Audit log | `[to be decided — today it is kept permanently and cannot be altered]` |
| Uploaded documents, the text read from them, reports | `[to be decided]` |
| Backups | `[provider's retention — to be confirmed]` |

## Cookies and browser storage

Only what the application needs to work; nothing is used for tracking, so no consent banner is shown.

| Name | Purpose | Duration |
| ---- | ------- | -------- |
| `sb-…-auth-token` | Keeps you signed in | `[session lifetime configured in the provider]` |
| `traceesg-password-setup` | Lets you set a password straight after following an emailed link | 15 minutes |
| Theme and assistant-pane preferences (browser storage) | Remember your display choices on this device | Until you clear them |

## Your choices and requests

You can change your display name and password on your Profile page and delete your assistant conversations.
To see, correct or delete other data about you, contact `[contact above]`. `[Which rights apply, the time
limit for a reply, the cases in which a request is refused — for example records that must be kept as
evidence — and how to complain to the regulator: to be completed by counsel.]`

## Security

Access is checked on the server for every request and limited to your part of the organisation; documents
are held in private storage; changes are logged. No system is perfectly secure. `[Any commitment to notify
you of a breach — to be completed by counsel.]`

## Changes

`[How changes to this notice will be announced.]` Last updated: `[date]`.

---

# Acceptable use — outline (DRAFT)

> For an internal tool this is usually an internal policy rather than public terms of service. Headings only;
> the content is the operator's to decide.

1. Who may use TraceESG and how accounts are issued and withdrawn.
2. Use your own account; keep your password to yourself; change the temporary password at first sign-in.
3. Upload only genuine source documents for your own part of the organisation; do not upload documents with
   personal details that are not needed.
4. Confirm extracted values honestly; do not approve your own submissions.
5. The assistant can only read; its wording is not a record — the tables and the source documents are.
6. Activity is logged, including network address and browser.
7. What happens on misuse; who to contact; `[governing law and dispute handling — counsel]`.
