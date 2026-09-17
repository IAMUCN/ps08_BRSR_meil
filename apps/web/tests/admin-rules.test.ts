import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allowedChildTypes,
  canBeChildOf,
  checkMove,
  descendantIds,
  isFrozen,
  type OrgNode,
} from "../lib/org/rules.ts";
import { checkPeriodDates, checkTransition } from "../lib/periods/rules.ts";
import { checkAdminRemoval, checkRoleAtNode } from "../lib/users/rules.ts";

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
  assert.equal(canBeChildOf("subsidiary", "project"), true, "skipping BU and Region is allowed");
  assert.equal(canBeChildOf("project", "department"), true);
  assert.equal(canBeChildOf("project", "subsidiary"), false, "inversion rejected");
  assert.equal(canBeChildOf("project", "project"), false, "same level rejected");
  assert.equal(canBeChildOf("group", "group"), false, "no second group");
  assert.deepEqual(allowedChildTypes("site"), ["department"]);
  assert.deepEqual(allowedChildTypes("department"), []);
});

test("org descendants and freezing", () => {
  assert.deepEqual(new Set(descendantIds("sub-a", tree)), new Set(["prj-x", "site-1", "dept-1"]));
  assert.equal(isFrozen("prj-y", tree), true, "inactive ancestor freezes descendants");
  assert.equal(isFrozen("sub-b", tree), true);
  assert.equal(isFrozen("dept-1", tree), false);
});

test("org moves: cycles, root, ordering", () => {
  assert.deepEqual(checkMove("prj-x", "sub-b", tree), { ok: true });
  assert.equal(checkMove("meil", "sub-a", tree).ok, false, "root cannot move");
  assert.equal(checkMove("sub-a", "dept-1", tree).ok, false, "cannot move under own descendant");
  assert.equal(checkMove("prj-x", "prj-x", tree).ok, false, "cannot be own parent");
  assert.equal(
    checkMove("sub-a", "prj-y", tree).ok,
    false,
    "subsidiary under project is an inversion",
  );
  assert.equal(checkMove("missing", "meil", tree).ok, false);
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
