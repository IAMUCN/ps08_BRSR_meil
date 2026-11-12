import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { HeroCapabilityCard } from "@/components/landing/capability-card";
import { BlurFade } from "@/components/ui/blur-fade";
import { DemoRequestButton } from "@/components/landing/demo-request";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white pb-20 pt-14 lg:pb-28 lg:pt-20">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]"
      />
      <div className="pointer-events-none absolute -top-32 right-0 -z-10 h-[480px] w-[480px] rounded-full bg-[#313490]/[0.06] blur-3xl" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-12 lg:gap-8">
          <div className="flex flex-col items-start lg:col-span-7">
            <BlurFade>
              <span className="mb-5 inline-flex items-center gap-2 rounded-2xl border border-[#313490]/15 bg-[#313490]/[0.06] px-3.5 py-1.5 sm:rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] text-[#313490] sm:text-xs sm:tracking-[0.14em]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-balance">One platform. Every document. Real impact.</span>
              </span>
            </BlurFade>

            <BlurFade delay={0.08}>
              <h1 className="font-display mb-6 text-4xl font-bold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl lg:text-[52px] xl:text-[64px]">
                From Real Documents
                <br />
                to Real Impact.
              </h1>
            </BlurFade>

            <BlurFade delay={0.16}>
              <p className="mb-8 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                EmeilSG uses AI and human verification to convert operational documents into
                accurate ESG data and BRSR-ready reports for MEIL&apos;s infrastructure enterprise.
              </p>
            </BlurFade>

            <BlurFade delay={0.24} className="w-full sm:w-auto">
              <div className="mb-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                <DemoRequestButton className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#E91029] px-7 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#d00e24] hover:shadow-md">
                  Request a demo <ArrowRight className="h-4 w-4" />
                </DemoRequestButton>
                <Link
                  href="#how-it-works"
                  draggable={false}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-7 py-3.5 text-base font-semibold text-slate-800 transition-colors hover:border-[#313490] hover:text-[#313490]"
                >
                  See how it works
                </Link>
              </div>
            </BlurFade>

            <BlurFade delay={0.32}>
              <ul className="flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:gap-x-6">
                {[
                  "OCR assists, people verify",
                  "Calculations are deterministic",
                  "Every edit is audited",
                ].map((point) => (
                  <li key={point} className="inline-flex items-center gap-1.5">
                    <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
            </BlurFade>
          </div>

          <BlurFade
            delay={0.2}
            className="relative flex justify-center lg:col-span-5 lg:justify-end lg:self-start"
          >
            <HeroCapabilityCard />
          </BlurFade>
        </div>
      </div>
    </section>
  );
}
