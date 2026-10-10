import { Upload, ScanText, UserCheck, Calculator, Link2, FileText } from "lucide-react";
import { BlurFade } from "@/components/ui/blur-fade";
import { SectionHeading } from "@/components/landing/section-heading";

const STEPS = [
  {
    icon: Upload,
    title: "Upload",
    text: "Teams upload the bill, invoice or certificate they already have.",
  },
  {
    icon: ScanText,
    title: "Extract",
    text: "OCR reads the document and scores each field's confidence.",
  },
  { icon: UserCheck, title: "Verify", text: "A person confirms or corrects every flagged value." },
  {
    icon: Calculator,
    title: "Calculate",
    text: "Validated data meets a versioned factor. Same input, same result.",
  },
  { icon: Link2, title: "Map", text: "Results roll up the hierarchy and map to BRSR indicators." },
  {
    icon: FileText,
    title: "Report",
    text: "Generate the report, then drill from any figure to its source.",
  },
];

export function ProcessStepsSection() {
  return (
    <section id="how-it-works" className="bg-slate-50/70 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow="How it works" title="From document to disclosure in six steps">
          No manual ESG forms. Every stage is recorded, so the number can always be explained.
        </SectionHeading>

        <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title}>
              <BlurFade inView delay={i * 0.06} className="h-full">
                <div className="group h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-xs transition-all hover:-translate-y-0.5 hover:border-[#313490]/30 hover:shadow-md">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#313490]/[0.08] text-[#313490]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-400">0{i + 1}</span>
                  </div>
                  <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{text}</p>
                </div>
              </BlurFade>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
