// Who may open which part of the /admin workspace (role-wise dashboard, .grill/role-dashboard-decisions.md).
// Pure, so the rules are unit-tested; lib/auth/session.ts turns them into redirects and the procedures in
// lib/trpc/init.ts enforce the same rules on the server. Permissions are data (Roles & Permissions), so
// these test permission codes, never role names.

type Who = { isAdmin: boolean; isOrgAdmin: boolean; permissions: readonly string[] };

/** Super Admin or Administrator: the people who may also change things on the monitoring pages. */
export const canAdminister = (s: Pick<Who, "isAdmin" | "isOrgAdmin">) => s.isAdmin || s.isOrgAdmin;

/** The read-only monitoring pages: Scope 1/2/3, Data Explorer, Submission Monitoring, Carbon Analytics. */
export const canMonitor = (s: Pick<Who, "isAdmin" | "permissions">) =>
  s.isAdmin || s.permissions.includes("monitoring.view");

/** The Reports pages (the evidence-bundle download stays in the admin area). */
export const canUseReports = (s: Pick<Who, "isAdmin" | "permissions">) =>
  s.isAdmin || s.permissions.includes("report.generate");

/** The audit trail and a record's audit history. */
export const canViewAudit = (s: Pick<Who, "isAdmin" | "permissions">) =>
  s.isAdmin || s.permissions.includes("audit.view");

/** Anyone who has at least one page under /admin to open; everyone else lives in /app. */
export const canEnterAdminWorkspace = (s: Who) =>
  canAdminister(s) || canMonitor(s) || canUseReports(s);
