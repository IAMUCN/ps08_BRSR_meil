import { Leaf, Users, Shield } from "lucide-react";
import { BlurFade } from "@/components/ui/blur-fade";
import { SectionHeading } from "@/components/landing/section-heading";

const PILLARS = [
  {
    icon: Leaf,
    title: "Environmental",
    text: "Energy, emissions, water, waste",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  },
  {
    icon: Users,
    title: "Social",
    text: "Workforce, communities, health and safety",
    tone: "bg-amber-50 text-amber-700 ring-amber-100",
  },
  {
    icon: Shield,
    title: "Governance",
    text: "Policies, ethics, responsible conduct",
    tone: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  },
];

export function WhatIsBrsrSection() {
  return (
    <section id="brsr" className="bg-slate-50/70 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <SectionHeading eyebrow="Aligned to BRSR" title="Built around SEBI's BRSR framework">
          BRSR is a mapping layer in EmeilSG, not hard-coded questions. When reporting requirements
          change, the mapping changes, not the application.
        </SectionHeading>
        <div className="grid gap-4 sm:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, text, tone }, i) => (
            <BlurFade inView key={title} delay={i * 0.06}>
              <div className="h-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xs">
                <span
                  className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ring-1 ${tone}`}
                >
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                <p className="mt-1 text-sm text-slate-600">{text}</p>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}
