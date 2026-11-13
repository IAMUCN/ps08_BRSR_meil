"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BookOpen,
  Users,
  ShieldCheck,
  Cpu,
  Mail,
  Building2,
  Lock,
  Sparkles,
  ArrowRight,
  CornerDownRight,
} from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";
import pkg from "@/package.json";
import { ENGINE_VERSION } from "@/lib/calculation/version";

type DocTab = "getting-started" | "roles" | "checkpoints" | "technical";

interface TabItem {
  id: DocTab;
  label: string;
  icon: typeof BookOpen;
  description: string;
}

const TABS: TabItem[] = [
  {
    id: "getting-started",
    label: "Getting started",
    icon: BookOpen,
    description: "From the invitation email to your first verified upload",
  },
  {
    id: "roles",
    label: "Roles & Organization",
    icon: Users,
    description: "MEIL hierarchy, role matrix, and dual-area navigation",
  },
  {
    id: "checkpoints",
    label: "Checkpoints & Workflow",
    icon: ShieldCheck,
    description: "The 8-step pipeline, 6 checkpoints, and verification outcomes",
  },
  {
    id: "technical",
    label: "Technical & Troubleshooting",
    icon: Cpu,
    description: "Architecture, stack, Docker reader, and troubleshooting guide",
  },
];

