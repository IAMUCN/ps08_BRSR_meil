import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceNavFor } from "../components/shell/admin-nav.ts";
import {
  canAdminister,
  canEditDisclosures,
  canEnterAdminWorkspace,
  canEnterFinancialInputs,
  canMonitor,
  canUseReports,
  canViewAudit,
} from "../lib/auth/workspace.ts";

// Who may open which part of /admin (role-wise dashboard, Phase 0; .grill/role-dashboard-decisions.md).
// The permission lists are the ones migrations 0009, 0048 and 0050 give the seeded roles.
const superAdmin = { isAdmin: true, isOrgAdmin: false, permissions: [] as string[] };
const administrator = {
  isAdmin: false,
  isOrgAdmin: true,
  permissions: ["monitoring.view", "approval.decide", "report.generate", "validation.review"],
};
const corporateEsg = {
  isAdmin: false,
  isOrgAdmin: false,
  permissions: [
    "approval.decide",
    "monitoring.view",
    "document.upload",
    "record.verify",
    "validation.review",
    "report.generate",
  ],
};
const projectManager = {
  isAdmin: false,
  isOrgAdmin: false,
  permissions: ["document.upload", "record.verify"],
};
const auditor = {
  isAdmin: false,
  isOrgAdmin: false,
  permissions: ["audit.view", "monitoring.view"],
};

test("a Super Admin reaches everything; the permission lists do not matter for them", () => {
  for (const rule of [canAdminister, canMonitor, canUseReports, canViewAudit]) {
    assert.equal(rule(superAdmin), true);
  }
  assert.equal(canEnterAdminWorkspace(superAdmin), true);
});

test("Corporate ESG monitors and reports but does not administer or read the audit trail", () => {
  assert.equal(canMonitor(corporateEsg), true);
  assert.equal(canUseReports(corporateEsg), true);
  assert.equal(canAdminister(corporateEsg), false);
  assert.equal(canViewAudit(corporateEsg), false);
  assert.equal(canEnterAdminWorkspace(corporateEsg), true);
});

test("a Project Manager has no page under /admin", () => {
  assert.equal(canMonitor(projectManager), false);
  assert.equal(canUseReports(projectManager), false);
  assert.equal(canEnterAdminWorkspace(projectManager), false);
});

test("an Auditor reads monitoring pages and the audit trail but cannot report or administer", () => {
  assert.equal(canMonitor(auditor), true);
  assert.equal(canViewAudit(auditor), true);
  assert.equal(canUseReports(auditor), false);
  assert.equal(canAdminister(auditor), false);
});

test("an Administrator who loses monitoring.view loses the monitoring pages, not the workspace", () => {
  const stripped = { ...administrator, permissions: ["approval.decide"] };
  assert.equal(canMonitor(stripped), false);
  assert.equal(canEnterAdminWorkspace(stripped), true);
});

test("Corporate ESG's sidebar offers the read pages and Reports, and nothing that is closed to it", () => {
  const hrefs = workspaceNavFor(corporateEsg).map((i) => i.href);
  for (const open of [
    "/admin/scope-1",
    "/admin/scope-2",
    "/admin/scope-3",
    "/admin/data-explorer",
    "/admin/submissions",
    "/admin/carbon-analytics",
    "/admin/reports",
    "/app/approvals",
  ]) {
    assert.ok(hrefs.includes(open), `${open} should be offered`);
  }
  for (const closed of [
    "/admin",
    "/admin/conversion-factors",
    "/admin/forecast",
    "/admin/simulator",
    "/admin/deadlines",
    "/admin/audit-trail",
    "/admin/ocr-monitoring",
    "/admin/users",
    "/admin/organization",
  ]) {
    assert.ok(!hrefs.includes(closed), `${closed} should not be offered`);
  }
});

test("a Project Manager's sidebar has none of the monitoring or reporting pages", () => {
  const hrefs = workspaceNavFor(projectManager).map((i) => i.href);
  assert.ok(!hrefs.some((h) => h.startsWith("/admin")));
});

test("the Super Admin and Administrator sidebars are unchanged by this", () => {
  const superHrefs = workspaceNavFor(superAdmin).map((i) => i.href);
  assert.ok(superHrefs.includes("/admin/conversion-factors"));
  const adminHrefs = workspaceNavFor(administrator).map((i) => i.href);
  assert.ok(adminHrefs.includes("/admin/users"));
  assert.ok(!adminHrefs.includes("/admin/conversion-factors"));
});

// Finance / CSR and HR type their own part of the BRSR answers (migration 0080).
const finance = {
  isAdmin: false,
  isOrgAdmin: false,
  permissions: [
    "document.upload",
    "record.verify",
    "disclosure.finance",
    "financial_inputs.manage",
  ],
};
const hr = {
  isAdmin: false,
  isOrgAdmin: false,
  permissions: ["document.upload", "record.verify", "disclosure.hr", "user.bulk_import"],
};

test("Finance enters the yearly inputs and finance answers, HR the workforce answers, nobody else", () => {
  assert.equal(canEnterFinancialInputs(finance), true);
  assert.equal(canEditDisclosures(finance), true);
  assert.equal(canEnterFinancialInputs(hr), false);
  assert.equal(canEditDisclosures(hr), true);
  for (const other of [projectManager, corporateEsg, auditor, administrator]) {
    assert.equal(canEditDisclosures(other), false);
    assert.equal(canEnterFinancialInputs(other), false);
  }
  assert.equal(canEditDisclosures(superAdmin), true);
  assert.equal(canEnterFinancialInputs(superAdmin), true);
});

test("Finance and HR reach the BRSR Disclosures page and nothing else under /admin", () => {
  for (const person of [finance, hr]) {
    assert.equal(canEnterAdminWorkspace(person), true);
    assert.equal(canMonitor(person), false);
    assert.equal(canUseReports(person), false);
    const hrefs = workspaceNavFor(person).map((i) => i.href);
    assert.ok(hrefs.includes("/admin/disclosures"));
    assert.ok(!hrefs.includes("/admin/reports"));
    assert.ok(!hrefs.includes("/admin/scope-1"));
    assert.ok(!hrefs.includes("/admin/conversion-factors"));
  }
});

test("the Assurance Reviewer is offered the monitoring pages and no editing page", () => {
  const hrefs = workspaceNavFor(auditor).map((i) => i.href);
  assert.ok(hrefs.includes("/admin/scope-1"));
  assert.ok(!hrefs.includes("/admin/disclosures"));
  assert.ok(!hrefs.includes("/admin/reports"));
  assert.ok(!hrefs.includes("/app/upload"));
});
