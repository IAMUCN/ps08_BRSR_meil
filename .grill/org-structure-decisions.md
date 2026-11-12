# Subsidiary, business unit, project (2026-11-12)

Owner's request: "the business units come under each subsidiary node, under business units there are projects.
So properly rearrange the organisation hierarchy, and establish links related to the org structure. For the
existing projects make a check box as it was given for selecting parents. Don't suggest the business units to
select to a different parent, as business units fall under each subsidiary node." A57.

## What was built

- **Rules** (`lib/org/rules.ts`: `structureProblem`, `singleParent`, `misplaced`), used by `canBeChildOf` and
  `checkAlsoUnder`, so every path (add, move, parents checklist, bulk import, server and page) follows them:
  - a business unit's parent is a subsidiary; it has one parent only (no "also under");
  - a project's parents are business units or a level after business unit (Region, a custom level such as
    Package); never the group or a subsidiary;
  - other levels keep the old rule (any earlier level).
- **Projects under a business unit** (business unit's panel, `organization.setChildren`): every project of the same
  group the person may change, with where it sits today; the misplaced ones first. Ticking adds the business unit
  as a parent; a project still straight under a subsidiary is moved to it instead. Unticking removes it; a project
  managed from this business unit stays ticked (moved from its own panel). One transaction, one audit entry per
  project (`org_unit.parents_changed`, old and new main parent).
- **A project's own Parents checklist** offers business units only. A misplaced project is marked, and the first
  business unit ticked becomes its main parent when saved.
- **A business unit's panel** has no Parents checklist, only a note; Move offers subsidiaries only. The add form
  shows no parents list when the new unit is a business unit.
- **Bulk-import template:** help text names the rules; the "shared" example row is left out when it would be a
  business unit.

## Decisions (made by the agent; confirm with the owner)

1. **Keyed on the level codes** `subsidiary`, `business_unit`, `project` (migration 0037; a code never changes),
   not a new setting, so no migration. If one of those levels is removed, its rule switches off.
2. **Existing units are not changed by the rules.** A project already straight under a subsidiary keeps working
   (records, people, totals) and is marked until it is placed under a business unit. No database trigger was added.
3. **No parent is chosen around business units** (owner, 2026-11-12: "remove the select parent option while dealing with business units"): a business unit's panel has no Move and no Parents card, and adding a unit under a business unit has no parents list (sharing a project is done from the other business unit's Projects list). The server still allows `organization.move` for a business unit, to another subsidiary only, if one is ever filed wrongly.
4. **A project may still be shared by several business units** (the earlier shared-project feature, now one level
   down); a business unit of each subsidiary that runs it.
5. **Regions and other levels between business unit and project** may hold projects.

## Not done

- Rearranging the hosted tree (writes to hosted; needs the owner's go and the business-unit names). See CONTEXT §2.
- The end-to-end fixture `feedback-2026-11.mjs` was updated (shared project under two business units) but not run.
