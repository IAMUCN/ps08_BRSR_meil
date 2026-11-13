"use client";

import { useState, useId } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronDown,
  Users,
  ScanText,
  ShieldCheck,
  Calculator,
  FileCheck,
  Lock,
  Search,
  Sparkles,
  HelpCircle,
} from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";

type CategoryId =
  "onboarding" | "uploads" | "verification" | "calculations" | "reporting" | "security";

interface CategoryMeta {
  id: CategoryId;
  label: string;
  icon: typeof Users;
  description: string;
}

interface FaqItem {
  id: string;
  category: CategoryId;
  q: string;
  a: string;
  highlight?: string;
}

const CATEGORIES: CategoryMeta[] = [
  {
    id: "onboarding",
    label: "Getting Started & Roles",
    icon: Users,
    description: "Account provisioning, role boundaries, passwords, and multi-device sessions",
  },
  {
    id: "uploads",
    label: "Uploads & OCR Reading",
    icon: ScanText,
    description:
      "Supported file formats, multi-bill splitting, scan quality, and confidence scores",
  },
  {
    id: "verification",
    label: "Verification & Approvals",
    icon: ShieldCheck,
    description:
      "Resolving low-confidence fields, validation checks, four-eyes approval, and returns",
  },
  {
    id: "calculations",
    label: "Calculations & Emissions",
    icon: Calculator,
    description: "Deterministic math, unit normalizations, factor libraries, and immutable traces",
  },
  {
    id: "reporting",
    label: "BRSR Reports & Auditing",
    icon: FileCheck,
    description:
      "SEBI templates, Audit Evidence Bundles, drill-down lineages, and readiness scores",
  },
  {
    id: "security",
    label: "Security, Privacy & AI",
    icon: Lock,
    description: "Mumbai data residency, row-level security, local OCR worker, and immutable audit",
  },
];

