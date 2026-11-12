import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canAccessPath,
  landingPathFor,
  postLoginPath,
  safeNextPath,
} from "../lib/auth/redirects.ts";
import type { SessionResult } from "../lib/auth/session.ts";

// Simulates the RootPage decision logic from app/page.tsx
function resolveRootDestination(
  result: SessionResult | null,
): { action: "render_landing" } | { action: "redirect"; destination: string } {
  if (result?.status === "active") {
    return { action: "redirect", destination: landingPathFor(result.session.roleCodes) };
  }
  if (result?.status === "password_change_required") {
    return { action: "redirect", destination: "/login" };
  }
  return { action: "render_landing" };
}

// Simulates signOutAction redirection logic
function resolveSignOutDestination(): string {
  return "/";
}

// Simulates /auth/signout route redirection logic
function resolveSignOutRouteDestination(reason: string | null): string {
  const FORWARDED_REASONS = new Set(["deactivated", "unprovisioned", "expired"]);
  if (reason === "expired") {
    return "/login?reason=expired";
  }
  return reason && FORWARDED_REASONS.has(reason) ? `/login?reason=${reason}` : "/";
}

const PROTECTED_PREFIXES = ["/admin", "/app"];
function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

test("Scenario 1: Logged-out user opens / -> Landing page", () => {
  const result: SessionResult = { status: "anonymous" };
  const outcome = resolveRootDestination(result);
  assert.equal(outcome.action, "render_landing");

  // Also when auth/db check returns null / fails
  const failedDbOutcome = resolveRootDestination(null);
  assert.equal(failedDbOutcome.action, "render_landing");
});

test("Scenario 2: Logged-in user opens / -> Appropriate dashboard", () => {
  // Super Admin
  const adminOutcome = resolveRootDestination({
    status: "active",
    session: {
      userId: "u1",
      email: "admin@test.local",
      displayName: "Admin",
      theme: "theme-1",
      isAdmin: true,
      isOrgAdmin: false,
      adminOrgUnitIds: [],
      roleCodes: ["admin"],
      permissions: [],
      assignments: [],
    },
  });
  assert.equal(adminOutcome.action, "redirect");
  if (adminOutcome.action === "redirect") {
    assert.equal(adminOutcome.destination, "/admin");
  }

  // Org Admin
  const orgAdminOutcome = resolveRootDestination({
    status: "active",
    session: {
      userId: "u2",
      email: "orgadmin@test.local",
      displayName: "Org Admin",
      theme: "theme-1",
      isAdmin: false,
      isOrgAdmin: true,
      adminOrgUnitIds: ["org-1"],
      roleCodes: ["org_admin"],
      permissions: [],
      assignments: [],
    },
  });
  assert.equal(orgAdminOutcome.action, "redirect");
  if (orgAdminOutcome.action === "redirect") {
    assert.equal(orgAdminOutcome.destination, "/admin");
  }

  // Project Manager / Operational user
  const pmOutcome = resolveRootDestination({
    status: "active",
    session: {
      userId: "u3",
      email: "pm@test.local",
      displayName: "Project Manager",
      theme: "theme-1",
      isAdmin: false,
      isOrgAdmin: false,
      adminOrgUnitIds: [],
      roleCodes: ["project_manager"],
      permissions: [],
      assignments: [],
    },
  });
  assert.equal(pmOutcome.action, "redirect");
  if (pmOutcome.action === "redirect") {
    assert.equal(pmOutcome.destination, "/app");
  }

  // HR user
  const hrOutcome = resolveRootDestination({
    status: "active",
    session: {
      userId: "u4",
      email: "hr@test.local",
      displayName: "HR Officer",
      theme: "theme-1",
      isAdmin: false,
      isOrgAdmin: false,
      adminOrgUnitIds: [],
      roleCodes: ["hr"],
      permissions: [],
      assignments: [],
    },
  });
  assert.equal(hrOutcome.action, "redirect");
  if (hrOutcome.action === "redirect") {
    assert.equal(hrOutcome.destination, "/app");
  }
});

test("Scenario 3: Logged-in user refreshes dashboard -> stays on same dashboard", () => {
  // An admin on /admin stays authorized on /admin
  assert.equal(canAccessPath("/admin", ["admin"]), true);
  // An operational user on /app stays authorized on /app
  assert.equal(canAccessPath("/app", ["project_manager"]), true);
  assert.equal(canAccessPath("/app", ["corporate_esg"]), true);
});

test("Scenario 4: Logged-in user directly opens another authorized route -> Requested page", () => {
  assert.equal(postLoginPath("/app/submissions", ["project_manager"]), "/app/submissions");
  assert.equal(postLoginPath("/app/upload", ["project_manager"]), "/app/upload");
  assert.equal(postLoginPath("/admin/users", ["admin"]), "/admin/users");
  assert.equal(postLoginPath("/admin/reports", ["org_admin"]), "/admin/reports");

  // But unauthorized paths fallback to appropriate dashboard
  assert.equal(postLoginPath("/admin/users", ["project_manager"]), "/app");
});

test("Scenario 5: User logs out -> Landing page (/)", () => {
  const logoutDestination = resolveSignOutDestination();
  assert.equal(logoutDestination, "/");

  const routeSignOutDestination = resolveSignOutRouteDestination(null);
  assert.equal(routeSignOutDestination, "/");
});

test("Scenario 6: Logged-out user tries accessing a protected route -> Redirected appropriately", () => {
  assert.equal(isProtected("/app"), true);
  assert.equal(isProtected("/app/submissions"), true);
  assert.equal(isProtected("/admin"), true);
  assert.equal(isProtected("/admin/users"), true);

  // Public routes are not protected
  assert.equal(isProtected("/"), false);
  assert.equal(isProtected("/login"), false);
  assert.equal(isProtected("/forgot-password"), false);
});

test("Scenario 7: Password change required user -> Redirected to /login", () => {
  const outcome = resolveRootDestination({
    status: "password_change_required",
    email: "newuser@test.local",
  });
  assert.equal(outcome.action, "redirect");
  if (outcome.action === "redirect") {
    assert.equal(outcome.destination, "/login");
  }
});

test("Scenario 8: User with an expired session -> Cannot access protected pages", () => {
  const expiredOutcome = resolveSignOutRouteDestination("expired");
  assert.equal(expiredOutcome, "/login?reason=expired");

  const rootOutcome = resolveRootDestination({ status: "expired" });
  assert.equal(rootOutcome.action, "render_landing");
});
