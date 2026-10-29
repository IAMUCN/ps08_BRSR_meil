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
  { href: "/app/submissions", label: "My Uploads", icon: "submissions" },
  { href: "/admin/submissions", label: "Submission Monitoring", icon: "submissions" },
  { href: "/admin/ocr-monitoring", label: "OCR Monitoring", icon: "ocr", superOnly: true },
  { href: "/admin/validation-queue", label: "Validation Queue", icon: "validation" },
  { href: "/admin/approval-queue", label: "Approval Queue", icon: "approvals" },
  { href: "/admin/deadlines", label: "Reporting Deadlines", icon: "deadlines", superOnly: true },
  // The numbers: emissions by scope, exploring and looking ahead.
  { href: "/admin/scope-1", label: "Scope 1", icon: "scope1", startsGroup: true },
  { href: "/admin/scope-2", label: "Scope 2", icon: "scope2" },
  { href: "/admin/scope-3", label: "Scope 3", icon: "scope3" },
  { href: "/admin/data-explorer", label: "Data Explorer", icon: "explorer" },
  { href: "/admin/forecast", label: "Emissions Forecast", icon: "forecast", superOnly: true },
  { href: "/admin/simulator", label: "Reduction Simulator", icon: "simulator", superOnly: true },
  // Output and oversight.
  { href: "/admin/reports", label: "Reports", icon: "reports", startsGroup: true },
  { href: "/admin/audit-trail", label: "Audit Trail", icon: "audit", superOnly: true },
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
  { href: "/admin/roles", label: "Roles & Permissions", icon: "roles", superOnly: true },
  { href: "/admin/brsr-mapping", label: "BRSR Mapping", icon: "brsr", superOnly: true },
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
