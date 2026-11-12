import { X, Check } from "lucide-react";
import { BlurFade } from "@/components/ui/blur-fade";
import { SectionHeading } from "@/components/landing/section-heading";

const TODAY = [
  "Spreadsheets and emailed bills, re-keyed every period",
  "The same metric calculated differently on each project",
  "Gaps found close to the filing deadline",
  "A reported figure that is hard to defend to an auditor",
];

const WITH_TRACE = [
  "One action for field teams: upload the document they already have",
  "One calculation engine and one versioned factor library",
  "Completeness and evidence coverage visible all year",
  "Click any figure to reach the original document",
];

export function ProblemSection() {
  return (
    <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="The reporting problem"
          title="ESG data collection does not scale by spreadsheet"
        >
          Hundreds of projects produce the evidence. Collecting it, reconciling it and defending it
          is where the effort goes.
        </SectionHeading>

        <div className="grid gap-5 md:grid-cols-2">
          <BlurFade inView className="rounded-2xl border border-slate-200 bg-slate-50/60 p-7">
            <h3 className="mb-5 text-sm font-semibold uppercase tracking-wider text-slate-500">
              Today
            </h3>
            <ul className="space-y-4">
              {TODAY.map((t) => (
                <li
                  key={t}
                  className="flex items-start gap-3 text-sm leading-relaxed text-slate-700"
                >
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-[#E91029]" />
                  {t}
                </li>
              ))}
            </ul>
          </BlurFade>

          <BlurFade
            inView
            delay={0.1}
            className="rounded-2xl border border-[#313490]/20 bg-[#313490]/[0.03] p-7 shadow-sm"
          >
            <h3 className="mb-5 text-sm font-semibold uppercase tracking-wider text-[#313490]">
              With EmeilSG
            </h3>
            <ul className="space-y-4">
              {WITH_TRACE.map((t) => (
                <li
                  key={t}
                  className="flex items-start gap-3 text-sm leading-relaxed text-slate-800"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  {t}
                </li>
              ))}
            </ul>
          </BlurFade>
        </div>
      </div>
    </section>
  );
}
