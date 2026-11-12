"use client";

import { useState, useEffect } from "react";
import {
  FileCheck2,
  Sparkles,
  UserCheck,
  Calculator,
  Layers,
  CheckCircle2,
  Network,
  Database,
  History,
  TrendingUp,
  ShieldAlert,
  HardHat,
} from "lucide-react";

export interface CapabilityItem {
  id: string;
  category: string;
  title: string;
  description: string;
  metricLabel: string;
  metricValue: string;
  icon: typeof FileCheck2;
  accentColor: string;
  tagColor: string;
}

export const CAPABILITIES: CapabilityItem[] = [
  {
    id: "01",
    category: "TRACEABILITY & AUDIT",
    title: "Evidence-First Reporting",
    description: "Every reported value is linked to its source.",
    metricLabel: "Lineage Integrity",
    metricValue: "100% Linked to Source PDF",
    icon: FileCheck2,
    accentColor: "text-blue-600 bg-blue-50 border-blue-100",
    tagColor: "text-blue-700 bg-blue-50/80 border-blue-200/60",
  },
  {
    id: "02",
    category: "INTELLIGENT OCR",
    title: "AI-Powered Extraction",
    description: "Extract ESG data from operational documents.",
    metricLabel: "Document Parser",
    metricValue: "Electricity, Fuel, Travel & Waste",
    icon: Sparkles,
    accentColor: "text-sky-600 bg-sky-50 border-sky-100",
    tagColor: "text-sky-700 bg-sky-50/80 border-sky-200/60",
  },
  {
    id: "03",
    category: "VERIFICATION",
    title: "Human-Verified Data",
    description: "AI assists. People confirm.",
    metricLabel: "Validation Gate",
    metricValue: "Verify, then approve",
    icon: UserCheck,
    accentColor: "text-emerald-600 bg-emerald-50 border-emerald-100",
    tagColor: "text-emerald-700 bg-emerald-50/80 border-emerald-200/60",
  },
  {
    id: "04",
    category: "CALCULATION ENGINE",
    title: "Deterministic Calculations",
    description: "Consistent calculations using controlled factors.",
    metricLabel: "Standards Basis",
    metricValue: "Versioned conversion factors",
    icon: Calculator,
    accentColor: "text-indigo-600 bg-indigo-50 border-indigo-100",
    tagColor: "text-indigo-700 bg-indigo-50/80 border-indigo-200/60",
  },
  {
    id: "05",
    category: "GHG ACCOUNTING",
    title: "Scope 1, 2 & 3",
    description: "Track and classify emissions across operations.",
    metricLabel: "Coverage",
    metricValue: "Direct, Grid & Value-Chain Footprint",
    icon: Layers,
    accentColor: "text-amber-600 bg-amber-50 border-amber-100",
    tagColor: "text-amber-700 bg-amber-50/80 border-amber-200/60",
  },
  {
    id: "06",
    category: "REGULATORY COMPLIANCE",
    title: "BRSR Mapping",
    description: "Connect ESG data to relevant BRSR indicators.",
    metricLabel: "Framework",
    metricValue: "Mapped to BRSR indicators",
    icon: CheckCircle2,
    accentColor: "text-emerald-600 bg-emerald-50 border-emerald-100",
    tagColor: "text-emerald-700 bg-emerald-50/80 border-emerald-200/60",
  },
  {
    id: "07",
    category: "ORGANIZATION HIERARCHY",
    title: "Multi-Entity Management",
    description: "Manage subsidiaries, projects and business units.",
    metricLabel: "Structure",
    metricValue: "Group, Division & Site-Level Rollup",
    icon: Network,
    accentColor: "text-slate-700 bg-slate-100 border-slate-200",
    tagColor: "text-slate-700 bg-slate-100/90 border-slate-200",
  },
  {
    id: "08",
    category: "DATA REPOSITORY",
    title: "Centralized ESG Data",
    description: "Consolidate sustainability information across the organization.",
    metricLabel: "Architecture",
    metricValue: "Single Authoritative Data Store",
    icon: Database,
    accentColor: "text-blue-600 bg-blue-50 border-blue-100",
    tagColor: "text-blue-700 bg-blue-50/80 border-blue-200/60",
  },
  {
    id: "09",
    category: "GOVERNANCE",
    title: "Complete Audit Trail",
    description: "Trace reported numbers back to their evidence.",
    metricLabel: "Audit Readiness",
    metricValue: "Immutable Timestamped Records",
    icon: History,
    accentColor: "text-slate-700 bg-slate-100 border-slate-200",
    tagColor: "text-slate-700 bg-slate-100/90 border-slate-200",
  },
  {
    id: "10",
    category: "READINESS ASSESSMENT",
    title: "BRSR Readiness",
    description: "Identify reporting gaps before deadlines.",
    metricLabel: "Status Monitor",
    metricValue: "Continuous Metric Completeness Check",
    icon: TrendingUp,
    accentColor: "text-emerald-600 bg-emerald-50 border-emerald-100",
    tagColor: "text-emerald-700 bg-emerald-50/80 border-emerald-200/60",
  },
  {
    id: "11",
    category: "SECURITY & ACCESS",
    title: "Role-Based Access",
    description: "Give every team the access they need.",
    metricLabel: "Access Model",
    metricValue: "Row-Level Security & Node Scoping",
    icon: ShieldAlert,
    accentColor: "text-blue-600 bg-blue-50 border-blue-100",
    tagColor: "text-blue-700 bg-blue-50/80 border-blue-200/60",
  },
  {
    id: "12",
    category: "INFRASTRUCTURE SCALE",
    title: "Enterprise Scale",
    description: "Built for complex infrastructure organizations.",
    metricLabel: "Enterprise Capacity",
    metricValue: "Portfolio-Wide Deployment for MEIL",
    icon: HardHat,
    accentColor: "text-amber-700 bg-amber-50 border-amber-200",
    tagColor: "text-amber-800 bg-amber-50/80 border-amber-200/60",
  },
];

