import {
  Boxes,
  Calculator,
  CheckCircle2,
  Globe,
  KeyRound,
  LogIn,
  Mail,
  MailOpen,
  MessageCircle,
  ScanText,
  Server,
  Tag,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { DocsTabs } from "@/components/landing/docs-tabs";
import { SectionHeading } from "@/components/landing/section-heading";
import { ENGINE_VERSION } from "@/lib/calculation/engine";
import pkg from "@/package.json";

// The public user manual on the landing page (UI_NOTES.md, 2026-11-12): written for the people who use the
// portal, not for the people who build it. Version numbers are read from the app itself so they cannot go stale;
// limits an administrator can change are described without a number.

const START: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: MailOpen,
    title: "Open your invitation",
    text: "An administrator creates your account. You receive an email with a link that works once and for a limited time.",
  },
  {
    icon: KeyRound,
    title: "Choose a password",
    text: "At least 12 characters, with an upper-case letter, a lower-case letter, a number and a symbol.",
  },
  {
    icon: LogIn,
    title: "Sign in",
    text: "You arrive in the area for your role. An account is signed in on one device at a time.",
  },
  {
    icon: Upload,
    title: "Upload your first document",
    text: "Pick the reporting period, the site and the activity, then add a PDF, JPG or PNG. The portal reads it for you.",
  },
];

const ROLES: [string, string, string][] = [
  [
    "Employee",
    "Uploads bills on behalf of a colleague, for example a Project Manager.",
    "Workspace",
  ],
  ["Project Manager", "Uploads and checks fuel and electricity bills for a project.", "Workspace"],
  [
    "EHS / Environment",
    "Water, waste, refrigerant, air-emission and safety documents.",
    "Workspace",
  ],
  ["HR", "Headcount and training statements; adds employees in bulk.", "Workspace"],
  ["Procurement", "Supplier and MSME spend statements.", "Workspace"],
  ["Finance / CSR", "CSR spend, fines and business travel.", "Workspace"],
  [
    "Corporate ESG / Sustainability",
    "Reviews flagged values and approves or returns records.",
    "Workspace",
  ],
  [
    "Administrator",
    "Runs one unit and everything beneath it: people, review, figures and reports.",
    "Administration",
  ],
  [
    "Super Admin",
    "Group-wide setup: reporting periods, conversion factors, roles and BRSR mapping.",
    "Administration",
  ],
];

const CHECKPOINTS: { title: string; text: string; who: string }[] = [
  {
    title: "At upload",
    text: "The file must be a readable PDF, JPG or PNG within the size limit. An identical file already in the system is flagged.",
    who: "The portal",
  },
  {
    title: "After reading",
    text: "Every value read from the document gets a confidence score. Low scores and missing values are marked for you.",
    who: "The document reader",
  },
  {
    title: "Verification",
    text: "You compare each marked value with the document and correct or confirm it. Nothing moves on until you do.",
    who: "The person who uploaded",
  },
  {
    title: "Validation",
    text: "Units, dates, duplicate bills and values far from that site's own history are checked. Anything unusual goes to an administrator.",
    who: "The portal, then an administrator",
  },
  {
    title: "Approval",
    text: "A different person approves the record or returns it with a reason. Nobody approves their own upload.",
    who: "An approver",
  },
  {
    title: "Report verification",
    text: "A finished report is forwarded to the level above, which verifies it or returns it with a reason.",
    who: "The administrators above",
  },
];

