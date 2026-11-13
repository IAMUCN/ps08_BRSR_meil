import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { MFA_EMAIL_COOKIE, emailPassValid } from "@/lib/auth/mfa-email";
import { sessionIdFromAccessToken } from "@/lib/auth/session-cookie";
import { aalFromAccessToken, hasVerifiedTotp, mfaEnforced } from "@/lib/auth/mfa";
import { mustChangePassword } from "@/lib/auth/initial-password";
import { ADMIN_ROLE, ORG_ADMIN_ROLE } from "@/lib/auth/redirects";
import { currentSessionId, touchSession } from "@/lib/auth/session-limits";
import {
  canEditDisclosures,
  canEnterAdminWorkspace,
  canEnterFinancialInputs,
  canMonitor,
  canUseReports,
} from "@/lib/auth/workspace";
import { DEFAULT_THEME, isTheme, type ThemeId } from "@/lib/theme";

// Data Access Layer (Next.js 16 authentication guide): the authoritative per-request session check.
// proxy.ts only refreshes cookies and does optimistic redirects.

export type SessionAssignment = {
  orgUnitId: string;
  orgUnitName: string;
  orgUnitType: string;
  roleCode: string;
  roleName: string;
};

export type ActiveSession = {
  userId: string;
  email: string;
  displayName: string;
  theme: ThemeId;
  /** Super Admin: every org unit and the group-wide configuration. */
  isAdmin: boolean;
  /** Administrator of the org units in `adminOrgUnitIds` and everything beneath them. */
  isOrgAdmin: boolean;
  /** Where the Administrator role is held; empty for everyone else, the Super Admin included. */
  adminOrgUnitIds: string[];
  roleCodes: string[];
  permissions: string[];
  assignments: SessionAssignment[];
};

export type SessionResult =
  | { status: "anonymous" }
  // Signed in, but the sign-in ran past its idle or absolute time limit (migration 0052).
  | { status: "expired" }
  | { status: "deactivated" }
  | { status: "unprovisioned" }
  // Signed in with the emailed temporary password: nothing is open until they choose their own.
  | { status: "password_change_required"; email: string }
  // Password accepted; the six-digit code from the authenticator app is still to come.
  | { status: "mfa_required"; email: string }
  // No authenticator app yet and the platform requires one (on unless AUTH_MFA_REQUIRED=false).
  | { status: "mfa_enrollment_required"; email: string }
  | { status: "active"; session: ActiveSession };

/** Why a signed-in user is being turned away; mirrors the /auth/signout `reason` values. */
export type DeniedReason = "deactivated" | "unprovisioned";

type AssignmentRow = {
  org_unit_id: string;
  roles: { code: string; name: string } | null;
  org_units: { name: string; unit_type: string } | null;
};

type RolePermissionsRow = {
  code: string;
  role_permissions: { permissions: { code: string } | null }[];
};

/** Resolves the session for an already-created Supabase client (used right after sign-in too). */
export async function resolveSession(supabase: SupabaseClient): Promise<SessionResult> {
  // getUser() verifies the token with Supabase Auth, so banned/revoked users are rejected here.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "anonymous" };

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, display_name, email, is_active, theme")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return { status: "unprovisioned" };
  if (!profile.is_active) return { status: "deactivated" };
  // Every request is checked against the time limits. A request by itself is not activity: only what the
  // person does on the page moves the idle clock (lib/auth/session-actions.ts).
  const clock = await touchSession(await currentSessionId(supabase), user.id, false);
  if (clock.state !== "active") return { status: "expired" };
  if (mustChangePassword(user)) return { status: "password_change_required", email: profile.email };

  const hasTotp = hasVerifiedTotp(user.factors);
  if (hasTotp) {
    const {
      data: { session: authSession },
    } = await supabase.auth.getSession();
    if (aalFromAccessToken(authSession?.access_token) !== "aal2") {
      // "Try another way": a code emailed to the account passed for this very sign-in.
      const sessionId = sessionIdFromAccessToken(authSession?.access_token);
      const pass = (await cookies()).get(MFA_EMAIL_COOKIE)?.value;
      if (!sessionId || !emailPassValid(pass, user.id, sessionId)) {
        return { status: "mfa_required", email: profile.email };
      }
    }
  } else if (mfaEnforced()) {
    return { status: "mfa_enrollment_required", email: profile.email };
  }

  const { data: assignmentRows, error: assignmentError } = await supabase
    .from("user_org_assignments")
    .select("org_unit_id, roles(code, name), org_units(name, unit_type)")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .overrideTypes<AssignmentRow[], { merge: false }>();
  if (assignmentError) throw assignmentError;

  const assignments: SessionAssignment[] = (assignmentRows ?? []).flatMap((row) =>
    row.roles && row.org_units
      ? [
          {
            orgUnitId: row.org_unit_id,
            orgUnitName: row.org_units.name,
            orgUnitType: row.org_units.unit_type,
            roleCode: row.roles.code,
            roleName: row.roles.name,
          },
        ]
      : [],
  );
  const roleCodes = [...new Set(assignments.map((a) => a.roleCode))];

  let permissions: string[] = [];
  if (roleCodes.length > 0) {
    const { data: roleRows, error: permissionError } = await supabase
      .from("roles")
      .select("code, role_permissions(permissions(code))")
      .in("code", roleCodes)
      .overrideTypes<RolePermissionsRow[], { merge: false }>();
    if (permissionError) throw permissionError;
    permissions = [
      ...new Set(
        (roleRows ?? []).flatMap((role) =>
          role.role_permissions.flatMap((rp) => (rp.permissions ? [rp.permissions.code] : [])),
        ),
      ),
    ].sort();
  }

  return {
    status: "active",
    session: {
      userId: profile.id,
      email: profile.email,
      displayName: profile.display_name,
      theme: isTheme(profile.theme) ? profile.theme : DEFAULT_THEME,
      isAdmin: roleCodes.includes(ADMIN_ROLE),
      isOrgAdmin: roleCodes.includes(ORG_ADMIN_ROLE),
      adminOrgUnitIds: assignments
        .filter((a) => a.roleCode === ORG_ADMIN_ROLE)
        .map((a) => a.orgUnitId),
      roleCodes,
      permissions,
      assignments,
    },
  };
}

