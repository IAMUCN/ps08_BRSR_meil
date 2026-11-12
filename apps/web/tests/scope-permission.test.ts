import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertOrgScope,
  defaultOrgUnitId,
  inOrgScope,
  scopedOrgUnitIds,
} from "../lib/auth/scope.ts";

// The scope helper with a stand-in connection that records the SQL it was given (no database needed). The
// real rows are checked against a database by tests/isolation/monitoring-pages.mjs.
type Call = { text: string; values: unknown[] };
function standIn(rows: { id: string }[]) {
  const calls: Call[] = [];
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join("?"), values });
    return Promise.resolve(rows);
  };
  return { sql: sql as never, calls };
}
const user = { userId: "u1", isAdmin: false };
const admin = { userId: "u2", isAdmin: true };

test("a Super Admin reaches every unit and the database is not asked", async () => {
  const { sql, calls } = standIn([]);
  assert.equal(await scopedOrgUnitIds(sql, admin, "monitoring.view"), null);
  assert.equal(await inOrgScope(sql, admin, "anything", "monitoring.view"), true);
  assert.equal(calls.length, 0);
});

test("without a permission the scope is every assigned subtree, as before", async () => {
  const { sql, calls } = standIn([{ id: "a" }, { id: "b" }]);
  assert.deepEqual(await scopedOrgUnitIds(sql, user), ["a", "b"]);
  assert.ok(!calls[0].text.includes("role_permissions"));
});

test("with a permission only assignments whose role holds it count", async () => {
  const { sql, calls } = standIn([{ id: "s" }]);
  assert.deepEqual(await scopedOrgUnitIds(sql, user, "monitoring.view"), ["s"]);
  assert.ok(calls[0].text.includes("role_permissions"));
  assert.ok(calls[0].values.includes("monitoring.view"));
  assert.ok(calls[0].values.includes("u1"));
});

test("a unit outside the permission's scope is refused, and says the same as a missing one", async () => {
  const { sql } = standIn([{ id: "s" }]);
  assert.equal(await inOrgScope(sql, user, "s", "monitoring.view"), true);
  assert.equal(await inOrgScope(sql, user, "projectA", "monitoring.view"), false);
  await assert.rejects(assertOrgScope(sql, user, "projectA", "monitoring.view"), (e: Error) => {
    assert.equal(e.name, "TRPCError");
    assert.match(e.message, /isn't in your scope/);
    return true;
  });
  await assertOrgScope(sql, user, "s", "monitoring.view");
});

test("the default unit comes from the assignments that hold the permission", async () => {
  const { sql, calls } = standIn([{ id: "s" }]);
  assert.equal(await defaultOrgUnitId(sql, user, "monitoring.view"), "s");
  assert.ok(calls[0].text.includes("role_permissions"));
  const none = standIn([]);
  assert.equal(await defaultOrgUnitId(none.sql, user, "monitoring.view"), null);
});
