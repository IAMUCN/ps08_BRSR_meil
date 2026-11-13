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
  mergeSharedRows,
  misplaced,
  structureProblem,
  reachableNodeIds,
  rootOf,
  treeOrder,
  unitByRef,
  type OrgLevel,
  type OrgNode,
} from "../lib/org/rules.ts";
import { parentsOf } from "../lib/bulk-import/xlsx.ts";
import { PASSWORD_RULES } from "../lib/auth/password-policy.ts";
import {
  checkPeriodDates,
  checkTransition,
  defaultWindow,
  uploadTiming,
} from "../lib/periods/rules.ts";
import { checkAdminRemoval, checkRoleAtNode, generateInitialPassword } from "../lib/users/rules.ts";

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
  { id: "bu-b", parentId: "sub-b", unitType: "business_unit", status: "active" },
];

test("org ordering: skip levels, never invert, no second group", () => {
  assert.equal(canBeChildOf(LEVELS, "subsidiary", "region"), true, "skipping a level is allowed");
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
  assert.deepEqual(checkMove("prj-x", "bu-b", tree, LEVELS), { ok: true });
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
  assert.deepEqual(checkTransition({ from: "draft", to: "open" }), {
    ok: true,
  });
  // Several periods may be open at once (migration 0056).
  assert.equal(checkTransition({ from: "draft", to: "open" }).ok, true);
  assert.equal(checkTransition({ from: "draft", to: "closed" }).ok, false);
  assert.deepEqual(checkTransition({ from: "open", to: "closed" }), {
    ok: true,
  });
  assert.equal(checkTransition({ from: "closed", to: "open" }).ok, false, "reopen needs a reason");
  assert.equal(checkTransition({ from: "closed", to: "open", reason: "  " }).ok, false);
  assert.deepEqual(
    checkTransition({
      from: "closed",
      to: "open",
      reason: "Late utility bill",
    }),
    { ok: true },
  );
  assert.equal(checkTransition({ from: "closed", to: "open", reason: "x" }).ok, true);
  assert.equal(checkTransition({ from: "open", to: "draft" }).ok, false);
  assert.equal(checkTransition({ from: "open", to: "open" }).ok, false);
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

  // Initial passwords of bulk-created accounts: random, never derived from the person's details.
  const passwords = Array.from({ length: 200 }, () => generateInitialPassword());
  assert.ok(
    passwords.every((p) => p.length === 16 && PASSWORD_RULES.every((rule) => rule.test(p))),
    "every generated password is 16 characters and satisfies every policy rule",
  );
  assert.equal(new Set(passwords).size, passwords.length, "no two generated passwords are alike");
  assert.ok(
    passwords.every((p) => !/[0O1lI]/.test(p)),
    "look-alike characters are never used",
  );
  let calls = 0;
  generateInitialPassword((max) => {
    calls++;
    return max - 1;
  });
  assert.ok(calls >= 16, "every character and every shuffle step draws from the random source");
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

test("a Parent code cell names any number of parents; spaces around a name never matter", () => {
  assert.deepEqual(parentsOf("SUB-A, SUB-B"), { parentCode: "SUB-A", alsoUnder: ["SUB-B"] });
  assert.deepEqual(parentsOf("  SUB-A  ;SUB-B ,  SUB-C,SUB-D   "), {
    parentCode: "SUB-A",
    alsoUnder: ["SUB-B", "SUB-C", "SUB-D"],
  });
  assert.deepEqual(parentsOf("SUB-A"), { parentCode: "SUB-A", alsoUnder: [] });
  assert.deepEqual(parentsOf("SUB-A,, ,SUB-A"), { parentCode: "SUB-A", alsoUnder: [] });
  assert.deepEqual(parentsOf(""), { parentCode: "", alsoUnder: [] });
  // Names: one space, two or three, before or after — the same name.
  assert.deepEqual(parentsOf("Olectra   Greentech  ,   EVEY   "), {
    parentCode: "Olectra Greentech",
    alsoUnder: ["EVEY"],
  });
  // A name that holds a comma is kept whole when such a unit exists, alone or in a list.
  const names = ["Seetharampur plant, Telangana", "Olectra Greentech"];
  assert.deepEqual(parentsOf("Seetharampur plant, Telangana", names), {
    parentCode: "Seetharampur plant, Telangana",
    alsoUnder: [],
  });
  assert.deepEqual(parentsOf("EVEY,  seetharampur  plant ,Telangana , Olectra Greentech", names), {
    parentCode: "EVEY",
    alsoUnder: ["seetharampur plant, Telangana", "Olectra Greentech"],
  });
  // Values picked from the template's list: "CODE — Name", the name's comma included.
  assert.deepEqual(parentsOf("SUB-A — Megha, Engineering Ltd"), {
    parentCode: "SUB-A",
    alsoUnder: [],
  });
  assert.deepEqual(parentsOf("SUB-A — First, SUB-B — Second"), {
    parentCode: "SUB-A",
    alsoUnder: ["SUB-B"],
  });
  assert.deepEqual(parentsOf("SUB-A — First, SUB-B"), {
    parentCode: "SUB-A",
    alsoUnder: ["SUB-B"],
  });
});

test("an org unit is found by code or name whatever the spaces and letter case", () => {
  const units = [
    { code: "OLECTRA", name: "Olectra Greentech" },
    { code: null, name: "TGSRTC  Telangana" },
  ];
  assert.equal(unitByRef(units, "  olectra "), units[0]);
  assert.equal(unitByRef(units, "Olectra   Greentech  "), units[0]);
  assert.equal(unitByRef(units, " TGSRTC Telangana   "), units[1]);
  assert.equal(unitByRef(units, "TGSRTC"), undefined);
});

test("a shared unit listed under each parent is read as one unit with all those parents", () => {
  const row = (
    code: string | null,
    name: string,
    parentCode: string,
    alsoUnder: string[] = [],
  ) => ({
    code,
    name,
    unitType: "project",
    parentCode,
    alsoUnder,
  });
  const { rows, sameAs } = mergeSharedRows([
    row("PRJ-X", "Project X", "SUB-A", ["SUB-B"]), // under Subsidiary A, as the export writes it
    row("PRJ-Y", "Project Y", "SUB-A"),
    row("PRJ-X", "project x ", "SUB-A", ["SUB-B"]), // the same unit again, under Subsidiary B
    row("PRJ-Z", "Project Z", "SUB-B"),
    row("PRJ-Z", "A different name", "SUB-B"), // one code, two names: a mistake, left for the check
    row(null, "No code", "SUB-A"),
    row(null, "No code", "SUB-B"), // without a code, one parent each: two units
    row(null, "TGSRTC", "EVEY", ["OLECTRA"]),
    row(null, "TGSRTC", "EVEY", ["OLECTRA"]), // no code, but the same two parents: the same unit
    row(null, "TGSRTC", "OLECTRA", ["EVEY"]), // and again, parents in the other order
    row(null, "TGSRTC", "EVEY", ["DRILLMEC"]), // other parents: another unit
    row("PRJ-W", "Project W", "SUB-A"),
    row("PRJ-W", "Project W", "SUB-B"), // listed twice with one parent each: both parents are kept
  ]);
  assert.deepEqual(
    rows.map((r) => [r.index, r.code, r.parentCode, r.alsoUnder]),
    [
      [0, "PRJ-X", "SUB-A", ["SUB-B"]],
      [1, "PRJ-Y", "SUB-A", []],
      [3, "PRJ-Z", "SUB-B", []],
      [4, "PRJ-Z", "SUB-B", []],
      [5, null, "SUB-A", []],
      [6, null, "SUB-B", []],
      [7, null, "EVEY", ["OLECTRA"]],
      [10, null, "EVEY", ["DRILLMEC"]],
      [11, "PRJ-W", "SUB-A", ["SUB-B"]],
    ],
  );
  assert.deepEqual(
    [...sameAs],
    [
      [2, 0],
      [8, 7],
      [9, 7],
      [12, 11],
    ],
  );
});

test("period window: defaults, late uploads and where an upload stands (migration 0056)", () => {
  assert.deepEqual(defaultWindow("2026-08-31"), {
    closesOn: "2026-09-15",
    lateUntil: "2026-10-15",
  });
  assert.deepEqual(defaultWindow("2026-12-31"), {
    closesOn: "2027-01-15",
    lateUntil: "2027-02-14",
  });
  const august = {
    endDate: "2026-08-31",
    submissionClosesOn: "2026-09-15",
    lateUploadsUntil: "2026-10-15",
  };
  assert.equal(uploadTiming(august, "2026-09-15"), "on_time");
  assert.equal(uploadTiming(august, "2026-09-16"), "late");
  assert.equal(uploadTiming(august, "2026-10-15"), "late");
  assert.equal(uploadTiming(august, "2026-10-16"), "closed");
  // No late date: the period closes on its due date, as before.
  assert.equal(uploadTiming({ ...august, lateUploadsUntil: null }, "2026-09-16"), "closed");
  assert.equal(
    checkPeriodDates({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      submissionClosesOn: "2026-09-15",
      lateUploadsUntil: "2026-09-14",
    }).ok,
    false,
  );
});

test("MEIL structure: business units under one subsidiary, projects under business units", () => {
  assert.equal(canBeChildOf(LEVELS, "subsidiary", "business_unit"), true);
  assert.equal(
    canBeChildOf(LEVELS, "group", "business_unit"),
    false,
    "not straight under the group",
  );
  assert.equal(
    canBeChildOf(LEVELS, "subsidiary", "project"),
    false,
    "a project needs a business unit",
  );
  assert.equal(canBeChildOf(LEVELS, "group", "project"), false);
  assert.equal(canBeChildOf(LEVELS, "business_unit", "project"), true);
  assert.equal(
    canBeChildOf(LEVELS, "region", "project"),
    true,
    "a level after business unit is fine",
  );
  assert.match(structureProblem(LEVELS, "subsidiary", "project") ?? "", /under a Business Unit/);
  assert.deepEqual(allowedChildTypes(LEVELS, "subsidiary"), [
    "business_unit",
    "region",
    "package",
    "site",
    "department",
  ]);
  // Without a business-unit level the rules have nothing to hold on to.
  const plain = LEVELS.filter((l) => l.code !== "business_unit");
  assert.equal(canBeChildOf(plain, "subsidiary", "project"), true);

  const t: OrgNode[] = [
    { id: "g", parentId: null, unitType: "group", status: "active" },
    { id: "s1", parentId: "g", unitType: "subsidiary", status: "active" },
    { id: "s2", parentId: "g", unitType: "subsidiary", status: "active" },
    { id: "b1", parentId: "s1", unitType: "business_unit", status: "active" },
    { id: "b2", parentId: "s2", unitType: "business_unit", status: "active" },
    { id: "p", parentId: "b1", unitType: "project", status: "active" },
    { id: "old", parentId: "s1", unitType: "project", status: "active" },
  ];
  const also = (node: string, parent: string) => checkAlsoUnder(node, parent, t, LEVELS);
  assert.deepEqual(also("p", "b2"), { ok: true }, "a project shared by two business units");
  assert.equal(also("b1", "s2").ok, false, "a business unit has one subsidiary");
  assert.match((also("b1", "s2") as { reason: string }).reason, /one Subsidiary/);
  assert.deepEqual(
    also("p", "s2"),
    { ok: true },
    "a project is shared with another subsidiary too",
  );
  assert.equal(also("b1", "g").ok, false, "a business unit is never shared");
  assert.deepEqual(checkMove("b1", "s2", t, LEVELS), { ok: true }, "moved to another subsidiary");
  assert.equal(checkMove("b1", "g", t, LEVELS).ok, false);
  assert.equal(misplaced(t[6], t, LEVELS) !== null, true, "placed before the rules");
  assert.equal(misplaced(t[5], t, LEVELS), null);
  assert.deepEqual(checkMove("old", "b2", t, LEVELS), { ok: true }, "and put right by a move");
});
