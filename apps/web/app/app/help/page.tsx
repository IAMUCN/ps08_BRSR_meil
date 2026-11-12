import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { FaqItem as Faq, FaqList } from "@/components/help/faq";
import { PageHeader } from "@/components/shell/page-header";
import { adminNavFor, workspaceNavFor } from "@/components/shell/admin-nav";
import { requireAppSession } from "@/lib/auth/session";
import { BUNDLE_MAX_PAGES } from "@/lib/documents/bundle";
import { DUE_AFTER_DAYS, LATE_AFTER_DAYS } from "@/lib/periods/rules";
import { REPORT_TEMPLATES, TEMPLATE_INFO } from "@/lib/reports/templates";
import { MAX_UPLOAD_BYTES } from "@/lib/storage/evidence";
import { api } from "@/lib/trpc/server";

// The help centre (feature_enhancement.md 10.1, requirement 21; A49). Written from the product as built; the
// limits, roles and levels it quotes are read from the platform's settings when the page opens. Sections about
// administering the platform are shown to administrators only.

export const metadata: Metadata = { title: "Help · EmeilSG" };

const hours = (minutes: number) =>
  minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}` : `${minutes} minutes`;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-h`}
      className="scroll-mt-20 space-y-3 rounded-md border bg-card p-4 md:p-5"
    >
      <h2 id={`${id}-h`} className="text-lg font-semibold">
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-6 [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc">
        {children}
      </div>
    </section>
  );
}

