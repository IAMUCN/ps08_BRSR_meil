import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mustChangePassword } from "@/lib/auth/initial-password";
import { ADMIN_ROLE } from "@/lib/auth/redirects";
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
  isAdmin: boolean;
  roleCodes: string[];
  permissions: string[];
  assignments: SessionAssignment[];
};

export type SessionResult =
  | { status: "anonymous" }
  | { status: "deactivated" }
  | { status: "unprovisioned" }
  // Signed in with the emailed temporary password: nothing is open until they choose their own.
  | { status: "password_change_required"; email: string }
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
  if (mustChangePassword(user)) return { status: "password_change_required", email: profile.email };

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

/** Active session or redirect: anonymous → /login; deactivated/unprovisioned → forced sign-out. */
export async function requireActiveSession(): Promise<ActiveSession> {
  const result = await getSessionContext();
  if (result.status === "anonymous") redirect("/login");
  if (result.status === "password_change_required") redirect("/login");
  if (result.status !== "active") redirect(`/auth/signout?reason=${result.status}`);
  return result.session;
}

/** §4.4: non-admins reaching /admin are sent to their own dashboard with a notice. */
export async function requireAdminSession(): Promise<ActiveSession> {
  const session = await requireActiveSession();
  if (!session.isAdmin) redirect("/app?notice=forbidden");
  return session;
}

/** /app is for non-admin roles; an Admin with no other role is sent to /admin. */
export async function requireAppSession(): Promise<ActiveSession> {
  const session = await requireActiveSession();
  const hasNonAdminRole = session.roleCodes.some((code) => code !== ADMIN_ROLE);
  if (session.isAdmin && !hasNonAdminRole) redirect("/admin?notice=forbidden");
  return session;
}
