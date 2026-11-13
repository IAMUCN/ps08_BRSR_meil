import { FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireDisclosureSession } from "@/lib/auth/session";
import { canEditDisclosures, canEnterFinancialInputs } from "@/lib/auth/workspace";
import { financialYearLabel } from "@/lib/consolidation/aggregate";
import { PRINCIPLE_TITLES } from "@/lib/brsr/principles";
import { api } from "@/lib/trpc/server";
import { ReportInputsForm } from "../reports/report-inputs-form";
import { DisclosureAnswer } from "./disclosure-answer";
import { TypedTables } from "./typed-tables";

export const metadata: Metadata = { title: "BRSR Disclosures · EmeilSG" };

// The written part of SEBI's BRSR format (.grill/full-brsr-report-decisions.md, A28): every question of
// Sections A, B and C, with the answer an Admin types for one financial year. Figures the app measures are
// never typed here — they come from approved records.
export default async function DisclosuresPage({ searchParams }: PageProps<"/admin/disclosures">) {
  const [session, caller, params] = await Promise.all([
    requireDisclosureSession(),
    api(),
    searchParams,
  ]);
  // Finance and HR open this page without the Reports permission, so the years come from here.
  const { years, defaultYear } = await caller.brsr.disclosureYears();
  const asked = Number(params.year);
  const year = years.includes(asked) ? asked : (defaultYear ?? years[0] ?? null);

  if (year === null) {
    return (
      <EmptyState
        icon={FileText}
        title="No reporting periods yet"
        message="Disclosures are kept per financial year. Create a reporting period first."
        link={{ href: "/admin/reporting-periods", label: "Reporting Periods" }}
      />
    );
  }

  // The yearly financial inputs sit here for whoever may enter them; the written answers for whoever may type
  // them. Each procedure checks again, and a person sees only the questions their permission owns.
  const inputs = canEnterFinancialInputs(session)
    ? await caller.reports.inputs({ financialYear: year })
    : null;
  const sections = canEditDisclosures(session)
    ? await caller.brsr.disclosures({ financialYear: year })
    : [];
  // SEBI's typed tables (migration 0087): the ones this person may write.
  const tables = canEditDisclosures(session)
    ? await caller.brsrTables.list({ financialYear: year })
    : [];
  const all = sections.flatMap((s) => s.indicators);
  const typed = all.filter((i) => i.kind === "statement");
  const answered = typed.filter((i) => i.answer).length;
  const firstOpen = sections.find((s) =>
    s.indicators.some((i) => i.kind === "statement" && !i.answer),
  )?.code;

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader
        title="BRSR Disclosures"
        description="Every question of SEBI's BRSR format. Type the written answers once per financial year; the report prints them in SEBI's order beside the figures the app measures. A question left empty prints as “Not reported”."
      />
      <nav aria-label="Financial year" className="flex flex-wrap gap-1 border-b">
        {years.map((y) => (
          <Link
            key={y}
            href={`/admin/disclosures?year=${y}`}
            aria-current={y === year ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              y === year
                ? "border-primary text-primary-text"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {financialYearLabel(y)}
          </Link>
        ))}
      </nav>
      {inputs ? <ReportInputsForm years={years} initialYear={year} initial={inputs} /> : null}
      <TypedTables financialYear={year} yearLabel={financialYearLabel(year)} tables={tables} />
      {sections.length > 0 ? (
        <p className="text-sm leading-5 text-muted-foreground">
          {answered} of {typed.length} written answers entered for {financialYearLabel(year)}.
          {session.isAdmin
            ? ` ${all.length - typed.length} more questions are filled from approved records.`
            : " You see the questions your role answers; a Super Admin answers the rest."}
        </p>
      ) : null}

      {sections.map((section) => {
        const done = section.indicators.filter((i) => i.answer).length;
        return (
          <details
            key={section.code}
            // The first section with something left to answer starts open.
            open={section.code === firstOpen}
            className="rounded-md border bg-card"
          >
            <summary className="cursor-pointer px-4 py-3 text-base leading-6 font-semibold">
              Section {section.code} — {section.name}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {done} of {section.indicators.length} answered
              </span>
            </summary>
            <div className="space-y-6 border-t px-4 py-4">
              {section.indicators.map((i, index) => {
                const previous = section.indicators[index - 1];
                const heading =
                  i.principle !== null && i.principle !== previous?.principle
                    ? `Principle ${i.principle}: ${PRINCIPLE_TITLES[i.principle - 1]}`
                    : i.part && i.part !== previous?.part
                      ? i.part
                      : null;
                return (
                  <div key={i.id} id={`q-${i.code}`} className="scroll-mt-4 space-y-2">
                    {heading ? (
                      <h3 className="border-b pb-1 text-sm leading-5 font-semibold">{heading}</h3>
                    ) : null}
                    <DisclosureAnswer
                      key={`${i.id}-${year}`}
                      indicatorId={i.id}
                      financialYear={year}
                      code={i.code}
                      type={i.indicatorType}
                      question={i.questionText}
                      measured={i.kind === "data"}
                      initial={i.answer ?? ""}
                    />
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
