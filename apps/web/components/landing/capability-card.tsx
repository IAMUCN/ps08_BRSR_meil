'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

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
    id: '01',
    category: 'TRACEABILITY & AUDIT',
    title: 'Evidence-First Reporting',
    description: 'Every reported value is linked to its source.',
    metricLabel: 'Lineage Integrity',
    metricValue: '100% Linked to Source PDF',
    icon: FileCheck2,
    accentColor: 'text-blue-600 bg-blue-50 border-blue-100',
    tagColor: 'text-blue-700 bg-blue-50/80 border-blue-200/60',
  },
  {
    id: '02',
    category: 'INTELLIGENT OCR',
    title: 'AI-Powered Extraction',
    description: 'Extract ESG data from operational documents.',
    metricLabel: 'Document Parser',
    metricValue: 'Electricity, Fuel, Travel & Waste',
    icon: Sparkles,
    accentColor: 'text-sky-600 bg-sky-50 border-sky-100',
    tagColor: 'text-sky-700 bg-sky-50/80 border-sky-200/60',
  },
  {
    id: '03',
    category: 'VERIFICATION',
    title: 'Human-Verified Data',
    description: 'AI assists. People confirm.',
    metricLabel: 'Validation Gate',
    metricValue: 'Dual-Step Human Confirmation',
    icon: UserCheck,
    accentColor: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    tagColor: 'text-emerald-700 bg-emerald-50/80 border-emerald-200/60',
  },
  {
    id: '04',
    category: 'CALCULATION ENGINE',
    title: 'Deterministic Calculations',
    description: 'Consistent calculations using controlled factors.',
    metricLabel: 'Standards Basis',
    metricValue: 'CEA CO₂ & IPCC Emission Factors',
    icon: Calculator,
    accentColor: 'text-indigo-600 bg-indigo-50 border-indigo-100',
    tagColor: 'text-indigo-700 bg-indigo-50/80 border-indigo-200/60',
  },
  {
    id: '05',
    category: 'GHG ACCOUNTING',
    title: 'Scope 1, 2 & 3',
    description: 'Track and classify emissions across operations.',
    metricLabel: 'Coverage',
    metricValue: 'Direct, Grid & Value-Chain Footprint',
    icon: Layers,
    accentColor: 'text-amber-600 bg-amber-50 border-amber-100',
    tagColor: 'text-amber-700 bg-amber-50/80 border-amber-200/60',
  },
  {
    id: '06',
    category: 'REGULATORY COMPLIANCE',
    title: 'BRSR Mapping',
    description: 'Connect ESG data to relevant BRSR indicators.',
    metricLabel: 'Framework',
    metricValue: 'SEBI BRSR Core & Principle 6',
    icon: CheckCircle2,
    accentColor: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    tagColor: 'text-emerald-700 bg-emerald-50/80 border-emerald-200/60',
  },
  {
    id: '07',
    category: 'ORGANIZATION HIERARCHY',
    title: 'Multi-Entity Management',
    description: 'Manage subsidiaries, projects and business units.',
    metricLabel: 'Structure',
    metricValue: 'Group, Division & Site-Level Rollup',
    icon: Network,
    accentColor: 'text-slate-700 bg-slate-100 border-slate-200',
    tagColor: 'text-slate-700 bg-slate-100/90 border-slate-200',
  },
  {
    id: '08',
    category: 'DATA REPOSITORY',
    title: 'Centralized ESG Data',
    description: 'Consolidate sustainability information across the organization.',
    metricLabel: 'Architecture',
    metricValue: 'Single Authoritative Data Store',
    icon: Database,
    accentColor: 'text-blue-600 bg-blue-50 border-blue-100',
    tagColor: 'text-blue-700 bg-blue-50/80 border-blue-200/60',
  },
  {
    id: '09',
    category: 'GOVERNANCE',
    title: 'Complete Audit Trail',
    description: 'Trace reported numbers back to their evidence.',
    metricLabel: 'Audit Readiness',
    metricValue: 'Immutable Timestamped Records',
    icon: History,
    accentColor: 'text-slate-700 bg-slate-100 border-slate-200',
    tagColor: 'text-slate-700 bg-slate-100/90 border-slate-200',
  },
  {
    id: '10',
    category: 'READINESS ASSESSMENT',
    title: 'BRSR Readiness',
    description: 'Identify reporting gaps before deadlines.',
    metricLabel: 'Status Monitor',
    metricValue: 'Continuous Metric Completeness Check',
    icon: TrendingUp,
    accentColor: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    tagColor: 'text-emerald-700 bg-emerald-50/80 border-emerald-200/60',
  },
  {
    id: '11',
    category: 'SECURITY & ACCESS',
    title: 'Role-Based Access',
    description: 'Give every team the access they need.',
    metricLabel: 'Access Model',
    metricValue: 'Row-Level Security & Node Scoping',
    icon: ShieldAlert,
    accentColor: 'text-blue-600 bg-blue-50 border-blue-100',
    tagColor: 'text-blue-700 bg-blue-50/80 border-blue-200/60',
  },
  {
    id: '12',
    category: 'INFRASTRUCTURE SCALE',
    title: 'Enterprise Scale',
    description: 'Built for complex infrastructure organizations.',
    metricLabel: 'Enterprise Capacity',
    metricValue: 'Portfolio-Wide Deployment for MEIL',
    icon: HardHat,
    accentColor: 'text-amber-700 bg-amber-50 border-amber-200',
    tagColor: 'text-amber-800 bg-amber-50/80 border-amber-200/60',
  },
];