const FAQS: FaqItem[] = [
  /* ------------------------------------------------------------------------ */
  /* CATEGORY 1: GETTING STARTED & ROLES                                      */
  /* ------------------------------------------------------------------------ */
  {
    id: "onb-1",
    category: "onboarding",
    q: "How do I get an account on EmeilSG? Can I sign up myself on the website?",
    a: "EmeilSG enforces zero public self-registration. Every account must be created by an Administrator or Super Admin, who assigns your role and organizational unit. You receive a single-use invitation link via email to set your password and access your workspace.",
    highlight: "Zero public sign-up; invitation-only provisioning.",
  },
  {
    id: "onb-2",
    category: "onboarding",
    q: "What should I do if my invitation link or password reset code expires?",
    a: "Invitation links are valid for 24 hours. If yours expires, ask your Administrator to open /admin/users and click 'Resend invitation'. For forgotten passwords, use 'Forgot password' on the login screen to receive a 6-digit code valid for 10 minutes.",
    highlight: "Invitation links last 24 hours; reset codes last 10 minutes.",
  },
  {
    id: "onb-3",
    category: "onboarding",
    q: "What are the password requirements?",
    a: "Passwords must be at least 12 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character (symbol).",
  },
  {
    id: "onb-4",
    category: "onboarding",
    q: "How does the system decide whether I land in /app or /admin?",
    a: "Upon sign-in, the server evaluates your assigned role codes. Administrators and Super Admins land on the /admin Control Tower. Operational roles (Project Managers, EHS, HR, Procurement, Finance, and Employees) automatically land on the /app Workspace.",
  },
  {
    id: "onb-5",
    category: "onboarding",
    q: "Can an Employee upload bills on behalf of a Project Manager?",
    a: "Yes. EmeilSG supports operational delegation. An Employee can upload invoices or receipts from a mobile phone or desktop, and the assigned Project Manager then inspects, verifies, and confirms the extracted values.",
  },
  {
    id: "onb-6",
    category: "onboarding",
    q: "Can I be signed in on both my phone and desktop at the same time?",
    a: "No. For security and audit compliance, EmeilSG enforces one active device session per user account. Signing in on a second device alerts you and asks for confirmation before terminating the earlier session.",
  },

  /* ------------------------------------------------------------------------ */
  /* CATEGORY 2: UPLOADS & OCR READING                                        */
  /* ------------------------------------------------------------------------ */
  {
    id: "upl-1",
    category: "uploads",
    q: "What file types and sizes are supported for document upload?",
    a: "The portal accepts PDF, JPG, and PNG files up to 50 MB. On mobile devices, contributors can use their camera to take photos of paper delivery receipts or meter readings directly into the upload form.",
    highlight: "PDF, JPG, PNG up to 50 MB with mobile camera capture.",
  },
  {
    id: "upl-2",
    category: "uploads",
    q: "How does the system handle a single PDF that contains multiple invoices?",
    a: "Select 'A PDF with several bills' on the Upload screen. EmeilSG accepts multi-bill PDFs up to 20 pages. The OCR worker evaluates page headers and numbers to propose bill splits. You confirm or adjust the page boundaries, and each segment becomes a separate trackable record.",
  },
  {
    id: "upl-3",
    category: "uploads",
    q: "What happens if a document is blurry or OCR fails to read it?",
    a: "If the document is unreadable, you can upload a clearer scan. Alternatively, you can enter the figures manually by providing a mandatory written justification. All manual entries are automatically highlighted with an audit flag for Administrator review.",
  },
  {
    id: "upl-4",
    category: "uploads",
    q: "Does OCR ever guess missing figures or dates?",
    a: "Never. EmeilSG strictly forbids probabilistic guessing or synthetic extrapolation. Any field the reader cannot locate with certainty is left blank for the contributor to complete during verification.",
  },
  {
    id: "upl-5",
    category: "uploads",
    q: "What do the red highlights and confidence scores mean on the Verify screen?",
    a: "The OCR engine scores every extracted field from 0 to 100. Any field scoring below the review threshold (80 by default) is highlighted in red. The 'Confirm' button remains disabled until every red field is either edited or marked 'Looks correct'.",
    highlight: "Scores under 80 require active contributor confirmation.",
  },
  {
    id: "upl-6",
    category: "uploads",
    q: "Can documents be uploaded after the period deadline?",
    a: "Reporting periods have a due date followed by a configurable 'late uploads until' grace window. Documents submitted during this window are accepted but flagged as late. After the late-upload date expires, the period closes automatically.",
  },

  /* ------------------------------------------------------------------------ */
  /* CATEGORY 3: VERIFICATION & APPROVALS                                     */
  /* ------------------------------------------------------------------------ */
  {
    id: "ver-1",
    category: "verification",
    q: "What checks are performed during automatic validation?",
    a: "When a contributor clicks Confirm, six automated checks run in a single database transaction: format and numeric sanity, organizational unit scope, evidence attachment, allowed units and range logic, duplicate bill numbers, and historical anomaly detection.",
    highlight: "6 checks run atomically inside one transaction.",
  },
  {
    id: "ver-2",
    category: "verification",
    q: "What does a 'Flagged' status mean in My Submissions?",
    a: "A flagged record has passed all hard validation rules but triggered an advisory notice—such as a potential duplicate bill number, a late upload, or an unusual consumption variance compared to historical trends. It is routed to the Validation Queue for Administrator sign-off.",
  },
  {
    id: "ver-3",
    category: "verification",
    q: "Can I approve my own submission?",
    a: "No. EmeilSG strictly enforces the four-eyes principle. The person who submits or verifies a record can never approve it. Approval requires a separate authorized reviewer within the organizational scope.",
    highlight: "Four-eyes principle: self-approval is blocked.",
  },
  {
    id: "ver-4",
    category: "verification",
    q: "What happens when an approver returns a submission?",
    a: "The record transitions to 'Returned' and you receive a notification with the approver's written reason. The submission returns to Step 3 (Verify), where you can adjust the values, replace the document, or clarify details before resubmitting.",
  },
  {
    id: "ver-5",
    category: "verification",
    q: "How does duplicate detection protect against double-counting?",
    a: "At upload, the server generates a SHA-256 cryptographic hash to catch identical files across the entire platform. During validation, it additionally cross-checks invoice numbers and billing periods within the same organization unit.",
  },

  /* ------------------------------------------------------------------------ */
  /* CATEGORY 4: CALCULATIONS & EMISSIONS                                     */
  /* ------------------------------------------------------------------------ */
  {
    id: "calc-1",
    category: "calculations",
    q: "How are emission calculations executed?",
    a: "Calculations are purely deterministic: the verified activity quantity is normalized to standard units (e.g. cubic meters to kiloliters, liters to metric tons) and multiplied by the active conversion factor version for that period. The formula, inputs, and result are permanently preserved in a calculation trace.",
    highlight: "Same inputs + same factor version = identical output, always.",
  },
  {
    id: "calc-2",
    category: "calculations",
    q: "Where do conversion factors come from? Can anyone change them?",
    a: "Conversion factors are managed centrally by Super Admins in the versioned factor library. Every factor requires an authoritative source citation (such as CEA, DEFRA, or IPCC) and effective date bounds. Factors are never hard-coded.",
  },
  {
    id: "calc-3",
    category: "calculations",
    q: "What does 'Not calculated yet' mean?",
    a: "It indicates that no approved conversion factor version exists for that activity during the specified reporting period. The record remains on hold and cannot be approved until a Super Admin adds the factor and triggers calculation.",
  },
  {
    id: "calc-4",
    category: "calculations",
    q: "What happens if an emission factor is updated or revised?",
    a: "Factors are strictly versioned. Updating a factor creates a new version with its own effective dates. Existing historical calculations remain locked to the version in force at the time of filing, ensuring immutable auditability.",
  },
  {
    id: "calc-5",
    category: "calculations",
    q: "How are unit conversions managed across different units of measure?",
    a: "The engine includes a verified unit normalization dictionary. If an invoice specifies a valid alternate unit (e.g., cubic meters for water, or gallons for diesel), it converts with zero rounding error. Unrecognized units halt the calculation.",
  },

  /* ------------------------------------------------------------------------ */
  /* CATEGORY 5: BRSR REPORTS & AUDITING                                      */
  /* ------------------------------------------------------------------------ */
  {
    id: "rep-1",
    category: "reporting",
    q: "What report templates does EmeilSG support?",
    a: "Administrators can generate four standardized templates: Full BRSR Report (aligned with SEBI requirements), BRSR Core (nine essential ESG indicators), GHG Inventory (Scope 1, 2, and 3 breakups, also downloadable as Excel), and Executive ESG Summary.",
    highlight: "SEBI BRSR, BRSR Core, GHG Inventory Excel, and Executive Summary.",
  },
  {
    id: "rep-2",
    category: "reporting",
    q: "What is an Audit Evidence Bundle?",
    a: "An Audit Evidence Bundle is a tamper-evident ZIP archive containing every source bill PDF/image, data metrics in CSV, and calculation traces. It includes a manifest and SHA-256 checksums file so external auditors can verify integrity independently.",
  },
  {
    id: "rep-3",
    category: "reporting",
    q: "How does line-item drill-down work in the generated reports?",
    a: "Every reported number in the web viewer or PDF report is traceable. Clicking or searching a figure walks back through indicator rollups, consolidation sums, formula traces, and verified values, opening the original source bill in one click.",
  },
  {
    id: "rep-4",
    category: "reporting",
    q: "How are percentages aggregated across multiple subsidiaries?",
    a: "Percentages (such as workforce gender diversity or MSME procurement ratios) are always re-derived from summed baseline counts across units, never mathematically averaged. Averaging percentages across unequal entities introduces statistical distortion.",
  },
  {
    id: "rep-5",
    category: "reporting",
    q: "Is the BRSR readiness score an official statutory score?",
    a: "No. The readiness score is an internal operational metric (0–100%) that tracks data completeness, evidence coverage, and approval velocity across required indicators to help leadership resolve gaps before official filing.",
  },

  /* ------------------------------------------------------------------------ */
  /* CATEGORY 6: SECURITY, PRIVACY & AI                                       */
  /* ------------------------------------------------------------------------ */
  {
    id: "sec-1",
    category: "security",
    q: "Where is our organization's data hosted?",
    a: "All application compute and database storage reside in the Mumbai, India cloud region (Vercel edge for portal routing, Supabase PostgreSQL and private storage). Data never leaves the sovereign jurisdiction.",
    highlight: "100% in-region hosting: Mumbai, India.",
  },
  {
    id: "sec-2",
    category: "security",
    q: "Does the OCR worker send documents to outside AI services?",
    a: "No. Document extraction runs on EmeilSG's own containerized PaddleOCR (PP-OCRv5) Docker worker on local infrastructure. Your bills, payroll statements, and vendor contracts are never transmitted to public AI APIs.",
    highlight: "Local containerized OCR; zero third-party AI exposure.",
  },
  {
    id: "sec-3",
    category: "security",
    q: "Can the AI language model hallucinate or alter our emissions figures?",
    a: "No. The AI assistant is strictly read-only and confined to rephrasing answers based on numbers already calculated by the deterministic engine. It is incapable of modifying data or generating figures on its own.",
  },
  {
    id: "sec-4",
    category: "security",
    q: "Can users in Subsidiary A see documents from Subsidiary B?",
    a: "No. PostgreSQL Row-Level Security (RLS) is enforced at the database layer on every query. Users can only access records from their assigned unit and units directly beneath it. Sibling organizational units are strictly isolated.",
  },
  {
    id: "sec-5",
    category: "security",
    q: "Can anyone edit or delete records from the audit trail?",
    a: "No. The audit ledger rejects UPDATE, DELETE, and TRUNCATE operations across all roles, including Administrators and the application service role. Every upload, verification, and approval creates an immutable audit record.",
  },
  {
    id: "sec-6",
    category: "security",
    q: "How does automatic session timeout work?",
    a: "Sessions terminate after 3 hours of inactivity. Five minutes before expiration, a persistent on-screen warning appears, giving users the option to extend their session or finish pending edits before logging out.",
  },
];

