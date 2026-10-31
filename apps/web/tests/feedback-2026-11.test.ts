import assert from "node:assert/strict";
import { test } from "node:test";
import { checkOpenDeadline } from "../lib/periods/rules.ts";
import { roleCodeError } from "../lib/roles/code.ts";

test("role code: each fault has its own words, a good code has none", () => {
  assert.equal(roleCodeError(""), "Role code cannot be empty.");
  assert.equal(roleCodeError("   "), "Role code cannot be empty.");
  assert.equal(roleCodeError("Site_Auditor"), "Uppercase letters are not allowed.");
  assert.equal(
    roleCodeError("site-auditor"),
    "Role code must contain only lowercase letters, numbers, and underscores.",
  );
  assert.equal(roleCodeError("1site"), "Role code must start with a letter.");
  assert.equal(roleCodeError("a"), "Role code must be 2 to 41 characters long.");
  assert.equal(roleCodeError("a".repeat(42)), "Role code must be 2 to 41 characters long.");
  assert.equal(roleCodeError("site_auditor_2"), null);
});

const base = { endDate: "2026-08-31", opensOn: "2026-09-01", today: "2026-10-16" };

test("opening: a passed deadline needs a new close date of today or later", () => {
  assert.equal(checkOpenDeadline({ ...base, closesOn: "2026-10-15" }).ok, false);
  assert.equal(
    checkOpenDeadline({ ...base, closesOn: "2026-10-15", newClosesOn: "2026-10-15" }).ok,
    false,
  );
  assert.equal(
    checkOpenDeadline({ ...base, closesOn: "2026-10-15", newClosesOn: "2026-10-16" }).ok,
    true,
  );
});

test("opening: the deadline day itself is still open; future periods need nothing", () => {
  assert.equal(checkOpenDeadline({ ...base, closesOn: "2026-10-16" }).ok, true);
  assert.equal(
    checkOpenDeadline({ ...base, endDate: "2026-12-31", opensOn: null, closesOn: null }).ok,
    true,
  );
});

test("opening: without a close date the end date is the deadline", () => {
  assert.equal(checkOpenDeadline({ ...base, closesOn: null }).ok, false);
});
