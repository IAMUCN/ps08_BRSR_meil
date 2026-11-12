import type { NavItem } from "@/components/shell/sidebar";

// The /admin sidebar (built pages only, .grill/phase-4-admin-foundation-decisions.md). A Super Admin sees
// all of it; an Administrator sees the pages that are about their own org units — group-wide configuration
// is `superOnly` (.grill/scoped-admin-onboarding-decisions.md). The list only decides what is offered: each
// page and procedure checks the caller itself.

type AdminNavItem = NavItem & { superOnly?: boolean };

const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard" },
  // Daily work: file evidence, then review and approve what comes in.
  { href: "/app/upload", label: "Upload", icon: "upload", startsGroup: true },
  { href: "/app/submissions", label: "My Submissions", icon: "submissions" },
  { href: "/app/activity", label: "My Activity", icon: "audit" },
  { href: "/admin/submissions", label: "Submission Monitoring", icon: "submissions" },
  { href: "/admin/validation-queue", label: "Validation Queue", icon: "validation" },
  { href: "/admin/approval-queue", label: "Approval Queue", icon: "approvals" },
  { href: "/admin/deadlines", label: "Reporting Deadlines", icon: "deadlines" },
  // The numbers: emissions by scope, exploring and looking ahead.
  { href: "/admin/scope-1", label: "Scope 1", icon: "scope1", startsGroup: true },
  { href: "/admin/scope-2", label: "Scope 2", icon: "scope2" },
  { href: "/admin/scope-3", label: "Scope 3", icon: "scope3" },
  { href: "/admin/data-explorer", label: "Data Explorer", icon: "explorer" },
  { href: "/admin/carbon-intelligence", label: "Carbon Intelligence", icon: "analytics" },
  {
    href: "/admin/decision-rules",
    label: "Decision Center & RAG",
    icon: "validation",
    superOnly: true,
  },
  // Output and oversight.
  { href: "/admin/reports", label: "Reports", icon: "reports", startsGroup: true },
  { href: "/admin/audit-trail", label: "Audit Trail", icon: "audit" },
  // Set up again each reporting cycle or financial year.
  {
    href: "/admin/reporting-periods",
    label: "Reporting Periods",
    icon: "periods",
    startsGroup: true,
    superOnly: true,
  },
  {
    href: "/admin/conversion-factors",
    label: "Conversion Factors",
    icon: "factors",
    superOnly: true,
  },
  { href: "/admin/disclosures", label: "BRSR Disclosures", icon: "reports", superOnly: true },
  // Configured once, rarely touched.
  { href: "/admin/organization", label: "Organization", icon: "organization", startsGroup: true },
  { href: "/admin/users", label: "Users", icon: "users" },
  // Landing-page demo requests (migration 0066, A55).
  { href: "/admin/demo-requests", label: "Demo Requests", icon: "users", superOnly: true },
  { href: "/admin/roles", label: "Roles & Permissions", icon: "roles", superOnly: true },
  { href: "/admin/brsr-mapping", label: "BRSR Mapping", icon: "brsr", superOnly: true },
  // Phase 10 (requirement 21): how EmeilSG works, for everyone.
  { href: "/app/help", label: "Help", icon: "help", startsGroup: true },
];

export function adminNavFor(session: { isAdmin: boolean }): NavItem[] {
  const items = ADMIN_NAV.filter((item) => session.isAdmin || !item.superOnly);
  // A group separator belongs to the first item of its group that is still shown.
  let pending = false;
  return ADMIN_NAV.flatMap((item) => {
    if (item.startsGroup) pending = true;
    if (!items.includes(item)) return [];
    const nav: NavItem = {
      href: item.href,
      label: item.label,
      icon: item.icon,
      startsGroup: pending || undefined,
    };
    pending = false;
    return [nav];
  });
}

// The /app sidebar for everyone who is not an administrator (built pages only), and the list the top-bar
// search offers as pages. An administrator keeps the /admin list in /app too.
const APP_NAV: NavItem[] = [
  { href: "/app", label: "Dashboard", icon: "dashboard" },
  { href: "/app/upload", label: "Upload", icon: "upload" },
  { href: "/app/submissions", label: "My Submissions", icon: "submissions" },
  { href: "/app/activity", label: "My Activity", icon: "audit" },
];
const HELP: NavItem = { href: "/app/help", label: "Help", icon: "help", startsGroup: true };

export function workspaceNavFor(session: {
  isAdmin: boolean;
  isOrgAdmin: boolean;
  permissions: string[];
}): NavItem[] {
  if (session.isAdmin || session.isOrgAdmin) return adminNavFor(session);
  const nav = [...APP_NAV];
  // A1: the Approvals item appears only for approvers (Corporate ESG/Sustainability).
  if (session.permissions.includes("approval.decide"))
    nav.push({ href: "/app/approvals", label: "Approvals", icon: "approvals" });
  // A20: bulk-import items appear only for whichever role(s) an Admin has granted the permission to.
  if (session.permissions.includes("user.bulk_import"))
    nav.push({ href: "/app/users/bulk-import", label: "Add Employees", icon: "users" });
  if (session.permissions.includes("org.bulk_import"))
    nav.push({ href: "/app/org-units/bulk-import", label: "Add Org Units", icon: "organization" });
  nav.push(HELP);
  return nav;
}