/** A process as numbered steps with arrows between them; a plain ordered list to a screen reader. */
function Flow({ steps }: { steps: { title: string; detail: string }[] }) {
  return (
    <ol className="!ml-0 flex !list-none flex-wrap items-stretch gap-2" aria-label="Steps">
      {steps.map((step, i) => (
        <li key={step.title} className="!ml-0 flex items-stretch gap-2">
          <div className="w-40 rounded-md border border-border bg-muted/40 p-2">
            <p className="text-xs font-semibold text-muted-foreground">Step {i + 1}</p>
            <p className="font-medium">{step.title}</p>
            <p className="text-xs text-muted-foreground">{step.detail}</p>
          </div>
          {i < steps.length - 1 ? (
            <ArrowRight className="size-4 shrink-0 self-center text-muted-foreground" aria-hidden />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export default async function HelpPage() {
  const [session, caller] = await Promise.all([requireAppSession(), api()]);
  const facts = await caller.help.facts();
  const admin = session.isAdmin || session.isOrgAdmin;
  const myPages = workspaceNavFor(session);
  const allAdminPages = adminNavFor({ isAdmin: true });
  const emailDays = facts.reminderDays.filter((d) => d.email).map((d) => d.before);
  const appDays = facts.reminderDays.map((d) => d.before);

  const toc: [string, string][] = [
    ["start", "Getting started"],
    ["flow", "How a figure gets into a report"],
    ["upload", "Uploading and OCR"],
    ["verify", "Checking extracted values"],
    ["periods", "Reporting periods and deadlines"],
    ["roles", "Roles and responsibilities"],
    ["hierarchy", "Organization hierarchy"],
    ...(admin
      ? ([
          ["approvals", "Validation and approval"],
          ["reports", "Reports and their verification"],
          ["factors", "Conversion factors"],
          ["analytics", "Carbon analytics and alerts"],
        ] as [string, string][])
      : []),
    ["map", "Where things are"],
    ["phone", "On a phone"],
    ["trouble", "Common errors and what to do"],
    ["faq", "Questions"],
  ];

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader
        title="Help"
        description={`How EmeilSG works, as it is set up today. ${admin ? "You see the sections for administrators too." : "Your administrator handles setup, approvals and reports; ask them about anything not here."}`}
      />
      <nav aria-label="On this page" className="rounded-md border bg-card p-4">
        <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {toc.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-primary-text underline underline-offset-2">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="start" title="Getting started">
        <p>
          EmeilSG turns the documents your sites already produce (fuel invoices, electricity and
          water bills, waste certificates, travel and HR statements) into ESG figures and SEBI BRSR
          reports. Every figure can be traced back to the document it came from.
        </p>
        <ul>
          <li>
            Accounts are created by an administrator. You receive an email link, valid for{" "}
            {facts.invitationHours} hours, to choose your password; there is no public sign-up.
          </li>
          <li>
            A sign-in ends after {hours(facts.session.idleMinutes)} without activity on the page and
            after {hours(facts.session.absoluteMinutes)} in all. A notice appears five minutes
            before.
          </li>
          <li>
            One account is signed in on one device at a time. Signing in elsewhere asks first, then
            ends the other sign-in.
          </li>
          <li>Search everything you may see with Ctrl+K (or the Search button in the top bar).</li>
        </ul>
      </Section>

      <Section id="flow" title="How a figure gets into a report">
        <Flow
          steps={[
            {
              title: "Upload",
              detail: "A bill, invoice or statement for one activity and one period.",
            },
            { title: "Extract", detail: "OCR reads the values and scores each one." },
            {
              title: "Verify",
              detail: "The uploader checks every value against the document and confirms.",
            },
            {
              title: "Validate",
              detail: "Automatic checks: units, dates, duplicates, unusual values.",
            },
            {
              title: "Calculate",
              detail: "Quantity × the conversion factor in force for that period.",
            },
            { title: "Approve", detail: "An approver or administrator approves or returns it." },
            {
              title: "Report",
              detail: "Approved figures roll up the hierarchy into BRSR reports.",
            },
          ]}
        />
        <p>
          Nothing is reported until it is approved. A returned record goes back to the uploader with
          the reason, and every step is kept in the audit trail.
        </p>
      </Section>

      <Section id="upload" title="Uploading and OCR">
        <ul>
          <li>
            Files: PDF, JPG or PNG, up to {Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB. A
            password-protected PDF is refused. You can upload {facts.uploadsPerUser} files every{" "}
            {facts.uploadWindowMinutes} minutes.
          </li>
          <li>
            Choose the project or site, the ESG activity and, when more than one is open, the
            reporting period. You are offered only the activities your role files.
          </li>
          <li>
            <strong>A PDF with several bills</strong> (up to {BUNDLE_MAX_PAGES} pages): EmeilSG
            proposes how it splits into bills; you check the split, and each bill becomes its own
            record.
          </li>
          <li>
            OCR reads the document within a minute or two. Values it reads with less than{" "}
            {facts.ocrThreshold}% confidence, and required values it could not find, are marked for
            you to check.
          </li>
          <li>
            If the document cannot be read, upload a clearer copy, or enter the values by hand with
            a written reason (marked as a manual entry for reviewers).
          </li>
          <li>
            The same file uploaded twice, or the same bill (bill number, billing period and
            activity) uploaded again, is flagged for review, never silently accepted.
          </li>
        </ul>
      </Section>

      <Section id="verify" title="Checking extracted values">
        <ul>
          <li>
            The document is on one side and the values on the other; choosing a value outlines it on
            the page.
          </li>
          <li>Red values need you: edit them, or mark them correct.</li>
          <li>
            Confirm stays disabled until every flagged and required value is settled and the
            document type is set; it says what is left.
          </li>
          <li>Reject (with a reason) if the document is wrong; the file is kept.</li>
          <li>The values can be downloaded as an Excel sheet from the same screen.</li>
        </ul>
      </Section>

      <Section id="periods" title="Reporting periods and deadlines">
        <ul>
          <li>
            Each reporting period has a due date (by default {DUE_AFTER_DAYS} days after it ends)
            and a date until which late uploads are accepted ({LATE_AFTER_DAYS} days). A late upload
            is marked late and reviewed.
          </li>
          <li>
            Several periods can be open at once; a period closes by itself after its last upload
            date.
          </li>
          <li>
            Reminders: in the app{" "}
            {appDays.length
              ? `on ${appDays.join(", ")} days before the due date (0 is the due day)`
              : "before the due date"}
            {emailDays.length ? `, and by email on ${emailDays.join(", ")} days before` : ""},
            listing what is still missing. Administrators receive a summary for their units.
          </li>
        </ul>
      </Section>

      <Section id="roles" title="Roles and responsibilities">
        <p>
          Each person holds a role at a place in the organization; it applies there and to
          everything beneath. There are at most {facts.superAdminLimit} Super Admins.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-table-header text-table-header-foreground">
              <tr className="text-left">
                <th scope="col" className="px-3 py-2">
                  Role
                </th>
                <th scope="col" className="px-3 py-2">
                  What it can do
                </th>
              </tr>
            </thead>
            <tbody>
              {facts.roles.map((r) => (
                <tr key={r.code} className="border-b border-table-border bg-table-row align-top">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {r.name}
                    {r.description ? (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {r.description}
                      </span>
                    ) : null}
                  </th>
                  <td className="px-3 py-2 text-xs">
                    {r.code === "admin"
                      ? "Everything, across every org unit."
                      : r.permissions.length
                        ? r.permissions.join("; ")
                        : "No permissions"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="hierarchy" title="Organization hierarchy">
        <p>
          The organization is a tree of these levels, top first: {facts.levels.join(" → ")}. A unit
          can sit under more than one parent; it then counts in full under each, and once at the
          group.
        </p>
        <ul>
          <li>
            Records belong to the unit they were uploaded for and roll up to every unit above it.
          </li>
          <li>
            People see the units they are assigned to and everything beneath, nothing beside or
            above.
          </li>
          <li>
            An Administrator manages their unit and everything beneath it; a Super Admin manages all
            of it.
          </li>
        </ul>
      </Section>

      {admin ? (
        <>
          <Section id="approvals" title="Validation and approval">
            <ul>
              <li>
                Validation Queue: records with a flag (late, duplicate, unusual value, manual entry,
                wrong document type). Accept them, or return them to the uploader with a reason.
              </li>
              <li>
                Approval Queue: validated records with their calculation and a preview of the bill.
                Approve, or return with a reason. Nobody approves their own record; a Super
                Admin&apos;s own is marked.
              </li>
              <li>
                A record without a conversion factor cannot be approved until a factor exists.
              </li>
            </ul>
          </Section>
          <Section id="reports" title="Reports and their verification">
            <Flow
              steps={[
                {
                  title: "Generate",
                  detail:
                    "Choose the org unit, a period, a financial year or a range, and a template.",
                },
                {
                  title: "Check",
                  detail: "Open the report; click any value to reach its records and documents.",
                },
                {
                  title: "Forward",
                  detail: "Send it to the Administrators of the unit above for verification.",
                },
                {
                  title: "Verify",
                  detail: "They verify (and may forward again) or return it with a reason.",
                },
              ]}
            />
            <ul>
              {REPORT_TEMPLATES.map((t) => (
                <li key={t}>
                  <strong>{TEMPLATE_INFO[t].label}:</strong> {TEMPLATE_INFO[t].description}
                </li>
              ))}
              <li>
                Reports use approved records only and say how many were left out awaiting approval.
              </li>
            </ul>
          </Section>
          <Section id="factors" title="Conversion factors">
            <ul>
              <li>
                Each factor has versions with a value, units, the date range it covers, a source
                link and publisher, and the financial year.
              </li>
              <li>
                A link on an official site (CEA, BEE, IPCC and others) can be fetched and a value
                picked from the page; nothing is saved by itself.
              </li>
              <li>
                A new or corrected version is a draft until another Super Admin approves it (the
                only Super Admin may approve their own, marked as such). The yearly review lists
                what each financial year still needs.
              </li>
              <li>A version used by a calculation never changes; a correction is a new version.</li>
            </ul>
          </Section>
          <Section id="analytics" title="Carbon analytics and alerts">
            <ul>
              <li>
                Carbon Analytics shows emissions by financial year, compared like for like, and says
                when a year is incomplete.
              </li>
              <li>
                Suggested actions come from fixed rules on approved figures and name the figures
                behind them.
              </li>
              <li>
                Alerts: {facts.alerts.enabled ? "checked daily" : "the daily check is switched off"}
                . A closed period alerts when its emissions are more than{" "}
                {Object.entries(facts.alerts.thresholdPct)
                  .map(([s, p]) => `${p}% (${s.replace("SCOPE_", "Scope ")})`)
                  .join(", ")}{" "}
                above the same period in earlier years (at least {facts.alerts.minBaselineYears}),
                within {facts.alerts.lookbackDays} days of its end.
              </li>
            </ul>
          </Section>
        </>
      ) : null}

      <Section id="map" title="Where things are">
        <p>Your pages:</p>
        <ul className="!ml-0 grid !list-none gap-1 sm:grid-cols-2">
          {myPages.map((p) => (
            <li key={p.href} className="!ml-0">
              <Link href={p.href} className="text-primary-text underline underline-offset-2">
                {p.label}
              </Link>
            </li>
          ))}
        </ul>
        {session.isAdmin ? null : admin ? (
          <p className="text-muted-foreground">
            Super Admins also have:{" "}
            {allAdminPages
              .filter((p) => !myPages.some((m) => m.href === p.href))
              .map((p) => p.label)
              .join(", ")}
            .
          </p>
        ) : null}
      </Section>

      <Section id="phone" title="On a phone">
        <ul>
          <li>The bottom bar has the main pages; Menu opens the rest.</li>
          <li>Take a photo of a bill straight from Upload.</li>
          <li>
            Install EmeilSG: in Chrome or Edge on Android, &quot;Install app&quot;; on an iPhone,
            Share → Add to Home Screen. It needs a connection; offline it says so.
          </li>
        </ul>
      </Section>

      <Section id="trouble" title="Common errors and what to do">
        <dl className="space-y-2">
          {[
            [
              "“No reporting period is open”",
              "Uploads need an open period. Ask your administrator to open one, or check whether the late-upload date has passed.",
            ],
            [
              "The upload is refused",
              `Only PDF, JPG and PNG up to ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB, not password-protected. Too many uploads in a short time also pauses uploading for a few minutes.`,
            ],
            [
              "OCR failed or values are missing",
              "Upload a clearer copy (flat, well lit, all of the page), or enter the values by hand with a reason.",
            ],
            [
              "Confirm is disabled",
              "It says which value is left: edit it or mark it correct, and choose the document type if asked.",
            ],
            [
              "“Not calculated yet”",
              "There is no conversion factor for that activity and period. A Super Admin adds one; the record is calculated when it is approved.",
            ],
            [
              "Flagged as a duplicate",
              "The same file or the same bill already exists. A reviewer decides; upload a corrected bill as a new version.",
            ],
            [
              "“This account is signed in on another device”",
              "Continue to end the other sign-in, or cancel and keep it.",
            ],
            [
              "Signed out unexpectedly",
              `Sessions end after ${hours(facts.session.idleMinutes)} idle or ${hours(facts.session.absoluteMinutes)} in all, or when the account is signed in elsewhere. Sign in again; you return to the same page.`,
            ],
            [
              "The invitation link does not work",
              `Links work once, for ${facts.invitationHours} hours. Ask an administrator to send a new one.`,
            ],
            [
              "A report failed",
              "Its page names the reason (for example a BRSR question with no mapping). Fix that and generate again.",
            ],
          ].map(([term, detail]) => (
            <div key={term} className="rounded-md border border-border p-3">
              <dt className="font-medium">{term}</dt>
              <dd className="text-muted-foreground">{detail}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="faq" title="Questions">
        <FaqList>
          <Faq q="Do I type ESG figures into forms?">
            <p>
              No. Figures come from uploaded documents. Only BRSR&apos;s written answers and a few
              yearly inputs (turnover, assurance) are typed by administrators.
            </p>
          </Faq>
          <Faq q="Does the AI decide anything?">
            <p>
              No. OCR proposes values and a person confirms them; calculations are fixed formulas;
              suggestions are decision support. The assistant only reads.
            </p>
          </Faq>
          <Faq q="Can I change a value after it is approved?">
            <p>
              Not directly. An administrator can return it while it is still in review; after
              approval a correction is a new upload. Every change is in the audit trail.
            </p>
          </Faq>
          <Faq q="Who can see my uploads?">
            <p>
              You, and people assigned to your unit or a unit above it, as far as their role allows.
              Nobody in a sibling unit.
            </p>
          </Faq>
          <Faq q="Is the BRSR readiness score official?">
            <p>No. It is an internal management indicator of how complete the evidence is.</p>
          </Faq>
          <Faq q="Can I create my own account?">
            <p>
              No. An administrator invites you, and the email link lets you choose your password.
              Use Forgot password on the sign-in page if you lose it.
            </p>
          </Faq>
          <Faq q="Does my document leave EmeilSG to be read?">
            <p>
              No. OCR runs on EmeilSG&apos;s own worker, and the file stays in private storage that
              only signed-in people in your scope can open.
            </p>
          </Faq>
          <Faq q="What happens if I upload the same bill twice?">
            <p>
              It is accepted and flagged as a duplicate, naming the earlier record. A reviewer
              accepts it or returns it; nothing is counted twice without a person deciding.
            </p>
          </Faq>
        </FaqList>
      </Section>
    </div>
  );
}
