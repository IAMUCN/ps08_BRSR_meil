import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allowedChildTypes,
  canBeChildOf,
  checkAlsoUnder,
  checkMove,
  descendantIds,
  importOrder,
  isFrozen,
  reachableNodeIds,
  rootOf,
  treeOrder,
  unitByRef,
  type OrgLevel,
  type OrgNode,
} from "../lib/org/rules.ts";
import { PASSWORD_RULES } from "../lib/auth/password-policy.ts";
import { checkPeriodDates, checkTransition } from "../lib/periods/rules.ts";
import { checkAdminRemoval, checkRoleAtNode, generateDefaultPassword } from "../lib/users/rules.ts";

// The seeded levels (migration 0037) plus one an Admin added between Region and Project.
const LEVELS: OrgLevel[] = [
  { code: "group", label: "Group", order: 10 },
  { code: "subsidiary", label: "Subsidiary / Entity", order: 20 },
  { code: "business_unit", label: "Business Unit / Division", order: 30 },
  { code: "region", label: "Region", order: 40 },
  { code: "package", label: "Package", order: 45 },
  { code: "project", label: "Project", order: 50 },
  { code: "site", label: "Site", order: 60 },
  { code: "department", label: "Department", order: 70 },
];

const tree: OrgNode[] = [
  { id: "meil", parentId: null, unitType: "group", status: "active" },
  { id: "sub-a", parentId: "meil", unitType: "subsidiary", status: "active" },
  { id: "prj-x", parentId: "sub-a", unitType: "project", status: "active" },
  { id: "site-1", parentId: "prj-x", unitType: "site", status: "active" },
  { id: "dept-1", parentId: "site-1", unitType: "department", status: "active" },
  { id: "sub-b", parentId: "meil", unitType: "subsidiary", status: "inactive" },
  { id: "prj-y", parentId: "sub-b", unitType: "project", status: "active" },
];

test("org ordering: skip levels, never invert, no second group", () => {
  assert.equal(
    canBeChildOf(LEVELS, "subsidiary", "project"),
    true,
    "skipping BU and Region is allowed",
  );
  assert.equal(canBeChildOf(LEVELS, "project", "department"), true);
  assert.equal(canBeChildOf(LEVELS, "project", "subsidiary"), false, "inversion rejected");
  assert.equal(canBeChildOf(LEVELS, "project", "project"), false, "same level rejected");
  assert.equal(canBeChildOf(LEVELS, "group", "group"), false, "no second group");
  assert.deepEqual(allowedChildTypes(LEVELS, "site"), ["department"]);
  assert.deepEqual(allowedChildTypes(LEVELS, "department"), []);
  // Levels are configuration: one added later takes its place by position, with no code change.
  assert.equal(canBeChildOf(LEVELS, "region", "package"), true);
  assert.equal(canBeChildOf(LEVELS, "package", "project"), true);
  assert.equal(canBeChildOf(LEVELS, "project", "package"), false);
  assert.equal(
    canBeChildOf(LEVELS, "project", "no_such_level"),
    false,
    "an unknown level fits nowhere",
  );
  assert.deepEqual(allowedChildTypes(LEVELS, "region"), [
    "package",
    "project",
    "site",
    "department",
  ]);
});

test("org descendants and freezing", () => {
  assert.deepEqual(new Set(descendantIds("sub-a", tree)), new Set(["prj-x", "site-1", "dept-1"]));
  assert.equal(isFrozen("prj-y", tree), true, "inactive ancestor freezes descendants");
  assert.equal(isFrozen("sub-b", tree), true);
  assert.equal(isFrozen("dept-1", tree), false);
});