const ROTATION_INTERVAL_MS = 2800;

// Five layers: the front card sits left and centred, the two neighbours on each side sit behind it
// and slide right as they recede, fading away from the front. Same-width cards, flush layout.
const CARD_HEIGHT = 196;
const OFFSET_Y = [0, 100, 128, 150]; // px from the front card's centre, by distance (3 = parked, hidden)
const OFFSET_X = [0, 12, 27, 27]; // % of card width
// Level 1 (front) is solid. Level 2 is frosted glass: crisp itself, it blurs whatever sits behind it.
// Level 3 sits behind the glass at half opacity.
const LEVEL_OPACITY = [1, 1, 0.5];
const GLASS_ALPHA = [1, 0.7, 1];
const GLASS_BLUR = [0, 8, 0]; // px, backdrop blur
// Level 3 is sharp only where level 2 does not cover it (a 52px strip plus the right 15%);
// everywhere else it is blurred, so level 2 reads as glass. The polygons share a vertex count so they animate.
const CLIP = {
  top: "polygon(0 0, 100% 0, 100% 100%, 85% 100%, 85% 52px, 0 52px)",
  bottom: "polygon(0 calc(100% - 52px), 85% calc(100% - 52px), 85% 0, 100% 0, 100% 100%, 0 100%)",
  fullTop: "polygon(0 0, 100% 0, 100% 100%, 85% 100%, 85% 100%, 0 100%)",
  fullBottom: "polygon(0 0, 85% 0, 85% 0, 100% 0, 100% 100%, 0 100%)",
};
const SHADOWS = [
  "shadow-[10px_14px_22px_-10px_rgba(15,23,42,0.28)]",
  "shadow-[8px_10px_16px_-8px_rgba(15,23,42,0.2)]",
  "shadow-[6px_7px_12px_-7px_rgba(15,23,42,0.14)]",
];

