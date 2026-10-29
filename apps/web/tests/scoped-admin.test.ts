import assert from "node:assert/strict";
import { test } from "node:test";
import { uploadTargets } from "../lib/documents/rules.ts";
import type { OrgNode } from "../lib/org/rules.ts";
import { administeredIds, checkAccountReach, checkGrant } from "../lib/users/rules.ts";

// Super Admins and scoped Administrators (.grill/scoped-admin-onboarding-decisions.md, migration 0050).
//
//   group
//   ├─ subA ─┬─ projA1
//   │        └─ projA2
//   └─ subB ─── projB1        shared also sits under subA (its main parent is subB)
const node = (id: string, parentId: string | null, alsoUnder: string[] = []): OrgNode => ({
  id,
  parentId,
  alsoUnder,
  unitType: parentId === null ? "group" : id.startsWith("sub") ? "subsidiary" : "project",
  status: "active",
});
const nodes = [
  node("group", null),
  node("subA", "group"),
  node("subB", "group"),
  node("projA1", "subA"),
  node("projA2", "subA"),
  node("projB1", "subB"),
  node("shared", "subB", ["subA"]),
];

const superAdmin = { isAdmin: true, adminOrgUnitIds: [] };
const subAdmin = { isAdmin: false, adminOrgUnitIds: ["subA"] };
const projAdmin = { isAdmin: false, adminOrgUnitIds: ["projA1"] };
const nobody = { isAdmin: false, adminOrgUnitIds: [] };

test("what is administered: everything for a Super Admin, the unit and all beneath for an Administrator", () => {
  assert.equal(administeredIds(superAdmin, nodes), null);
  assert.deepEqual([...administeredIds(subAdmin, nodes)!].sort(), [
    "projA1",
    "projA2",
    "shared",
    "subA",
  ]);
  assert.deepEqual([...administeredIds(projAdmin, nodes)!], ["projA1"]);
  assert.equal(administeredIds(nobody, nodes)!.size, 0);
});

test("a Super Admin may grant any role anywhere", () => {
  for (const role of ["admin", "org_admin", "hr"]) {
    assert.equal(checkGrant(superAdmin, role, "group", nodes).ok, true);
    assert.equal(checkGrant(superAdmin, role, "projB1", nodes).ok, true);
  }
});

test("an Administrator grants operational roles at their own unit and beneath, nowhere else", () => {
  assert.equal(checkGrant(subAdmin, "hr", "subA", nodes).ok, true);
  assert.equal(checkGrant(subAdmin, "project_manager", "projA2", nodes).ok, true);
  assert.equal(checkGrant(subAdmin, "hr", "shared", nodes).ok, true);
  // A sibling subsidiary, its project, and the group above.
  for (const unit of ["subB", "projB1", "group"]) {
    assert.equal(checkGrant(subAdmin, "hr", unit, nodes).ok, false, unit);
  }
  // An id that does not exist reads as out of scope.
  assert.equal(checkGrant(subAdmin, "hr", "nope", nodes).ok, false);
});

test("an Administrator appoints Administrators beneath, never at their own level, never a Super Admin", () => {
  assert.equal(checkGrant(subAdmin, "org_admin", "projA1", nodes).ok, true);
  assert.equal(checkGrant(subAdmin, "org_admin", "subA", nodes).ok, false);
  assert.equal(checkGrant(subAdmin, "org_admin", "subB", nodes).ok, false);
  assert.equal(checkGrant(subAdmin, "admin", "group", nodes).ok, false);
  assert.equal(checkGrant(subAdmin, "admin", "subA", nodes).ok, false);
  // A project has nothing beneath it: its Administrator cannot create another one.
  assert.equal(checkGrant(projAdmin, "org_admin", "projA1", nodes).ok, false);
  assert.equal(checkGrant(projAdmin, "hr", "projA1", nodes).ok, true);
  assert.equal(checkGrant(projAdmin, "hr", "projA2", nodes).ok, false);
});

test("holding user.manage without an administrator role grants nothing", () => {
  assert.equal(checkGrant(nobody, "hr", "projA1", nodes).ok, false);
  assert.equal(checkGrant(nobody, "org_admin", "projA1", nodes).ok, false);
});

test("a whole account is in reach only when every role it holds is", () => {
  const at = (roleCode: string, orgUnitId: string) => ({ roleCode, orgUnitId });
  assert.equal(checkAccountReach(subAdmin, [at("hr", "projA1")], nodes).ok, true);
  assert.equal(
    checkAccountReach(subAdmin, [at("hr", "projA1"), at("org_admin", "projA2")], nodes).ok,
    true,
  );
  // Also works for another branch: only the role inside the scope can be removed, not the account.
  assert.equal(
    checkAccountReach(subAdmin, [at("hr", "projA1"), at("hr", "projB1")], nodes).ok,
    false,
  );
  // A peer Administrator at the same unit, and a Super Admin, are out of reach.
  assert.equal(checkAccountReach(subAdmin, [at("org_admin", "subA")], nodes).ok, false);
  assert.equal(checkAccountReach(subAdmin, [at("admin", "group")], nodes).ok, false);
  // An account with no role belongs to nobody's scope.
  assert.equal(checkAccountReach(subAdmin, [], nodes).ok, false);
  assert.equal(checkAccountReach(superAdmin, [], nodes).ok, true);
  assert.equal(checkAccountReach(superAdmin, [at("admin", "group")], nodes).ok, true);
});

test("an administrator uploads every category at every unit they administer", () => {
  const categories = [
    { id: "energy", owningRoleId: "pm" },
    { id: "workforce", owningRoleId: "hr" },
    { id: "open", owningRoleId: null },
  ];
  const upload = new Set(["pm", "hr", "org_admin"]);
  const asAdmin = uploadTargets(
    nodes,
    [{ orgUnitId: "subA", roleId: "org_admin" }],
    upload,
    categories,
    new Map(),
    new Set(["org_admin"]),
  );
  assert.deepEqual([...asAdmin.keys()].sort(), ["projA1", "projA2", "shared", "subA"]);
  assert.deepEqual(asAdmin.get("projA1"), ["energy", "workforce", "open"]);
  assert.equal(asAdmin.has("projB1"), false);

  // The same role without the administrator flag keeps the owning-role filter.
  const asHr = uploadTargets(nodes, [{ orgUnitId: "subA", roleId: "hr" }], upload, categories);
  assert.deepEqual(asHr.get("projA1"), ["workforce", "open"]);
});