test("org moves: cycles, root, ordering", () => {
  assert.deepEqual(checkMove("prj-x", "sub-b", tree, LEVELS), { ok: true });
  assert.equal(checkMove("meil", "sub-a", tree, LEVELS).ok, false, "root cannot move");
  assert.equal(
    checkMove("sub-a", "dept-1", tree, LEVELS).ok,
    false,
    "cannot move under own descendant",
  );
  assert.equal(checkMove("prj-x", "prj-x", tree, LEVELS).ok, false, "cannot be own parent");
  assert.equal(
    checkMove("sub-a", "prj-y", tree, LEVELS).ok,
    false,
    "subsidiary under project is an inversion",
  );
  assert.equal(checkMove("missing", "meil", tree, LEVELS).ok, false);
});

test("period transitions", () => {
  assert.deepEqual(checkTransition({ from: "draft", to: "open", anotherPeriodOpen: false }), {
    ok: true,
  });
  assert.equal(checkTransition({ from: "draft", to: "open", anotherPeriodOpen: true }).ok, false);
  assert.equal(
    checkTransition({ from: "draft", to: "closed", anotherPeriodOpen: false }).ok,
    false,
  );
  assert.deepEqual(checkTransition({ from: "open", to: "closed", anotherPeriodOpen: false }), {
    ok: true,
  });
  assert.equal(
    checkTransition({ from: "closed", to: "open", anotherPeriodOpen: false }).ok,
    false,
    "reopen needs a reason",
  );
  assert.equal(
    checkTransition({ from: "closed", to: "open", anotherPeriodOpen: false, reason: "  " }).ok,
    false,
  );
  assert.deepEqual(
    checkTransition({
      from: "closed",
      to: "open",
      anotherPeriodOpen: false,
      reason: "Late utility bill",
    }),
    { ok: true },
  );
  assert.equal(
    checkTransition({ from: "closed", to: "open", anotherPeriodOpen: true, reason: "x" }).ok,
    false,
  );
  assert.equal(checkTransition({ from: "open", to: "draft", anotherPeriodOpen: false }).ok, false);
  assert.equal(checkTransition({ from: "open", to: "open", anotherPeriodOpen: false }).ok, false);
});

test("period dates and submission window", () => {
  assert.deepEqual(checkPeriodDates({ startDate: "2026-10-01", endDate: "2026-10-31" }), {
    ok: true,
  });
  assert.equal(checkPeriodDates({ startDate: "2026-10-31", endDate: "2026-10-01" }).ok, false);
  assert.equal(checkPeriodDates({ startDate: "2026-10-01", endDate: "2026-10-01" }).ok, false);
  assert.deepEqual(
    checkPeriodDates({
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      submissionOpensOn: "2026-11-01",
      submissionClosesOn: "2026-11-01",
    }),
    { ok: true },
  );
  assert.equal(
    checkPeriodDates({
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      submissionOpensOn: "2026-11-10",
      submissionClosesOn: "2026-11-01",
    }).ok,
    false,
  );
});

test("bulk import: reachable nodes and default passwords", () => {
  assert.deepEqual(
    new Set(reachableNodeIds(tree, ["sub-a"])),
    new Set(["sub-a", "prj-x", "site-1", "dept-1"]),
    "a node's own subtree, itself included",
  );
  assert.deepEqual(
    reachableNodeIds(tree, ["sub-b"]),
    [],
    "an inactive assignment node contributes nothing",
  );
  assert.deepEqual(reachableNodeIds(tree, ["missing"]), []);
  assert.deepEqual(
    new Set(reachableNodeIds(tree, ["sub-a", "prj-x"])),
    new Set(["sub-a", "prj-x", "site-1", "dept-1"]),
    "overlapping assignments de-duplicate",
  );

  assert.equal(
    generateDefaultPassword("Ravi Kumar", "EMP1042", () => 0),
    "Ravi@EMP1042",
    "already 12 characters — no padding needed",
  );
  assert.equal(
    generateDefaultPassword("ravi", "1", () => 0),
    "Ravi@1000000",
  );
  assert.equal(
    generateDefaultPassword("  ", "42", () => 0.9),
    "User@4299999",
    "an unusable name falls back to a fixed token",
  );
  assert.ok(generateDefaultPassword("A", "1").length >= 12, "always meets the 12-char minimum");
  assert.equal(
    generateDefaultPassword("A", "EMP", () => 0),
    "A@EMPx700000",
    "fills in a missing lowercase letter and digit when the name/id alone don't supply one",
  );
  assert.ok(
    PASSWORD_RULES.every((rule) => rule.test(generateDefaultPassword("A", "EMP"))),
    "the generated password always satisfies every policy rule, not just length",
  );
});