export function FaqSection() {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("onboarding");
  const [openId, setOpenId] = useState<string | null>("onb-1");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputId = useId();

  const currentCategoryMeta = CATEGORIES.find((c) => c.id === activeCategory)!;

  // Filter based on active category, or global search query
  const isSearching = searchQuery.trim().length > 0;
  const displayedFaqs = isSearching
    ? FAQS.filter(
        (f) =>
          f.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.a.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : FAQS.filter((f) => f.category === activeCategory);

  const toggle = (id: string) => {
    setOpenId(openId === id ? null : id);
  };

  return (
    <section id="faq" className="scroll-mt-20 bg-white px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <SectionHeading
          eyebrow="Frequently Asked Questions"
          title="Curated Answers by Domain & Workflow"
        >
          Comprehensive reference addressing contributor workflows, OCR verification, four-eyes
          governance, calculation traces, and data sovereignty.
        </SectionHeading>

        {/* Search Bar */}
        <div className="mx-auto mb-10 max-w-xl">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-slate-400" />
            <input
              id={searchInputId}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setOpenId(null);
              }}
              placeholder="Search all questions (e.g. OCR, duplicate, password, Docker, Excel)..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 py-3 pl-11 pr-4 text-sm text-slate-900 placeholder-slate-400 shadow-2xs transition-all focus:border-[#313490] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#313490]/15"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3.5 top-3 text-xs font-semibold text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>
          {isSearching && (
            <p className="mt-2 text-center text-xs text-slate-500">
              Found {displayedFaqs.length} question{displayedFaqs.length === 1 ? "" : "s"} matching
              &ldquo;{searchQuery}&rdquo;
            </p>
          )}
        </div>

        {/* Structured Category Selector (When not searching) */}
        {!isSearching && (
          <div className="mb-10">
            <div
              role="tablist"
              aria-label="FAQ categories"
              className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6"
            >
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isActive = activeCategory === cat.id;
                const count = FAQS.filter((f) => f.category === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    id={`faq-tab-${cat.id}`}
                    aria-selected={isActive}
                    aria-controls={`faq-panel-${cat.id}`}
                    onClick={() => {
                      setActiveCategory(cat.id);
                      const firstInCat = FAQS.find((f) => f.category === cat.id);
                      setOpenId(firstInCat ? firstInCat.id : null);
                    }}
                    className={`relative flex flex-col items-center justify-center rounded-xl p-3 text-center transition-all ${
                      isActive
                        ? "border-2 border-[#313490] bg-[#313490]/5 shadow-xs"
                        : "border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        isActive ? "bg-[#313490] text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span
                      className={`mt-2 text-xs font-semibold ${
                        isActive ? "text-[#313490]" : "text-slate-700"
                      }`}
                    >
                      {cat.label}
                    </span>
                    <span className="mt-0.5 text-[10px] text-slate-400">{count} items</span>
                  </button>
                );
              })}
            </div>

            {/* Category Description Banner */}
            <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2.5 text-xs text-slate-600">
              <span className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-[#313490]" />
                <strong>{currentCategoryMeta.label}:</strong> {currentCategoryMeta.description}
              </span>
              <span className="font-mono text-[11px] font-semibold text-slate-500">
                {displayedFaqs.length} Questions
              </span>
            </div>
          </div>
        )}

        {/* Questions Accordion List */}
        <div
          id={`faq-panel-${activeCategory}`}
          role="region"
          aria-labelledby={`faq-tab-${activeCategory}`}
          className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
        >
          {displayedFaqs.length === 0 ? (
            <div className="p-12 text-center">
              <HelpCircle className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700">No questions found</p>
              <p className="mt-1 text-xs text-slate-500">
                Try searching for different keywords or clear the search filter.
              </p>
            </div>
          ) : (
            displayedFaqs.map((faq, i) => {
              const isOpen = openId === faq.id;
              return (
                <div
                  key={faq.id}
                  className={`transition-colors ${
                    isOpen ? "bg-slate-50/60" : "hover:bg-slate-50/30"
                  }`}
                >
                  <button
                    type="button"
                    id={`faq-btn-${faq.id}`}
                    aria-expanded={isOpen}
                    aria-controls={`faq-ans-${faq.id}`}
                    onClick={() => toggle(faq.id)}
                    className="flex w-full cursor-pointer items-center justify-between gap-4 px-6 py-4.5 text-left transition-colors"
                  >
                    <span className="flex items-start gap-3 text-sm font-semibold text-slate-900 sm:text-base">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#313490]/10 font-mono text-[11px] font-bold text-[#313490]">
                        {i + 1}
                      </span>
                      <span>{faq.q}</span>
                    </span>
                    <motion.div
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="shrink-0 text-slate-400"
                    >
                      <ChevronDown className="h-5 w-5" />
                    </motion.div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        id={`faq-ans-${faq.id}`}
                        role="region"
                        aria-labelledby={`faq-btn-${faq.id}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.04, 0.62, 0.23, 0.98] }}
                        className="overflow-hidden"
                      >
                        <div className="px-6 pb-5 pl-14 text-xs leading-relaxed text-slate-600 sm:text-sm">
                          <p>{faq.a}</p>
                          {faq.highlight && (
                            <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#313490]/20 bg-[#313490]/5 px-2.5 py-1 text-xs font-semibold text-[#313490]">
                              <span>&bull;</span>
                              <span>{faq.highlight}</span>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