export function HeroCapabilityCard() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const isPaused = hovered || focused;
  const total = CAPABILITIES.length;

  useEffect(() => {
    if (isPaused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setCurrentIndex((i) => (i + 1) % total), ROTATION_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPaused, total]);

  // Shortest circular distance from the front card, so the stack loops forever.
  const getDiff = (idx: number): number => {
    let diff = (idx - currentIndex) % total;
    if (diff > total / 2) diff -= total;
    if (diff < -total / 2) diff += total;
    return diff;
  };

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Platform capabilities"
      className="relative h-[430px] sm:h-[460px] w-full max-w-[500px] select-none mx-auto"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <div className="pointer-events-none absolute -left-4 -right-4 top-1/2 -z-10 h-[340px] sm:h-[380px] -translate-y-1/2 rounded-full bg-gradient-to-tr from-indigo-100/50 via-sky-50/40 to-transparent blur-3xl" />

      {CAPABILITIES.map((item, idx) => {
        const diff = getDiff(idx);
        const absDiff = Math.abs(diff);
        const slot = Math.min(absDiff, 3);
        const y = Math.sign(diff) * OFFSET_Y[slot];
        const Icon = item.icon;
        const body = (
          <div className="flex h-full flex-col justify-between p-5">
            <div className="flex items-start gap-3.5">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${item.accentColor}`}
              >
                <Icon className="h-5 w-5 stroke-[2]" />
              </div>
              <div className="min-w-0">
                <span
                  className={`mb-1 inline-block rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] ${item.tagColor}`}
                >
                  {item.category}
                </span>
                <h2 className="text-base sm:text-lg font-bold leading-snug tracking-tight text-slate-900">
                  {item.title}
                </h2>
              </div>
            </div>

            <p className="text-xs sm:text-sm leading-relaxed text-slate-600 line-clamp-2">
              {item.description}
            </p>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200/70 bg-slate-50/90 px-3 py-2 text-xs">
              <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {item.metricLabel}
              </span>
              <span className="truncate text-right font-bold text-slate-800">
                {item.metricValue}
              </span>
            </div>
          </div>
        );

        return (
          <div
            key={item.id}
            style={{
              top: "50%",
              left: 0,
              width: "calc(100% / 1.27)",
              height: CARD_HEIGHT,
              marginTop: -CARD_HEIGHT / 2,
              transform: `translate(${OFFSET_X[slot]}%, ${y}px)`,
              zIndex: 30 - absDiff * 10,
              opacity: absDiff > 2 ? 0 : LEVEL_OPACITY[absDiff],
              backgroundColor: `rgba(255,255,255,${GLASS_ALPHA[Math.min(absDiff, 2)]})`,
              backdropFilter: `blur(${GLASS_BLUR[Math.min(absDiff, 2)]}px)`,
              WebkitBackdropFilter: `blur(${GLASS_BLUR[Math.min(absDiff, 2)]}px)`,
              pointerEvents: absDiff > 2 ? "none" : "auto",
              transition:
                "transform 0.7s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.5s ease, background-color 0.7s ease, backdrop-filter 0.7s ease",
            }}
            className={`absolute overflow-hidden rounded-2xl border border-slate-200/90 ${SHADOWS[Math.min(absDiff, 2)]}`}
          >
            {diff !== 0 && absDiff <= 2 && (
              <button
                type="button"
                onClick={() => setCurrentIndex(idx)}
                aria-label={`Show ${item.title}`}
                className="absolute inset-0 z-10 cursor-pointer"
              />
            )}

            <div className="relative h-full" aria-hidden={diff !== 0}>
              {absDiff === 2 && (
                <div aria-hidden className="absolute inset-0" style={{ filter: "blur(5px)" }}>
                  {body}
                </div>
              )}
              <div
                className="absolute inset-0"
                style={{
                  clipPath:
                    absDiff === 2
                      ? CLIP[diff < 0 ? "top" : "bottom"]
                      : diff > 0
                        ? CLIP.fullBottom
                        : CLIP.fullTop,
                  transition: "clip-path 0.7s ease",
                }}
              >
                {body}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
