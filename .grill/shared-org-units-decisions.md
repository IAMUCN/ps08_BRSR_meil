# Shared org units, several groups, delete — and the chat pane (owner's page feedback, 2026-10-11)

Eight notes sent from the page-feedback widget on `/admin/organization`. Three needed a decision the documents
do not settle; the owner was asked and chose.

## Decisions (the owner's)

| Question | Answer |
|---|---|
| A project under two subsidiaries: how do its figures count? | **In full in each subsidiary, once at the group.** The two subsidiaries then add up to more than the group, by the shared project. (Not chosen: a percentage share per parent; showing it under both but counting through one.) |
| A second top-level group | **Separate groups, same Admins.** Each group is the top of its own tree with its own reports. (Not chosen: keep one root; a level above MEIL.) |
| What "delete" means for an org unit | **A real delete for unused units**, confirmed by typing `delete`. A unit that has been used can only be deactivated. |

## What was built

**A unit under more than one parent (migration `0044`, D36, A35).**
- `org_units.parent_id` stays the **main parent**: where the unit was created and where it is moved and
  deactivated from. `org_unit_parents` holds each **extra parent**.
- An extra parent must be at an earlier level than the unit (so no circle can form), in the same group, and
  not a parent the unit already has. A group has none. Enforced by a database trigger and by
  `checkAlsoUnder` in `lib/org/rules.ts`.
- `org_unit_tree` follows both kinds of link and holds each ancestor–descendant pair once. Everything that
  reads it — consolidation, scope dashboards, reports, the Control Tower, record search, the chatbot — gives
  the owner's answer with no further change: full in each parent, once above them.
- **Who sees it:** people assigned to either parent (`my_org_unit_ids()`, the approval and scope checks,
  upload targets).
- **What stays with the main parent only:** deactivation (a shared unit is frozen when its main parent is,
  not when an extra parent is), moving, and delete.
- Organization page: a card "Also under another parent" on every non-group unit; the tree draws the unit
  under each parent and marks it "Shared" where that parent is not the main one.
- Bulk import: a fifth column, **Also under** — the codes of the other parents, separated by commas (owner's follow-up the same day; a semicolon is still read).
  A row is created with all its parents or not at all.

**Several groups.** The database never refused a second group; only the app did. `organization.create` now
takes no parent for a new group (Admin only); the Add a unit panel has "On its own, as a new group". A group
can be deactivated while another active one remains. Where a page needs "the group" and none is chosen, it
takes the oldest.

**Delete.** `organization.delete` removes a unit and the units managed under it when none of them has a role
assignment (past ones count), a document, a record or a report. The dialog lists what stands in the way;
otherwise the word `delete` must be typed. One audit entry per deleted unit keeps what it was. A group can
go only while another remains. Deactivating a unit that has units under it now asks for the word
`deactivate`.

**Chat pane.** The header is a bar as tall as the top bar in the modal-header colour (#37358F in the
Corporate theme) holding the title and the three icon buttons; the question box is one line and grows with
the text; the suggested questions sit at the foot of the pane, next to the question box.

**Chatbot answer about "projects under X".** The model had been given a flat list of projects and left to
work out which belonged to the unit asked about. `list_org_units` now takes `under` (and `direct_only`) and
the server returns only the units beneath it; the system prompt tells the model to use it and not to work out
membership itself.

**Follow-up feedback the same day.** The "Shared" tag glows (theme colour) and shows on the unit under every
parent, its main one included. **Export hierarchy** on the Organization page downloads every unit below group
level in the bulk-import columns, to edit and upload again; uploaded unchanged it creates nothing, because
codes must be new.

## Assumptions made (say if any is wrong)

- "Suggested questions should be in the top portion not in the up portion" was read as: at the **bottom**,
  near the question box.
- "Aligned with the top navbar width" was read as: the pane's header is the same **height** as the top bar.
- The colour is taken from the theme's modal-header token, which is #37358F in Corporate; the Special and
  Dark themes keep their own.
- Sharing is allowed at every level below group, not for projects only.

## Limits

- A shared unit under two parents makes those parents' totals add up to more than their group's. That is
  the chosen rule; the report's consolidation table per child org unit will show it.
- The unit pickers on Reports, Forecast and Simulator (for an Admin) list a shared unit once, under its main
  parent.
- The non-Admin scope lists in Users → bulk import follow main parents only.
- Nothing on a page says "these two add up to more than the group"; only the Organization page explains it.
