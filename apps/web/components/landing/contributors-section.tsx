import { HardHat, Droplets, Users2, Landmark, Handshake, FileBarChart } from "lucide-react";
import { BlurFade } from "@/components/ui/blur-fade";
import { SectionHeading } from "@/components/landing/section-heading";

const ROLES = [
  {
    title: "Project Manager",
    icon: HardHat,
    text: "Fuel and electricity evidence for assigned projects.",
  },
  {
    title: "EHS / Environment",
    icon: Droplets,
    text: "Water, waste, emissions and safety records.",
  },
  { title: "HR", icon: Users2, text: "Workforce, turnover and training documents." },
  {
    title: "Finance / CSR",
    icon: Landmark,
    text: "CSR spend, beneficiaries, fines and penalties.",
  },
  {
    title: "Procurement",
    icon: Handshake,
    text: "Vendor classification and local sourcing evidence.",
  },
  {
    title: "Corporate ESG",
    icon: FileBarChart,
    text: "Cross-entity review and reporting readiness.",
  },
];

export function ContributorsSection() {
  return (
    <section id="roles" className="bg-slate-50/70 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow="Roles and access" title="Each team sees only what it owns">
          Access follows role and organizational scope, so a project user never sees another
          project&apos;s data.
        </SectionHeading>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map(({ title, icon: Icon, text }, i) => (
            <BlurFade inView key={title} delay={i * 0.05}>
              <div className="flex h-full items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:border-[#313490]/30 hover:shadow-md">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#313490]/[0.08] text-[#313490]">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{text}</p>
                </div>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}