/** Per-request memoized session lookup for Server Components, layouts and the tRPC context. */
export const getSessionContext = cache(async (): Promise<SessionResult> => {
  const supabase = await createSupabaseServerClient();
  return resolveSession(supabase);
});

/** Active session or redirect: anonymous → /login; expired, deactivated or unprovisioned → forced sign-out. */
export async function requireActiveSession(): Promise<ActiveSession> {
  const result = await getSessionContext();
  if (result.status === "anonymous") redirect("/login");
  // A Server Component cannot clear cookies: the sign-out route ends the sign-in and shows the reason.
  if (result.status === "expired") redirect("/auth/signout?reason=expired");
  if (
    result.status === "password_change_required" ||
    result.status === "mfa_required" ||
    result.status === "mfa_enrollment_required"
  ) {
    redirect("/login");
  }
  if (result.status !== "active") redirect(`/auth/signout?reason=${result.status}`);
  return result.session;
}

/**
 * The /admin area: a Super Admin or an Administrator. Each page built on this must keep what it shows
 * inside the caller's org scope (lib/auth/scope.ts). §4.4: anyone else goes to their own dashboard.
 */
export async function requireAdminAreaSession(): Promise<ActiveSession> {
  const session = await requireActiveSession();
  if (!session.isAdmin && !session.isOrgAdmin) redirect("/app?notice=forbidden");
  return session;
}

/**
 * The /admin layout: anyone with at least one page under /admin (an administrator, or a holder of
 * monitoring.view or report.generate). Every page still guards itself — this only lets them through the door.
 */
export async function requireAdminWorkspaceSession(): Promise<ActiveSession> {
  const session = await requireActiveSession();
  if (!canEnterAdminWorkspace(session)) redirect("/app?notice=forbidden");
  return session;
}

/** The read-only monitoring pages (Scope 1/2/3, Data Explorer, Submission Monitoring, Carbon Analytics). */
export async function requireMonitoringSession(): Promise<ActiveSession> {
  const session = await requireActiveSession();
  if (!canMonitor(session)) redirect("/app?notice=forbidden");
  return session;
}

/** The Reports pages: anyone holding report.generate. */
export async function requireReportsSession(): Promise<ActiveSession> {
  const session = await requireActiveSession();
  if (!canUseReports(session)) redirect("/app?notice=forbidden");
  return session;
}

/** BRSR Disclosures: a Super Admin, or someone who may type finance or HR answers or the yearly inputs. */
export async function requireDisclosureSession(): Promise<ActiveSession> {
  const session = await requireActiveSession();
  if (!canEditDisclosures(session) && !canEnterFinancialInputs(session)) {
    redirect("/app?notice=forbidden");
  }
  return session;
}

/** Group-wide configuration pages: Super Admin only. An Administrator is sent back to their dashboard. */
export async function requireAdminSession(): Promise<ActiveSession> {
  const session = await requireAdminAreaSession();
  if (!session.isAdmin) redirect("/admin?notice=forbidden");
  return session;
}

/** /app is open to every active user; an administrator uploads and verifies there too. */
export async function requireAppSession(): Promise<ActiveSession> {
  return requireActiveSession();
}
