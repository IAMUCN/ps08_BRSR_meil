import { FileCheck, UserCheck, Calculator, Building2, ClipboardCheck } from "lucide-react";
import { BlurFade } from "@/components/ui/blur-fade";

const BADGES = [
  { icon: FileCheck, title: "Evidence-first", text: "Every number links to a source document." },
  { icon: UserCheck, title: "Human-verified", text: "AI extracts. Your team confirms." },
  { icon: Calculator, title: "Deterministic", text: "Versioned factors, reproducible results." },
  { icon: Building2, title: "Built to scale", text: "Roll-up across your whole hierarchy." },
  { icon: ClipboardCheck, title: "BRSR-ready", text: "Metrics map to BRSR indicators." },
];

export function TrustBadgesSection() {
  return (
    <section
      aria-label="Principles"
      className="border-y border-slate-200/70 bg-slate-50/70 px-4 py-8 sm:py-10 sm:px-6 lg:px-8"
    >
      <ul className="mx-auto grid max-w-7xl grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 sm:gap-6">
        {BADGES.map(({ icon: Icon, title, text }, i) => (
          <li key={title}>
            <BlurFade inView delay={i * 0.06} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#313490] shadow-2xs ring-1 ring-slate-200">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">{title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{text}</span>
              </span>
            </BlurFade>
          </li>
        ))}
      </ul>
    </section>
  );
}
