import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canAccessPath,
  landingPathFor,
  postLoginPath,
  safeNextPath,
} from "../lib/auth/redirects.ts";

test("landing: Admin goes to /admin, everyone else to /app", () => {
  assert.equal(landingPathFor(["admin"]), "/admin");
  assert.equal(landingPathFor(["admin", "project_manager"]), "/admin");
  assert.equal(landingPathFor(["project_manager"]), "/app");
  assert.equal(landingPathFor(["corporate_esg"]), "/app");
  assert.equal(landingPathFor([]), "/app");
});

test("namespace access: /admin is Admin only", () => {
  assert.equal(canAccessPath("/admin", ["admin"]), true);
  assert.equal(canAccessPath("/admin/users", ["admin"]), true);
  assert.equal(canAccessPath("/admin", ["project_manager"]), false);
  assert.equal(canAccessPath("/admin/approval-queue", ["corporate_esg"]), false);
  assert.equal(canAccessPath("/administrator", ["admin"]), false);
});

test("namespace access: /app for non-admin roles, unassigned users, and dual-role users", () => {
  assert.equal(canAccessPath("/app", ["project_manager"]), true);
  assert.equal(canAccessPath("/app/approvals", ["corporate_esg"]), true);
  assert.equal(canAccessPath("/app", []), true);
  assert.equal(canAccessPath("/app", ["admin"]), false);
  assert.equal(canAccessPath("/app", ["admin", "hr"]), true);
  assert.equal(canAccessPath("/application", ["hr"]), false);
});

test("safeNextPath rejects open redirects and non-protected paths", () => {
  assert.equal(safeNextPath("/app/verify/abc?x=1"), "/app/verify/abc?x=1");
  assert.equal(safeNextPath("/admin"), "/admin");
  for (const bad of [
    null,
    undefined,
    "",
    "https://evil.test/app",
    "//evil.test/app",
    "/\\evil.test",
    "/login",
    "/app\n/evil",
    "javascript:alert(1)",
    `/app/${"a".repeat(600)}`,
  ]) {
    assert.equal(safeNextPath(bad), null, String(bad));
  }
});

test("safeNextPath rejects control characters inside an otherwise valid protected path", () => {
  for (const code of [0, 9, 10, 13, 31]) {
    const path = `/app/submissions${String.fromCharCode(code)}evil`;
    assert.equal(safeNextPath(path), null, `char code ${code}`);
  }
  assert.equal(safeNextPath("/app/submissions evil"), "/app/submissions evil");
});

test("postLoginPath honours a safe, permitted next path and otherwise lands by role", () => {
  assert.equal(postLoginPath("/app/submissions", ["project_manager"]), "/app/submissions");
  assert.equal(postLoginPath("/admin/users", ["project_manager"]), "/app");
  assert.equal(postLoginPath("//evil.test", ["admin"]), "/admin");
  assert.equal(postLoginPath(null, ["admin"]), "/admin");
});

// Validation run of 2026-10-12: "/app/../x" starts with /app, and a browser resolves it to /x.
test("a return path with dot segments is refused, encoded or not", () => {
  for (const path of [
    "/app/../../evil",
    "/app/../auth/signout",
    "/admin/../api/reports/bundle",
    "/app/./../admin",
    "/app/%2e%2e/admin",
    "/app/%2E%2E%2Fauth/signout",
    "/app/..",
    "/app/..?x=1",
    "/app/%zz",
  ]) {
    assert.equal(safeNextPath(path), null, path);
  }
  for (const path of [
    "/app",
    "/app/submissions?tab=processing",
    "/admin/reports?org=1&from=2026-08-01&to=2026-09-30",
    "/app/verify/3f6c0c1e-0000-4000-8000-000000000001",
    "/app/upload?note=see..below",
  ]) {
    assert.equal(safeNextPath(path), path, path);
  }
});
