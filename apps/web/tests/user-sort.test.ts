import assert from "node:assert/strict";
import { test } from "node:test";
import { sortUsers } from "../lib/users/sort.ts";

const person = (displayName: string, ...roles: [string, string][]) => ({
  displayName,
  assignments: roles.map(([roleCode, roleName]) => ({ roleCode, roleName })),
});
const SUPER: [string, string] = ["admin", "Super Admin"];
const ADMIN: [string, string] = ["org_admin", "Administrator"];
const EHS: [string, string] = ["ehs", "EHS / Environment"];
const HR: [string, string] = ["hr", "HR"];

const people = [
  person("Zed", HR),
  person("Amy"),
  person("Bal", ADMIN),
  person("Yan", SUPER),
  person("Cid", HR),
  person("Dee", EHS, ADMIN),
  person("Eve", EHS),
];
const names = (list: { displayName: string }[]) => list.map((p) => p.displayName);

test("by role: Super Admin, Administrator, other roles by name, then no role; by name within", () => {
  assert.deepEqual(names(sortUsers(people, "role")), [
    "Yan",
    "Bal",
    "Dee",
    "Eve",
    "Cid",
    "Zed",
    "Amy",
  ]);
});

test("someone with several roles is listed under the highest", () => {
  const sorted = names(sortUsers(people, "role"));
  assert.ok(sorted.indexOf("Dee") < sorted.indexOf("Eve"));
});

test("by name: A to Z whatever the role, ignoring case", () => {
  assert.deepEqual(
    names(sortUsers([person("bob", HR), person("Amy", SUPER), person("Cal")], "name")),
    ["Amy", "bob", "Cal"],
  );
});

test("the list given is left as it was", () => {
  const before = names(people);
  sortUsers(people, "role");
  assert.deepEqual(names(people), before);
});
