// What a permission is called on screen (feature_enhancement.md requirement 13; names approved by the owner
// on 2026-11-07, .grill/feature-enhancement-roadmap-decisions.md). The codes stay as they are in the
// database, the procedures and the audit trail; only Roles & Permissions shows these names instead.

export const PERMISSION_LABELS: Readonly<Record<string, string>> = {
  "approval.decide": "Approve or return submissions",
  "audit.view": "View the audit trail",
  "brsr_mapping.manage": "Manage BRSR mapping",
  "carbon_credit.manage": "Manage carbon credits",
  "carbon_credit.view": "View carbon credits",
  "chat.use": "Use Tracey, the ESG data analyst",
  "document.upload": "Upload documents",
  "factor.manage": "Manage conversion factors",
  "icp.manage": "Manage internal carbon pricing",
  "monitoring.view": "View submission monitoring",
  "org.bulk_import": "Import organization units from a spreadsheet",
  "org.manage": "Manage the organization structure",
  "period.manage": "Manage reporting periods",
  "record.verify": "Check and confirm extracted values",
  "report.generate": "Generate reports",
  "role.manage": "Manage roles and permissions",
  "settings.manage": "Change platform settings",
  "user.bulk_import": "Import users from a spreadsheet",
  "user.manage": "Manage users",
  "validation.review": "Review flagged submissions",
};

/**
 * The name for a code. A permission added later without a name here still gets a readable one, built from
 * its code ("report.export" → "Report export"), never the raw code.
 */
export function permissionLabel(code: string): string {
  const known = PERMISSION_LABELS[code];
  if (known) return known;
  const words = code.replace(/[._]+/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : code;
}
