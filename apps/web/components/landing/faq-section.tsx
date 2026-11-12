import { ChevronDown } from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";

const FAQS = [
  {
    q: "Do users have to fill in ESG forms?",
    a: "No. The only submission method is uploading a document. The system extracts the values and the user verifies them.",
  },
  {
    q: "Can OCR errors reach a report?",
    a: "No. Extracted values are provisional until a person confirms them. Low-confidence fields must be reviewed before confirmation.",
  },
  {
    q: "Where do the emission factors come from?",
    a: "From a versioned factor library that your administrators maintain, each with a source reference and effective dates. Nothing is hard-coded.",
  },
  {
    q: "Is the BRSR readiness score an official score?",
    a: "No. It is an internal management indicator of data completeness, evidence and approvals, not a regulatory score.",
  },
];

export function FaqSection() {
  return (
    <section className="bg-white px-3 sm:px-6 lg:px-8 py-14 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <SectionHeading eyebrow="Questions" title="What reviewers usually ask" />
        <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="group px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
