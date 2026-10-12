# Default permissions per role — decisions (2026-10-12)

Owner's request: check how the roles work in a real organisation and select the permissions each role needs,
using only the permissions the app already has (20; none added, none removed).

How a company that files a BRSR is usually organised, and the role that stands for each part:

| In the company | Role here | What they do |
|---|---|---|
| Site or project head and their staff | Project Manager | File the project's fuel, electricity and activity evidence and confirm the values read from it |
| Function heads | HR, EHS / Environment, Procurement, Finance / CSR | File and confirm the evidence of their own function; HR also brings employees onto the system |
| Corporate sustainability cell | Corporate ESG / Sustainability | Checks what the sites filed, settles flagged values, approves, follows completeness, prepares the report, handles carbon credits |
| System owner | Admin | Organisation, people, roles, periods, factors, BRSR mapping, settings, audit trail |

Resulting defaults (✚ = added by migration `0048`):

| Permission | Admin | Corporate ESG | Project Manager | HR | EHS | Procurement | Finance / CSR |
|---|---|---|---|---|---|---|---|
| document.upload | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| record.verify | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| chat.use | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| approval.decide | ✓ | ✓ | | | | | |
| validation.review | ✓ | ✚ | | | | | |
| monitoring.view | ✓ | ✓ | | | | | |
| report.generate | ✓ | ✚ | | | | | |
| carbon_credit.view | ✓ | ✓ | ✓ | | | | ✓ |
| carbon_credit.manage | ✓ | ✓ | | | | | |
| icp.manage | ✓ | ✓ | | | | | ✓ |
| user.bulk_import | ✓ | | | ✓ | | | |
| org.bulk_import | ✓ | | | | | | |
| audit.view, brsr_mapping.manage, factor.manage, org.manage, period.manage, role.manage, settings.manage, user.manage | ✓ | | | | | | |

Decisions (agent's, for the owner to confirm):

- **Corporate ESG gains `validation.review` and `report.generate`.** It could approve and monitor but not
  settle a flagged value or produce the report, the steps on either side. Both procedures are limited to the
  person's org scope (security audit, `lib/auth/scope.ts`).
- **Organisation-wide configuration stays with Admin.** Factors, BRSR mapping, periods, roles, settings, users
  and the audit trail apply to the whole organisation and are not limited by org scope, so a role assigned
  at a subsidiary must not hold them.
- **Submitters do not approve.** No contributor role gets `approval.decide`; the app also refuses approving
  your own record.
- **Project Manager keeps `carbon_credit.view`** (seeded by `0046`). A project has little use for it, and
  removing it was considered; it stays because the regression suite uses it to prove a Project Manager sees
  only the own project's credits, and the owner did not ask for removals.
- **No screen yet outside the Admin area** for `validation.review`, `report.generate`, `monitoring.view`
  and the carbon permissions: `/admin` is for the Admin role only, so for Corporate ESG these work through
  the app's procedures but have no page. Giving that role pages is ui work, not done here.

Checked: database tests 321/321 (new `role_permission_defaults.test.sql`, 9). Not run: the end-to-end suite.
Migration `0048` is on the local database only.