const ROTATION_INTERVAL_MS = 3800;

export function HeroCapabilityCard() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartY = useRef<number | null>(null);
  const lastWheelTime = useRef<number>(0);

  const total = CAPABILITIES.length;

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % total);
  }, [total]);

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  const jumpTo = useCallback((index: number) => {
    setCurrentIndex((index % total + total) % total);
  }, [total]);

  // Autoplay effect
  useEffect(() => {
    if (isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      goToNext();
    }, ROTATION_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, goToNext]);

  // Wheel handling: allow rolling when cursor is over the stack
  const handleWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaY) < 18) return;
    const now = Date.now();
    if (now - lastWheelTime.current < 400) return;
    lastWheelTime.current = now;
    if (e.deltaY > 0) {
      goToNext();
    } else {
      goToPrev();
    }
  };

  // Touch swipe handling
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchEndY - touchStartY.current;
    if (Math.abs(deltaY) > 35) {
      if (deltaY < 0) {
        goToNext();
      } else {
        goToPrev();
      }
    }
    touchStartY.current = null;
  };

  // Shortest circular difference between item index and currentIndex
  const getDiff = (idx: number): number => {
    let diff = (idx - currentIndex) % total;
    if (diff > total / 2) diff -= total;
    if (diff < -total / 2) diff += total;
    return diff;
  };

  // Shadow classes matching the tiered depth in reference image
  const getCardShadow = (diff: number) => {
    if (diff === 0) {
      return 'shadow-[-6px_14px_32px_rgba(15,23,42,0.12),-1px_4px_12px_rgba(15,23,42,0.06),0_0_0_1px_rgba(226,232,240,0.9)]';
    }
    if (Math.abs(diff) === 1) {
      return 'shadow-[-4px_8px_20px_rgba(15,23,42,0.08),-1px_2px_6px_rgba(15,23,42,0.04),0_0_0_1px_rgba(226,232,240,0.7)]';
    }
    if (Math.abs(diff) === 2) {
      return 'shadow-[-3px_4px_10px_rgba(15,23,42,0.05),0_0_0_1px_rgba(226,232,240,0.6)]';
    }
    return 'shadow-none';
  };

  return (
    <div
      className="capability-deck-container relative w-full max-w-[480px] sm:max-w-[500px] h-[465px] sm:h-[490px] mx-auto select-none"
      style={{
        ['--step-y' as string]: '34px',
        ['--step-x' as string]: '22px',
        ['--base-top' as string]: '68px',
        ['--card-h' as string]: '350px',
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Soft atmospheric background glow behind the card stack */}
      <div className="absolute top-1/2 -translate-y-1/2 -left-8 -right-4 h-[420px] rounded-full bg-gradient-to-tr from-blue-100/50 via-sky-50/40 to-indigo-50/30 blur-3xl -z-10 pointer-events-none" />

      {/* Layered Card Stack (Rolling Rolodex / Tiered Deck) */}
      <div className="relative w-full h-full">
        {CAPABILITIES.map((item, idx) => {
          const diff = getDiff(idx);
          const absDiff = Math.abs(diff);
          const isVisible = absDiff <= 2;
          const isNearby = absDiff <= 3;
          const IconComponent = item.icon;

          // Compute stack layering properties using responsive CSS variables
          const cardStyle: React.CSSProperties = {
            top: `calc(var(--base-top) + ${diff} * var(--step-y))`,
            width: `calc(100% - ${absDiff} * var(--step-x))`,
            height: 'var(--card-h)',
            zIndex: diff === 0 ? 30 : absDiff === 1 ? 20 : absDiff === 2 ? 10 : 0,
            opacity: absDiff > 2 ? 0 : 1,
            pointerEvents: isVisible ? 'auto' : 'none',
            transition:
              'top 0.65s cubic-bezier(0.16, 1, 0.3, 1), width 0.65s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.45s ease, box-shadow 0.65s ease',
          };

          if (!isNearby) {
            // Keep completely off-screen cards unmounted from the active rendering pipeline
            return null;
          }

          return (
            <div
              key={item.id}
              style={cardStyle}
              className={`absolute right-0 rounded-2xl sm:rounded-3xl bg-white border border-slate-200/90 overflow-hidden select-none ${getCardShadow(
                diff
              )}`}
            >
              {/* TOP PEEK TAB (Visible when card is peeking above active card: diff === -1 or -2) */}
              {diff < 0 && (
                <div
                  onClick={() => jumpTo(idx)}
                  className="h-[34px] px-3.5 sm:px-4 flex items-center justify-between text-xs cursor-pointer hover:bg-slate-50 transition-colors group/tab"
                  title={`Roll to ${item.title}`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-[10px] font-bold tracking-wider uppercase text-slate-500 group-hover/tab:text-slate-800 transition-colors truncate">
                      {item.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 group-hover/tab:text-blue-600 transition-colors shrink-0">
                    <span className="hidden sm:inline text-slate-500 font-semibold truncate max-w-[130px]">
                      {item.title}
                    </span>
                    <ChevronUp className="w-3.5 h-3.5 text-slate-500 group-hover/tab:-translate-y-0.5 transition-transform" />
                  </div>
                </div>
              )}

              {/* BOTTOM PEEK TAB (Visible when card is peeking below active card: diff === 1 or 2) */}
              {diff > 0 && (
                <div
                  onClick={() => jumpTo(idx)}
                  className="absolute bottom-0 left-0 right-0 h-[34px] px-3.5 sm:px-4 flex items-center justify-between text-xs cursor-pointer hover:bg-slate-50 transition-colors group/tab border-t border-slate-100"
                  title={`Roll to ${item.title}`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-[10px] font-bold text-slate-600 group-hover/tab:text-slate-900 transition-colors truncate">
                      {item.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 group-hover/tab:text-blue-600 transition-colors shrink-0">
                    <span className="hidden sm:inline text-slate-500">{item.metricLabel}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500 group-hover/tab:translate-y-0.5 transition-transform" />
                  </div>
                </div>
              )}

              {/* ACTIVE CARD FULL BODY (Rendered prominently when diff === 0) */}
              <div
                className={`p-6 sm:p-7 flex flex-col justify-between h-full transition-opacity duration-300 ${
                  diff === 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                <div>
                  {/* Category Pill & Live Core Capability Badge */}
                  <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100">
                    <span
                      className={`inline-flex items-center text-[10px] font-bold tracking-[0.14em] uppercase px-3 py-1 rounded-full border ${item.tagColor}`}
                    >
                      {item.category}
                    </span>

                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200/60 text-[10px] font-medium text-slate-500">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                      <span className="hidden xs:inline">Core Capability</span>
                    </div>
                  </div>

                  {/* Icon & Title */}
                  <div className="flex items-start gap-4 mb-3">
                    <div
                      className={`w-12 h-12 rounded-xl border flex items-center justify-center flex-shrink-0 shadow-xs ${item.accentColor}`}
                    >
                      <IconComponent className="w-6 h-6 stroke-[2]" />
                    </div>

                    <div className="pt-0.5">
                      <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-snug">
                        {item.title}
                      </h2>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-4 min-h-[44px]">
                    {item.description}
                  </p>

                  {/* Technical Metric / Spec Box */}
                  <div className="bg-slate-50/90 border border-slate-200/70 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
                      {item.metricLabel}
                    </span>
                    <span className="font-bold text-slate-800 text-right truncate">
                      {item.metricValue}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