test("admin role only at root; lockout guards", () => {
  assert.deepEqual(checkRoleAtNode("admin", "group"), { ok: true });
  assert.equal(checkRoleAtNode("admin", "project").ok, false);
  assert.deepEqual(checkRoleAtNode("corporate_esg", "subsidiary"), { ok: true });

  const base = { actorUserId: "a1", targetUserId: "a2", targetIsActiveAdmin: true };
  assert.deepEqual(checkAdminRemoval({ ...base, otherActiveAdminCount: 1 }), { ok: true });
  assert.equal(
    checkAdminRemoval({ ...base, otherActiveAdminCount: 0 }).ok,
    false,
    "last active Admin",
  );
  assert.equal(
    checkAdminRemoval({ ...base, targetUserId: "a1", otherActiveAdminCount: 5 }).ok,
    false,
    "self-removal",
  );
  assert.deepEqual(
    checkAdminRemoval({
      actorUserId: "a1",
      targetUserId: "pm",
      targetIsActiveAdmin: false,
      otherActiveAdminCount: 0,
    }),
    { ok: true },
    "non-admin targets are unaffected by the last-Admin rule",
  );
});

// --- Bulk import of a whole branch (bulk-import-decisions.md) ---------------------------------------------

test("tree order lists every unit under its parent, siblings by name, with its depth", () => {
  const unit = (id: string, parentId: string | null, name: string) => ({ id, parentId, name });
  const ordered = treeOrder([
    unit("s2", "p1", "Site B"),
    unit("p2", "sub", "Project Z"),
    unit("sub", "root", "Subsidiary"),
    unit("p1", "sub", "Project A"),
    unit("s1", "p1", "Site A"),
    // Its parent is outside the list (a scope that starts below the root): it starts its own branch.
    unit("far", "elsewhere", "Another branch"),
  ]);
  assert.deepEqual(
    ordered.map((n) => [n.name, n.depth]),
    [
      ["Another branch", 0],
      ["Subsidiary", 0],
      ["Project A", 1],
      ["Site A", 2],
      ["Site B", 2],
      ["Project Z", 1],
    ],
  );
});

test("import order puts every row after the row it names as parent, whatever the sheet's order", () => {
  const row = (code: string | null, parentCode: string | null = null) => ({ code, parentCode });
  const { ordered, orphans } = importOrder(
    [
      row("SITE-1", "PRJ-1"), // its parent comes two rows later
      row("DEPT-1", "SITE-1"),
      row("PRJ-1", "SUB-A"), // under an org unit that exists already
      row("PRJ-2"), // no parent: under the unit chosen on screen
      row(null, "PRJ-2"), // a row without a code can still have a parent
    ],
    new Set(["SUB-A"]),
  );
  assert.deepEqual(
    ordered.map((r) => r.code),
    ["PRJ-1", "PRJ-2", null, "SITE-1", "DEPT-1"],
  );
  assert.deepEqual(orphans, []);
});

test("import order sets aside rows whose parent can never exist", () => {
  const row = (code: string | null, parentCode: string | null = null) => ({ code, parentCode });
  const { ordered, orphans } = importOrder(
    [
      row("OK"),
      row("LOST", "NO-SUCH-CODE"),
      row("UNDER-LOST", "LOST"), // its parent is itself an orphan
      row("SELF", "SELF"),
      row("A", "B"), // a circle
      row("B", "A"),
    ],
    new Set(),
  );
  assert.deepEqual(
    ordered.map((r) => r.code),
    ["OK"],
  );
  assert.deepEqual(orphans.map((r) => r.code).sort(), ["A", "B", "LOST", "SELF", "UNDER-LOST"]);
});