function Technical() {
  const dep = (name: keyof typeof pkg.dependencies) => pkg.dependencies[name].replace(/^[\^~]/, "");
  const items: { icon: LucideIcon; title: string; text: string; meta?: string }[] = [
    {
      icon: Tag,
      title: "Version",
      text: "The release of the portal you are reading about, and of the engine that calculates every figure.",
      meta: `Portal ${pkg.version} · Calculation engine ${ENGINE_VERSION}`,
    },
    {
      icon: Globe,
      title: "The portal",
      text: "A website: nothing to install. It works in a current browser on a computer, tablet or phone, and can be added to a phone's home screen.",
      meta: `Next.js ${dep("next")} · React ${dep("react")}`,
    },
    {
      icon: Server,
      title: "The backend",
      text: "Every request is checked on the server for who you are, your role and your unit before anything is read or changed. Records live in a database that enforces those rules again; documents live in private storage with no public links.",
      meta: "PostgreSQL with row-level security · private file storage · hosted on Supabase",
    },
    {
      icon: ScanText,
      title: "The document reader",
      text: "Uploaded documents are read by EmeilSG's own reader, about ten seconds a page. Your documents are not sent to an outside reading service.",
      meta: "PaddleOCR 3.7 (PP-OCRv5), English",
    },
    {
      icon: Boxes,
      title: "Docker",
      text: "The document reader runs as a Docker container: a sealed package holding the reader and its language models, so it behaves the same wherever it is hosted and can be restarted or replaced without touching the portal. If it is stopped, uploads wait in Processing and are read when it returns; nothing is lost.",
    },
    {
      icon: Calculator,
      title: "Calculations",
      text: "Fixed formulas with conversion factors that carry a source and the years they apply to. The same input always gives the same result, and each result keeps the factor it used.",
    },
    {
      icon: Mail,
      title: "Email",
      text: "Invitations, password-reset codes, deadline reminders and alerts arrive by email as well as in the portal.",
    },
    {
      icon: MessageCircle,
      title: "The assistant",
      text: "Tracey, the optional assistant, answers questions about the data you may see. The portal supplies every figure; the AI service only words the answer.",
    },
  ];
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {items.map(({ icon: Icon, title, text, meta }) => (
        <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <dt className="flex items-center gap-3 text-base font-semibold text-slate-900">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#313490]/[0.08] text-[#313490]">
              <Icon className="h-4.5 w-4.5" aria-hidden />
            </span>
            {title}
          </dt>
          <dd className="mt-3 text-sm leading-relaxed text-slate-600">
            {text}
            {meta ? (
              <span className="mt-2 block font-mono text-xs text-slate-700">{meta}</span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function DocumentationSection() {
  return (
    <section id="docs" className="scroll-mt-20 bg-slate-50/70 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <SectionHeading eyebrow="Documentation" title="The user manual, in four short parts">
          For the people who use EmeilSG. No setup steps and no code.
        </SectionHeading>

        <DocsTabs
          tabs={[
            {
              id: "start",
              label: "Getting started",
              content: (
                <>
                  <ol className="grid gap-4 sm:grid-cols-2">
                    {START.map(({ icon: Icon, title, text }, i) => (
                      <li
                        key={title}
                        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#313490]/[0.08] text-[#313490]">
                            <Icon className="h-4.5 w-4.5" aria-hidden />
                          </span>
                          <span className="font-mono text-xs font-semibold text-slate-500">
                            0{i + 1}
                          </span>
                        </div>
                        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{text}</p>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-5 text-center text-sm text-slate-600">
                    There is no public sign-up. Forgot your password? The sign-in page emails you a
                    one-time code.
                  </p>
                </>
              ),
            },
            {
              id: "roles",
              label: "Roles",
              content: (
                <>
                  <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-xs">
                    {ROLES.map(([role, does, where]) => (
                      <li
                        key={role}
                        className="grid gap-x-6 gap-y-1 px-5 py-4 sm:grid-cols-[14rem_1fr_auto] sm:items-center"
                      >
                        <h3 className="text-sm font-semibold text-slate-900">{role}</h3>
                        <p className="text-sm leading-relaxed text-slate-600">{does}</p>
                        <p className="mt-1 sm:mt-0">
                          <span className="sr-only">Works in: </span>
                          <span
                            className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                              where === "Administration"
                                ? "bg-[#313490]/[0.08] text-[#313490]"
                                : "bg-emerald-50 text-emerald-800"
                            }`}
                          >
                            {where}
                          </span>
                        </p>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-5 text-center text-sm text-slate-600">
                    A role applies at your unit and everything beneath it. Your Super Admin can
                    rename roles and change what each may do.
                  </p>
                </>
              ),
            },
            {
              id: "checkpoints",
              label: "Checkpoints",
              content: (
                <>
                  <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {CHECKPOINTS.map(({ title, text, who }, i) => (
                      <li
                        key={title}
                        className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                            <CheckCircle2 className="h-4.5 w-4.5" aria-hidden />
                          </span>
                          <span className="font-mono text-xs font-semibold text-slate-500">
                            0{i + 1}
                          </span>
                        </div>
                        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                        <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-600">
                          {text}
                        </p>
                        <p className="mt-3 text-xs font-semibold text-slate-700">
                          Checked by: <span className="font-normal">{who}</span>
                        </p>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-5 text-center text-sm text-slate-600">
                    A figure reaches a report only after passing all six. Each one is written to an
                    audit trail that nobody can edit.
                  </p>
                </>
              ),
            },
            { id: "technical", label: "Technical details", content: <Technical /> },
          ]}
        />
      </div>
    </section>
  );
}
