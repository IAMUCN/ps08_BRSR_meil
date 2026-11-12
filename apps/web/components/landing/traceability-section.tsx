"use client";

import { createRef, forwardRef, useMemo, useRef } from "react";
import { FileText, ScanText, UserCheck, Calculator, Layers, ClipboardCheck } from "lucide-react";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { BlurFade } from "@/components/ui/blur-fade";
import { SectionHeading } from "@/components/landing/section-heading";

type Icon = typeof FileText;

// Illustrative example. The same chain exists for every reported value.
const CHAIN: { icon: Icon; label: string; value: string }[] = [
  { icon: ClipboardCheck, label: "BRSR indicator", value: "Energy and emissions disclosure" },
  { icon: Layers, label: "Organization total", value: "Group → Subsidiary → Project" },
  { icon: Calculator, label: "Calculation", value: "Quantity × factor, factor version stored" },
  { icon: UserCheck, label: "Verified value", value: "102,430 kWh, confirmed by a named user" },
  { icon: ScanText, label: "OCR extraction", value: "Original value and confidence kept" },
  {
    icon: FileText,
    label: "Original document",
    value: "Electricity bill, unaltered evidence file",
  },
];

const Node = forwardRef<HTMLDivElement, { item: (typeof CHAIN)[number]; last?: boolean }>(
  function Node({ item, last }, ref) {
    const Icon = item.icon;
    return (
      <div
        ref={ref}
        className={`relative z-10 flex items-center gap-3 sm:gap-4 rounded-xl border bg-white p-3 sm:p-4 shadow-xs ${
          last ? "border-emerald-300 ring-2 ring-emerald-100" : "border-slate-200"
        }`}
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            last ? "bg-emerald-50 text-emerald-700" : "bg-[#313490]/[0.08] text-[#313490]"
          }`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {item.label}
          </span>
          <span className="block text-xs sm:text-sm font-medium text-slate-900 leading-snug">
            {item.value}
          </span>
        </span>
      </div>
    );
  },
);

export function TraceabilitySection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const refs = useMemo(() => CHAIN.map(() => createRef<HTMLDivElement>()), []);

  return (
    <section id="traceability" className="bg-white px-3 sm:px-6 lg:px-8 py-14 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Traceability"
          title="Click a reported number. Land on the original bill."
        >
          The chain behind every figure is stored, not reconstructed. Auditors and assurance teams
          can walk it in either direction.
        </SectionHeading>

        <div className="grid items-start gap-10 lg:grid-cols-12">
          <BlurFade inView className="min-w-0 lg:sticky lg:top-28 lg:col-span-5 lg:pt-12">
            <ul className="space-y-5 border-l-2 border-[#313490]/15 pl-5 text-sm leading-relaxed text-slate-600">
              <li>
                <strong className="block text-base font-semibold text-slate-900">
                  Nothing is silently overwritten
                </strong>
                Edits, returns and approvals are logged with who, when and why.
              </li>
              <li>
                <strong className="block text-base font-semibold text-slate-900">
                  Reproducible by design
                </strong>
                Each result keeps its input, normalized value, factor version and formula version.
              </li>
              <li>
                <strong className="block text-base font-semibold text-slate-900">
                  Built for assurance
                </strong>
                Evidence stays attached to the record that cites it.
              </li>
            </ul>
          </BlurFade>

          <BlurFade inView delay={0.1} className="min-w-0 lg:col-span-7">
            <div className="mb-3 flex items-center justify-between">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                Illustrative example
              </span>
            </div>
            <div
              ref={containerRef}
              className="relative flex flex-col gap-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-5 sm:p-6"
            >
              {CHAIN.map((item, i) => (
                <Node key={item.label} ref={refs[i]} item={item} last={i === CHAIN.length - 1} />
              ))}
              {refs.slice(0, -1).map((from, i) => (
                <AnimatedBeam
                  key={i}
                  containerRef={containerRef}
                  fromRef={from}
                  toRef={refs[i + 1]}
                  duration={3.5}
                  delay={i * 0.4}
                  pathColor="#cbd5e1"
                  gradientStartColor="#313490"
                  gradientStopColor="#10b981"
                />
              ))}
            </div>
          </BlurFade>
        </div>
      </div>
    </section>
  );
}