export function DocumentationSection() {
  const [activeTab, setActiveTab] = useState<DocTab>("getting-started");

  return (
    <section
      id="documentation"
      aria-label="Documentation and user manual"
      className="scroll-mt-20 border-t border-slate-200/70 bg-slate-50/50 px-4 py-20 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="User Manual & Architecture"
          title="EmeilSG: Workflow & System Architecture"
        >
          Comprehensive documentation for contributors, reviewers, and administrators. Built on an
          evidence-first foundation where every reported number traces back to its source bill.
        </SectionHeading>

        {/* Four Golden Rules Banner */}
        <div className="mx-auto mb-10 max-w-5xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#313490]">
            <Sparkles className="h-4 w-4" />
            <span>Four Immutable Product Rules</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
              <strong className="block text-xs font-bold text-slate-900">1. Evidence First</strong>
              <p className="mt-1 text-xs text-slate-600">
                Users upload real documents; they never type raw metrics into open forms.
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
              <strong className="block text-xs font-bold text-slate-900">
                2. OCR Assists, Person Decides
              </strong>
              <p className="mt-1 text-xs text-slate-600">
                Every extracted field has a confidence score and must be reviewed before it counts.
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
              <strong className="block text-xs font-bold text-slate-900">
                3. Deterministic Calculations
              </strong>
              <p className="mt-1 text-xs text-slate-600">
                The same record and factor version always give the exact same output with trace
                stored.
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
              <strong className="block text-xs font-bold text-slate-900">
                4. Nothing Is Hard-coded
              </strong>
              <p className="mt-1 text-xs text-slate-600">
                Emission factors, activities, BRSR mappings, and hierarchy levels are configurable.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation Pill */}
        <div className="mx-auto mb-10 max-w-4xl">
          <div
            role="tablist"
            aria-label="Documentation sections"
            className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xs sm:flex-nowrap"
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-selected={isActive}
                  aria-controls={`panel-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold transition-all sm:text-sm ${
                    isActive
                      ? "text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeDocTab"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      className="absolute inset-0 rounded-xl bg-[#313490]"
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{tab.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content Panels */}
        <div className="mx-auto max-w-5xl">
          <AnimatePresence mode="wait">
            {activeTab === "getting-started" && <GettingStartedTab key="getting-started" />}
            {activeTab === "roles" && <RolesTab key="roles" />}
            {activeTab === "checkpoints" && <CheckpointsTab key="checkpoints" />}
            {activeTab === "technical" && <TechnicalTab key="technical" />}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* TAB 1: GETTING STARTED                                                     */
/* -------------------------------------------------------------------------- */
function GettingStartedTab() {
  const CONTRIBUTOR_SCREENS = [
    {
      name: "Dashboard",
      path: "/app",
      use: "See documents to verify, items returned for correction, and project totals by scope",
    },
    {
      name: "Upload",
      path: "/app/upload",
      use: "File a single document or confirm the split of a multi-bill PDF",
    },
    {
      name: "My Submissions",
      path: "/app/submissions",
      use: "Track every record by status and reopen returned ones",
    },
    {
      name: "My Activity",
      path: "/app/activity",
      use: "See immutable audit entries for your own user actions",
    },
    {
      name: "Approvals",
      path: "/app/approvals",
      use: "Approve or return records within your scope (approver roles only)",
    },
    {
      name: "Bulk Import",
      path: "/app/users/bulk-import",
      use: "Bulk-import staff from spreadsheets (roles granted permission)",
    },
    {
      name: "Notifications",
      path: "/app/notifications",
      use: "Real-time updates on OCR results, returns, approvals, and reminders",
    },
    {
      name: "Help",
      path: "/app/help",
      use: "Live description of your assigned role, current limits, and active hierarchy",
    },
  ];

  return (
    <motion.div
      id="panel-getting-started"
      role="tabpanel"
      aria-labelledby="tab-getting-started"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25 }}
      className="space-y-8"
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <div className="mb-6 flex flex-col gap-2 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-xl font-bold text-slate-900">
              Onboarding & Using the System
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              There is no self sign-up. Every account is provisioned by an administrator.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <Lock className="h-3.5 w-3.5" />
            Zero Public Sign-up
          </span>
        </div>

        {/* Dual Onboarding Columns */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Contributor Path */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#313490]/10 text-[#313490]">
                <Mail className="h-5 w-5" />
              </span>
              <div>
                <h4 className="font-semibold text-slate-900">6.1 New Contributor (Invited)</h4>
                <p className="text-xs text-slate-500">How to activate and submit evidence</p>
              </div>
            </div>
            <ol className="space-y-3 text-xs leading-relaxed text-slate-700">
              <li className="flex gap-2">
                <span className="font-bold text-[#313490]">1.</span>
                <span>
                  <strong>Open invitation:</strong> Follow the link in your email. It works once and
                  is valid for 24 hours (ask an admin to resend if expired).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-[#313490]">2.</span>
                <span>
                  <strong>Set password:</strong> At least 12 characters with an uppercase letter,
                  lowercase letter, number, and special character.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-[#313490]">3.</span>
                <span>
                  <strong>Sign in:</strong> Sign in at{" "}
                  <code className="rounded bg-slate-200 px-1 py-0.5 text-[11px]">/login</code> to
                  land on your workspace dashboard at{" "}
                  <code className="rounded bg-slate-200 px-1 py-0.5 text-[11px]">/app</code>.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-[#313490]">4.</span>
                <span>
                  <strong>Check Help:</strong> Open Help in the sidebar to review your active role
                  boundaries, assigned projects, and operational limits.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-[#313490]">5.</span>
                <span>
                  <strong>First upload:</strong> Go to{" "}
                  <code className="rounded bg-slate-200 px-1 py-0.5 text-[11px]">/app/upload</code>{" "}
                  and drag your invoice or meter certificate.
                </span>
              </li>
            </ol>
            <div className="mt-4 rounded-lg bg-slate-100 p-2.5 text-[11px] text-slate-600">
              Forgot password? Use <em>Forgot password</em> on the login screen; a 6-digit code is
              emailed and valid for 10 minutes.
            </div>
          </div>

          {/* Administrator Setup Path */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E91029]/10 text-[#E91029]">
                <Building2 className="h-5 w-5" />
              </span>
              <div>
                <h4 className="font-semibold text-slate-900">6.2 New Administrator (Setup)</h4>
                <p className="text-xs text-slate-500">Execute once in this sequence from /admin</p>
              </div>
            </div>
            <ol className="space-y-3 text-xs leading-relaxed text-slate-700">
              <li className="flex gap-2">
                <span className="font-bold text-[#E91029]">1.</span>
                <span>
                  <strong>Organization:</strong> Build the hierarchy (Group, Subsidiaries, Projects,
                  Sites) or bulk-import. Check expected submissions.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-[#E91029]">2.</span>
                <span>
                  <strong>Users:</strong> Invite people and assign each a role at an org unit, or
                  bulk-import from the employee sheet.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-[#E91029]">3.</span>
                <span>
                  <strong>Roles & Permissions:</strong> Adjust what each role may do if default
                  access policies require tuning <em>(Super Admin)</em>.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-[#E91029]">4.</span>
                <span>
                  <strong>Reporting Periods:</strong> Open an active period. Uploads are strictly
                  blocked when no period is open <em>(Super Admin)</em>.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-[#E91029]">5.</span>
                <span>
                  <strong>Conversion Factors:</strong> Enter factors with source citations. Records
                  show &ldquo;Not calculated yet&rdquo; until factors exist <em>(Super Admin)</em>.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-[#E91029]">6.</span>
                <span>
                  <strong>BRSR Disclosures:</strong> Type written answers for the year; numeric
                  indicators roll up automatically <em>(Super Admin)</em>.
                </span>
              </li>
            </ol>
          </div>
        </div>

        {/* 7.1 Upload & Verify Walkthrough */}
        <div className="mt-8 border-t border-slate-100 pt-6">
          <h4 className="mb-4 text-base font-bold text-slate-900">
            7.1 Contributor Walkthrough: Upload to Verification
          </h4>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 font-semibold text-[#313490]">Filing a Document</div>
              <ul className="space-y-2 text-xs leading-relaxed text-slate-600">
                <li>
                  • <strong>Step 1:</strong> Select reporting period, project/site, and activity.
                  Only activities your role owns are offered.
                </li>
                <li>
                  • <strong>Step 2:</strong> Choose <em>Single document</em> or{" "}
                  <em>A PDF with several bills</em>. Drop PDF/JPG/PNG (up to 50 MB) or snap a photo
                  on phone.
                </li>
                <li>
                  • <strong>Step 3:</strong> Optional description. Missing submissions panel shows
                  which expected filings for your unit remain unsubmitted.
                </li>
                <li>
                  • <strong>Step 4:</strong> Duplicate check: if the app detects an identical file
                  or same period record, acknowledge to proceed.
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 font-semibold text-[#313490]">Verifying the Extraction</div>
              <ul className="space-y-2 text-xs leading-relaxed text-slate-600">
                <li>
                  • <strong>Step 1:</strong> Open record from My Submissions or notification.
                  Document appears side by side with extracted values.
                </li>
                <li>
                  • <strong>Step 2:</strong> Click value to edit; press{" "}
                  <kbd className="rounded bg-slate-100 px-1 py-0.5 text-[10px]">Enter</kbd> to save,{" "}
                  <kbd className="rounded bg-slate-100 px-1 py-0.5 text-[10px]">Esc</kbd> to cancel.
                  Eye button highlights where text was found.
                </li>
                <li>
                  • <strong>Step 3:</strong> Red fields are below confidence threshold (&lt;80 by
                  default): edit them or mark <em>Looks correct</em>.
                </li>
                <li>
                  • <strong>Step 4:</strong> Press <em>Confirm</em>. If disabled, hover reason is
                  displayed. Press <em>Reject</em> with reason to discard.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Contributor Screens Table */}
        <div className="mt-8 border-t border-slate-100 pt-6">
          <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-700">
            Contributor Workspace Screens (/app)
          </h4>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 font-semibold text-slate-700">
                <tr>
                  <th className="px-4 py-2.5">Screen</th>
                  <th className="px-4 py-2.5">Path</th>
                  <th className="px-4 py-2.5">Use it to</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {CONTRIBUTOR_SCREENS.map((s) => (
                  <tr key={s.name} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{s.name}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{s.path}</td>
                    <td className="px-4 py-2.5">{s.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* TAB 2: ROLES & ORGANIZATION                                                */
/* -------------------------------------------------------------------------- */
function RolesTab() {
  const PROJECTS = [
    {
      name: "MSRTC e-bus order",
      under: "Olectra Greentech",
      what: "Electric bus supply to Maharashtra state transport",
      roles: "Project Manager, EHS, HR, Procurement, Finance / CSR, Employee",
    },
    {
      name: "BEST Mumbai e-buses",
      under: "Olectra Greentech",
      what: "Electric buses for Mumbai BEST undertaking",
      roles: "Project Manager, EHS, HR, Procurement, Finance / CSR, Employee",
    },
    {
      name: "Seetharampur plant, Telangana",
      under: "Olectra Greentech",
      what: "Manufacturing plant facility",
      roles: "Project Manager, EHS, HR, Procurement, Finance / CSR, Employee",
    },
    {
      name: "TGSRTC Telangana",
      under: "EVEY (shared with Olectra)",
      what: "Electric buses for Telangana state transport",
      roles: "Project Manager, Employee",
    },
  ];

  const ROLES_FULL = [
    {
      role: "Super Admin (max 2)",
      area: "/admin",
      badge: "Admin",
      desc: "Group-wide configuration: periods, factors, roles, BRSR mappings, disclosures; sees every org unit.",
    },
    {
      role: "Administrator",
      area: "/admin",
      badge: "Admin",
      desc: "Runs assigned org unit and everything beneath it: people, queues, reports, expected submissions.",
    },
    {
      role: "Project Manager",
      area: "/app",
      badge: "Workspace",
      desc: "Uploads and verifies fuel (Scope 1) and electricity bills (Scope 2) for their project.",
    },
    {
      role: "EHS / Environment",
      area: "/app",
      badge: "Workspace",
      desc: "Water withdrawals/discharges, waste certificates, refrigerants, air emissions, safety incidents.",
    },
    {
      role: "HR",
      area: "/app",
      badge: "Workspace",
      desc: "Workforce headcount statements by gender, training records; can bulk-import employees.",
    },
    {
      role: "Procurement",
      area: "/app",
      badge: "Workspace",
      desc: "Supplier spend statements and MSME sourcing shares.",
    },
    {
      role: "Finance / CSR",
      area: "/app",
      badge: "Workspace",
      desc: "CSR expenditure receipts, fines/penalties, and business travel tickets.",
    },
    {
      role: "Corporate ESG / Sustainability",
      area: "/app & /admin",
      badge: "Governance",
      desc: "Reviews flagged values, conducts secondary approvals, generates consolidated BRSR reports.",
    },
    {
      role: "Employee",
      area: "/app",
      badge: "Workspace",
      desc: "Uploads bills on behalf of another role (e.g. for a Project Manager to verify).",
    },
  ];

  const ADMIN_SCREENS = [
    {
      name: "Dashboard (Control Tower)",
      use: "Completion by stage, Scope 1/2/3 coverage, BRSR readiness, issue panel",
      superOnly: false,
    },
    {
      name: "Submission Monitoring",
      use: "Track every record and OCR job; retry failed OCR; export CSV; nudge missing units",
      superOnly: false,
    },
    {
      name: "Validation Queue",
      use: "Accept or return flagged records (duplicates, anomalies, late uploads)",
      superOnly: false,
    },
    {
      name: "Approval Queue",
      use: "Approve or return validated records with bill preview and calculation trace",
      superOnly: false,
    },
    {
      name: "Reporting Deadlines",
      use: "Set due dates, late-upload thresholds, and reminder schedules",
      superOnly: false,
    },
    {
      name: "Scope 1 / Scope 2 / Scope 3",
      use: "Drill totals from group to unit to record to source document",
      superOnly: false,
    },
    {
      name: "Data Explorer",
      use: "Search and filter all historical records with their calculated values",
      superOnly: false,
    },
    {
      name: "Carbon Analytics",
      use: "Year-on-year emissions comparison, suggested reduction actions, and threshold alerts",
      superOnly: false,
    },
    {
      name: "Forecast & Simulator",
      use: "Explore what-if emission reduction scenarios (never counted as official data)",
      superOnly: true,
    },
    {
      name: "Reports",
      use: "Generate, forward, verify and download PDF reports and Audit Evidence Bundles",
      superOnly: false,
    },
    {
      name: "Audit Trail",
      use: "Search who did what and when, with immutable before-and-after values",
      superOnly: false,
    },
    {
      name: "Reporting Periods",
      use: "Create, open, close and reopen reporting periods",
      superOnly: true,
    },
    {
      name: "Conversion Factors",
      use: "Enter factor versions with source citations; approve drafts; yearly review",
      superOnly: true,
    },
    {
      name: "BRSR Disclosures",
      use: "Type written qualitative answers to the 146 BRSR questions",
      superOnly: true,
    },
    {
      name: "Organization",
      use: "Build the hierarchy, share a unit between parents, set expected submissions",
      superOnly: false,
    },
    {
      name: "Users",
      use: "Invite, resend or revoke invitations, assign roles, deactivate accounts",
      superOnly: false,
    },
    {
      name: "Roles & Permissions",
      use: "Edit roles and assign granular permissions",
      superOnly: true,
    },
    {
      name: "BRSR Mapping",
      use: "Map metrics to SEBI indicators and check readiness completeness",
      superOnly: true,
    },
    {
      name: "Demo Requests",
      use: "Read demo requests submitted through the public landing page",
      superOnly: true,
    },
  ];

  return (
    <motion.div
      id="panel-roles"
      role="tabpanel"
      aria-labelledby="tab-roles"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25 }}
      className="space-y-8"
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <div className="mb-6 border-b border-slate-100 pb-5">
          <h3 className="font-display text-xl font-bold text-slate-900">
            2. The Organisation Tree & Projects
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Megha Engineering & Infrastructures Ltd (MEIL) groups operations across five sectors:
            irrigation, transport, power & energy, manufacturing, and hydrocarbons. EmeilSG mirrors
            this structure as a configurable hierarchy tree.
          </p>
        </div>

        {/* Tree Diagram Visualizer */}
        <div className="mb-8 rounded-xl border border-slate-200 bg-slate-50/70 p-5">
          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-600">
            Demonstration Hierarchy Structure (1 Group &bull; 6 Subsidiaries &bull; 6 Projects)
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-lg border-2 border-[#313490] bg-white px-4 py-2.5 text-center shadow-xs">
              <span className="text-[10px] font-bold uppercase text-[#313490]">Root Group</span>
              <div className="text-sm font-bold text-slate-900">MEIL Group</div>
            </div>
            <ArrowRight className="hidden h-5 w-5 text-slate-400 sm:block" />
            <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold text-slate-800">
                Olectra Greentech
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold text-slate-800">
                EVEY Trans
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold text-slate-800">
                Megha Gas
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold text-slate-800">
                Drillmec
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold text-slate-800">
                Petreven
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold text-slate-800">
                ICOMM
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            Units currently filing evidence: <strong>MSRTC e-bus order</strong>,{" "}
            <strong>BEST Mumbai e-buses</strong>, <strong>Seetharampur plant</strong>, and{" "}
            <strong>TGSRTC Telangana</strong> (shared under EVEY and Olectra).
          </p>
        </div>

        {/* Projects Table */}
        <div className="mb-8 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 font-semibold text-slate-700">
              <tr>
                <th className="px-4 py-2.5">Project</th>
                <th className="px-4 py-2.5">Parent Unit</th>
                <th className="px-4 py-2.5">What it is</th>
                <th className="px-4 py-2.5">Roles filing for it</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PROJECTS.map((p) => (
                <tr key={p.name} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-bold text-slate-900">{p.name}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-700">{p.under}</td>
                  <td className="px-4 py-2.5">{p.what}</td>
                  <td className="px-4 py-2.5 text-slate-500">{p.roles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Roles Table */}
        <div className="mb-8 border-t border-slate-100 pt-6">
          <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-700">
            Who Uses It: Role Directory
          </h4>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 font-semibold text-slate-700">
                <tr>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Area</th>
                  <th className="px-4 py-2.5">Responsibilities & What they do</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ROLES_FULL.map((r) => (
                  <tr key={r.role} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-bold text-slate-900">{r.role}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{r.area}</td>
                    <td className="px-4 py-2.5">{r.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Administrator Screens */}
        <div className="border-t border-slate-100 pt-6">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              7.2 Administrator Screens Reference (/admin)
            </h4>
            <span className="text-[11px] font-semibold text-purple-700">★ = Super Admin only</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {ADMIN_SCREENS.map((s) => (
              <div
                key={s.name}
                className="flex items-start justify-between rounded-lg border border-slate-200 bg-slate-50/40 p-2.5 text-xs"
              >
                <div>
                  <div className="font-semibold text-slate-900">
                    {s.name} {s.superOnly && <span className="text-purple-600">★</span>}
                  </div>
                  <div className="mt-0.5 text-slate-500">{s.use}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* TAB 3: CHECKPOINTS & WORKFLOW                                              */
/* -------------------------------------------------------------------------- */
function CheckpointsTab() {
  const WORKFLOW_STEPS = [
    {
      num: "1",
      title: "Upload",
      desc: "Select period, org unit, activity; drop PDF/JPG/PNG. Server fingerprints with SHA-256 and alerts on duplicates.",
    },
    {
      num: "2",
      title: "OCR reads it",
      desc: "Worker reads each page (~10s/page), extracting fields with confidence scores. Missing fields are left blank, never guessed.",
    },
    {
      num: "3",
      title: "Verify",
      desc: "Side-by-side inspection. Confirm stays disabled until every low-confidence field (<80) and required field is confirmed.",
    },
    {
      num: "4",
      title: "Validate",
      desc: "6 automated checks run in 1 transaction: format, org scope, evidence, units/ranges, duplicate bill, and anomaly history check.",
    },
    {
      num: "5",
      title: "Calculate",
      desc: "Verified value normalized to standard unit and multiplied by the active factor version. Calculation trace is immutably stored.",
    },
    {
      num: "6",
      title: "Approve",
      desc: "An authorized reviewer approves or returns with comment. Submitters can never approve their own entries.",
    },
    {
      num: "7",
      title: "Consolidate",
      desc: "Approved records roll up through the org tree to feed BRSR indicators. Percentages are re-derived from summed counts.",
    },
    {
      num: "8",
      title: "Report",
      desc: "Generate report for unit and period/year, render to PDF, forward for higher review, or export Audit Evidence Bundle.",
    },
  ];

  const CHECKPOINTS_TABLE = [
    {
      num: "1",
      name: "At upload",
      checked: "File type, size, readability, identical file duplicate detection",
      by: "The portal",
    },
    {
      num: "2",
      name: "After reading",
      checked: "Confidence score for every value; low (<80) or missing values flagged",
      by: "The document reader",
    },
    {
      num: "3",
      name: "Verification",
      checked: "Each marked value compared against the high-res bill source",
      by: "The person who uploaded",
    },
    {
      num: "4",
      name: "Validation",
      checked: "Units, dates, duplicate bills, and values far from site's own history",
      by: "The portal, then Administrator for flags",
    },
    {
      num: "5",
      name: "Approval",
      checked: "The record and its deterministic mathematical trace",
      by: "A different person (Approver)",
    },
    {
      num: "6",
      name: "Report verification",
      checked: "The finished disclosure and consolidated audit trail",
      by: "The Administrators of the level above",
    },
  ];

  const OUTCOMES = [
    { outcome: "Validated", means: "All checks passed cleanly", next: "Approver signs off" },
    {
      outcome: "Flagged",
      means: "Unusual: duplicate file/bill, late upload, historical anomaly",
      next: "Admin accepts or returns in Validation Queue",
    },
    {
      outcome: "Failed",
      means: "Hard rule violated (wrong unit, negative/zero quantity)",
      next: "Submitter corrects on Verify screen",
    },
    {
      outcome: "Not calculated yet",
      means: "No conversion factor version covers that period",
      next: "Super Admin enters factor, runs calculation",
    },
    {
      outcome: "Returned",
      means: "Approver sent it back with a specific comment",
      next: "Submitter reviews reason and resubmits",
    },
    {
      outcome: "Rejected",
      means: "Submitter or approver discarded; original file kept in audit",
      next: "Nobody (archived)",
    },
  ];

  const SPECIAL_PATHS = [
    {
      title: "Multi-bill PDF",
      desc: "Upload multi-invoice files up to 20 pages. OCR proposes page splits; you verify splits, and each bill creates its own distinct record.",
    },
    {
      title: "OCR Fallback",
      desc: "If a scan is unreadable, re-upload a clearer copy or input values by hand with a mandatory written justification. Manual inputs are always flagged for review.",
    },
    {
      title: "Uploading for Others",
      desc: "Roles can be delegated to upload on behalf of another (e.g. an Employee filing field bills for a Project Manager to verify).",
    },
    {
      title: "Late Submissions",
      desc: "Periods have a due date and a 'late uploads until' date. Filings in between are accepted but flagged for admin review before closing.",
    },
  ];

  return (
    <motion.div
      id="panel-checkpoints"
      role="tabpanel"
      aria-labelledby="tab-checkpoints"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25 }}
      className="space-y-8"
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <div className="mb-6 border-b border-slate-100 pb-5">
          <h3 className="font-display text-xl font-bold text-slate-900">
            4. End-to-End Workflow & 8.5 Checkpoints
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Every document follows the same 8 steps. A value is reported only after one person
            verifies it and another approves it.
          </p>
        </div>

        {/* 8-step Workflow Grid */}
        <div className="mb-8">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-600">
            The 8 Sequential Pipeline Steps (with 2 Return Loops)
          </h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {WORKFLOW_STEPS.map((step) => (
              <div
                key={step.num}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 text-xs"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-bold text-[#313490]">Step {step.num}</span>
                  <span className="text-[10px] font-semibold text-slate-400">0{step.num}/08</span>
                </div>
                <div className="font-bold text-slate-900">{step.title}</div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{step.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <CornerDownRight className="h-3.5 w-3.5 text-amber-600" />
              <strong>Loop 1:</strong> Validation failure returns record to Step 3 (Verify).
            </span>
            <span className="flex items-center gap-1.5">
              <CornerDownRight className="h-3.5 w-3.5 text-rose-600" />
              <strong>Loop 2:</strong> Approver return with comment sends record back to Step 3.
            </span>
          </div>
        </div>

        {/* 6 Checkpoints Table */}
        <div className="mb-8 border-t border-slate-100 pt-6">
          <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-700">
            8.5 The Six Integrity Checkpoints
          </h4>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 font-semibold text-slate-700">
                <tr>
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">Checkpoint</th>
                  <th className="px-4 py-2.5">What is checked</th>
                  <th className="px-4 py-2.5">Checked by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {CHECKPOINTS_TABLE.map((c) => (
                  <tr key={c.num} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-bold text-[#313490]">{c.num}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{c.name}</td>
                    <td className="px-4 py-2.5">{c.checked}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-700">{c.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Outcomes Table */}
        <div className="mb-8 border-t border-slate-100 pt-6">
          <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-700">
            How a Check Can End (Outcomes)
          </h4>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 font-semibold text-slate-700">
                <tr>
                  <th className="px-4 py-2.5">Outcome</th>
                  <th className="px-4 py-2.5">What it means</th>
                  <th className="px-4 py-2.5">Who acts next</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {OUTCOMES.map((o) => (
                  <tr key={o.outcome} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-bold text-slate-900">{o.outcome}</td>
                    <td className="px-4 py-2.5">{o.means}</td>
                    <td className="px-4 py-2.5 font-medium text-[#313490]">{o.next}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Special Paths */}
        <div className="border-t border-slate-100 pt-6">
          <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-700">
            Special Ingestion Paths
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {SPECIAL_PATHS.map((sp) => (
              <div
                key={sp.title}
                className="rounded-xl border border-slate-200 bg-slate-50/40 p-3.5 text-xs"
              >
                <div className="font-bold text-slate-900">{sp.title}</div>
                <p className="mt-1 leading-relaxed text-slate-600">{sp.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* TAB 4: TECHNICAL & TROUBLESHOOTING                                         */
/* -------------------------------------------------------------------------- */
function TechnicalTab() {
  const portalVersion = (pkg as { version?: string }).version || "0.1.0";

  const TECH_STACK = [
    {
      layer: "Portal",
      tech: "Next.js 16, React 19, TypeScript",
      means: "Responsive PWA; runs in modern desktop/mobile browsers, installable to home screen.",
    },
    {
      layer: "Backend",
      tech: "tRPC Server Procedures",
      means:
        "Strict server authorization; every read and write checked for session, role, and org scope.",
    },
    {
      layer: "Database",
      tech: "PostgreSQL with RLS on Supabase",
      means: "Row-level security isolates data by org unit directly inside the database.",
    },
    {
      layer: "File Storage",
      tech: "Private storage on Supabase",
      means: "Documents open only via single-use signed URLs for authorized people in scope.",
    },
    {
      layer: "Sign-in",
      tech: "Supabase Auth with invitation tokens",
      means: "No public sign-up; sessions end after 3h inactivity; 1 device per account limit.",
    },
    {
      layer: "Document Reader",
      tech: "PaddleOCR (PP-OCRv5), Python 3.12 in Docker",
      means: "Bills read on EmeilSG's own CPU in ~10s per page; zero data leaves system.",
    },
    {
      layer: "Reports",
      tech: "Headless Chromium for PDF, ExcelJS for GHG",
      means: "Downloadable audit-grade PDF disclosures and multi-sheet Excel inventories.",
    },
    {
      layer: "Email",
      tech: "Brevo SMTP Relay",
      means: "Delivers invitation tokens, 6-digit password reset codes, and deadline alerts.",
    },
    {
      layer: "Assistant",
      tech: "Optional AI language model",
      means: "Rewords responses; the app computes every figure, model never supplies numbers.",
    },
    {
      layer: "Hosting",
      tech: "Vercel edge + Supabase Mumbai",
      means: "Both application computing and primary database reside in the Mumbai region.",
    },
  ];

  const TROUBLESHOOTING = [
    {
      problem: "Upload stays in 'Processing'",
      cause: "The document reader is not running",
      fix: "Wait a few minutes; if it stays, inform your Administrator.",
    },
    {
      problem: "'Extraction Failed' with reason",
      cause: "Unreadable, blank or password-protected file",
      fix: "Upload a clearer copy or enter values by hand with a reason.",
    },
    {
      problem: "Confirm is disabled on Verify",
      cause: "A marked or required value is unresolved, or document type unselected",
      fix: "Read the reason beside button; edit the value or mark it correct.",
    },
    {
      problem: "'Not calculated yet'",
      cause: "No conversion factor covers that activity and period",
      fix: "Super Admin enters the factor, then presses Run calculation.",
    },
    {
      problem: "Upload says no period is open",
      cause: "No period open or late-upload date has passed",
      fix: "Ask a Super Admin to open the reporting period.",
    },
    {
      problem: "Activity missing from Upload list",
      cause: "Your role does not file that kind of document",
      fix: "Ask the colleague whose role does, or your Administrator.",
    },
    {
      problem: "Record flagged as duplicate",
      cause: "Same file hash or duplicate bill number & period",
      fix: "An Administrator accepts or returns it in the Validation Queue.",
    },
    {
      problem: "Invitation link does not work",
      cause: "Already used, older than 24h, or replaced",
      fix: "Ask your Administrator to press Resend invitation.",
    },
    {
      problem: "No email arrives",
      cause: "Spam folder or email relay not configured",
      fix: "Check spam folder, then contact platform operator.",
    },
    {
      problem: "Signed out unexpectedly",
      cause: "Inactivity for 3 hours or signed in on second device",
      fix: "Sign in again; you return directly to the same page.",
    },
    {
      problem: "Account locked after wrong passwords",
      cause: "5 failed sign-in attempts in 15 minutes",
      fix: "Wait 15 minutes or use Forgot password for a 10-minute code.",
    },
    {
      problem: "A report generation failed",
      cause: "Missing indicator mapping or uncalculated rows",
      fix: "Resolve the named reason on the page and generate again.",
    },
    {
      problem: "The Ask button is not shown",
      cause: "Assistant is disabled or your role may not use it",
      fix: "Ask your Super Admin to enable chatbot access.",
    },
  ];

  return (
    <motion.div
      id="panel-technical"
      role="tabpanel"
      aria-labelledby="tab-technical"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25 }}
      className="space-y-8"
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <div className="mb-6 flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-xl font-bold text-slate-900">
              8. Technical Details & 9. Troubleshooting
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Plain-language overview of the stack, Docker OCR worker, security guardrails, and
              issue resolution.
            </p>
          </div>

          {/* Dynamic Version Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
              Portal: <span className="font-mono text-[#313490]">v{portalVersion}</span>
            </span>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
              Engine: <span className="font-mono text-[#E91029]">{ENGINE_VERSION}</span>
            </span>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
              OCR Rules: <span className="font-mono text-slate-800">rules-14</span>
            </span>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
              Migrations: <span className="font-mono text-emerald-700">66 updates applied</span>
            </span>
          </div>
        </div>

        {/* 8.2 Technology Stack Table */}
        <div className="mb-8">
          <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-700">
            8.2 Technology Stack
          </h4>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 font-semibold text-slate-700">
                <tr>
                  <th className="px-4 py-2.5">Layer</th>
                  <th className="px-4 py-2.5">Technology</th>
                  <th className="px-4 py-2.5">What it means for you</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {TECH_STACK.map((t) => (
                  <tr key={t.layer} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-bold text-slate-900">{t.layer}</td>
                    <td className="px-4 py-2.5 font-semibold text-[#313490]">{t.tech}</td>
                    <td className="px-4 py-2.5">{t.means}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Core Subsystem Highlights */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs leading-relaxed">
            <div className="mb-2 font-bold text-slate-900">8.4 The Backend & Security</div>
            <ul className="space-y-1.5 text-slate-600">
              <li>• The browser never writes directly to the database.</li>
              <li>
                • Evidence served only via authenticated endpoints that verify org scope on every
                read.
              </li>
              <li>
                • The audit log and calculation traces refuse update, delete, and truncate across
                all roles.
              </li>
              <li>• Every uploaded file is fingerprinted (SHA-256) and verified on every open.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs leading-relaxed">
            <div className="mb-2 font-bold text-slate-900">8.6 Docker Document Reader</div>
            <ul className="space-y-1.5 text-slate-600">
              <li>• Runs as an isolated container holding PaddleOCR and language weights.</li>
              <li>• Web app and OCR worker communicate strictly through database queues.</li>
              <li>
                • If container stops, uploads safely pause in &ldquo;Processing&rdquo;; zero data is
                lost.
              </li>
              <li>
                • Requires ~2 GB memory, has no exposed public web port, and keeps bills entirely
                local.
              </li>
            </ul>
          </div>
        </div>

        {/* 9.1 Troubleshooting Table */}
        <div className="border-t border-slate-100 pt-6">
          <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-700">
            9.1 Troubleshooting & Common Questions
          </h4>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 font-semibold text-slate-700">
                <tr>
                  <th className="px-4 py-2.5">What you see</th>
                  <th className="px-4 py-2.5">Likely cause</th>
                  <th className="px-4 py-2.5">What to do</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {TROUBLESHOOTING.map((tr) => (
                  <tr key={tr.problem} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-bold text-slate-900">{tr.problem}</td>
                    <td className="px-4 py-2.5 text-slate-600">{tr.cause}</td>
                    <td className="px-4 py-2.5 font-medium text-[#313490]">{tr.fix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 9.3 Limitations */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-600">
          <strong className="block font-bold text-slate-800 mb-1">
            9.3 Known System Limitations
          </strong>
          <p>
            OCR is English-language only and tuned on typed/digital invoices and utility bills
            (handwriting is not supported). Multi-bill PDFs are limited to 20 pages per batch.
            Emission factors must be provided by the organization with source citations.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