test("a sheet names an org unit by its code, or by its name when it has none", () => {
  const units = [
    { code: "MEIL", name: "Megha Engineering" },
    { code: null, name: "Olectra" },
    { code: null, name: "Drilling" },
    { code: null, name: "drilling" },
  ];
  assert.equal(unitByRef(units, "meil"), units[0]);
  assert.equal(unitByRef(units, " olectra "), units[1]);
  assert.equal(unitByRef(units, "Drilling"), "ambiguous"); // two units share the name: never guess
  assert.equal(unitByRef(units, "No such unit"), undefined);
});

// --- A unit under more than one parent, and several groups (migration 0044) -------------------------------

const SHARED_TREE: OrgNode[] = [
  { id: "g", parentId: null, unitType: "group", status: "active" },
  { id: "s1", parentId: "g", unitType: "subsidiary", status: "active" },
  { id: "s2", parentId: "g", unitType: "subsidiary", status: "active" },
  // The shared project: managed from s1, also under s2.
  { id: "p", parentId: "s1", alsoUnder: ["s2"], unitType: "project", status: "active" },
  { id: "site", parentId: "p", unitType: "site", status: "active" },
  { id: "g2", parentId: null, unitType: "group", status: "active" },
  { id: "t1", parentId: "g2", unitType: "subsidiary", status: "active" },
];

test("a shared unit is beneath both parents for scope, and beneath its main parent for management", () => {
  assert.deepEqual(descendantIds("s2", SHARED_TREE), []);
  assert.deepEqual(descendantIds("s2", SHARED_TREE, "all").sort(), ["p", "site"]);
  assert.deepEqual(descendantIds("s1", SHARED_TREE).sort(), ["p", "site"]);
  // Someone assigned to the second subsidiary reaches the shared project and its site.
  assert.deepEqual(reachableNodeIds(SHARED_TREE, ["s2"]).sort(), ["p", "s2", "site"]);
  // Each unit once at the group, though two paths lead to the shared project.
  assert.deepEqual(descendantIds("g", SHARED_TREE, "all").sort(), ["p", "s1", "s2", "site"]);
});

test("one more parent: an earlier level of the same group, not one it has already", () => {
  const check = (node: string, parent: string) => checkAlsoUnder(node, parent, SHARED_TREE, LEVELS);
  assert.deepEqual(check("site", "s2"), { ok: true });
  assert.equal(check("p", "s1").ok, false, "its main parent");
  assert.equal(check("p", "s2").ok, false, "already an extra parent");
  assert.equal(check("p", "p").ok, false, "itself");
  assert.equal(check("s1", "p").ok, false, "a later level: this would close a circle");
  assert.equal(check("s1", "s2").ok, false, "the same level");
  assert.equal(check("g", "g2").ok, false, "a group sits under nothing");
  assert.equal(check("p", "t1").ok, false, "another group's subsidiary");
  assert.equal(rootOf("site", SHARED_TREE), "g");
  // Moving it under a parent it already sits under is refused; so is moving a parent under it.
  assert.equal(checkMove("p", "s2", SHARED_TREE, LEVELS).ok, false);
  assert.equal(checkMove("s2", "p", SHARED_TREE, LEVELS).ok, false);
});

test("import order waits for every parent a row names, the extra ones too", () => {
  const { ordered, orphans } = importOrder(
    [
      { code: "PRJ", parentCode: "SUB-1", alsoUnderCodes: ["SUB-2"] },
      { code: "SUB-2", parentCode: null },
      { code: "SUB-1", parentCode: null },
      { code: "LOST", parentCode: null, alsoUnderCodes: ["NO-SUCH"] },
    ],
    new Set<string>(),
  );
  assert.deepEqual(
    ordered.map((r) => r.code),
    ["SUB-2", "SUB-1", "PRJ"],
  );
  assert.deepEqual(
    orphans.map((r) => r.code),
    ["LOST"],
  );
});
