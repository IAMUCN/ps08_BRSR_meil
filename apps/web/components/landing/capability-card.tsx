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
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from 'lucide-react';

export interface CapabilityItem {
  id: string;
  category: string;
  title: string;
  description: string;
  metricLabel: string;
  metricValue: string;
  icon: typeof FileCheck2;
  accentColor: string; // for icon badge
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

const ROTATION_INTERVAL_MS = 3000;
const TRANSITION_DURATION_MS = 450;

export function HeroCapabilityCard() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const goToNext = useCallback(() => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % CAPABILITIES.length);
      setIsTransitioning(false);
    }, TRANSITION_DURATION_MS);
  }, []);

  const goToPrev = useCallback(() => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + CAPABILITIES.length) % CAPABILITIES.length);
      setIsTransitioning(false);
    }, TRANSITION_DURATION_MS);
  }, []);

  const jumpTo = useCallback((index: number) => {
    if (index === currentIndex) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex(index);
      setIsTransitioning(false);
    }, TRANSITION_DURATION_MS);
  }, [currentIndex]);

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

  const current = CAPABILITIES[currentIndex];
  const IconComponent = current.icon;

  return (
    <div
      className="relative w-full max-w-[480px] mx-auto select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Very soft atmospheric background glow behind the card */}
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-blue-100/60 via-sky-50/50 to-indigo-50/40 blur-2xl -z-10 pointer-events-none" />

      {/* Main Capability Showcase Card */}
      <div className="relative bg-white/95 backdrop-blur-sm rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-200/60 p-6 sm:p-7 overflow-hidden transition-all duration-300 hover:shadow-2xl hover:border-slate-300">
        
        {/* Subtle decorative top border accent line */}
        <div className="absolute top-0 left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />

        {/* Card Header: Category & Live Indicator */}
        <div className="flex items-center justify-between gap-2 pb-4 mb-5 border-b border-slate-100">
          <span
            className={`inline-flex items-center text-[10px] font-bold tracking-[0.14em] uppercase px-3 py-1 rounded-full border ${current.tagColor} transition-colors duration-300`}
          >
            {current.category}
          </span>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200/60 text-[10px] font-medium text-slate-500">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="hidden xs:inline">Core Capability</span>
          </div>
        </div>

        {/* Dynamic Card Content Area with Upward Slide & Fade */}
        <div
          className={`transition-all ease-out duration-[450ms] ${
            isTransitioning
              ? 'opacity-0 -translate-y-2.5 scale-[0.99]'
              : 'opacity-100 translate-y-0 scale-100'
          }`}
        >
          {/* Icon & Title */}
          <div className="flex items-start gap-4 mb-4">
            <div
              className={`w-12 h-12 rounded-xl border flex items-center justify-center flex-shrink-0 shadow-xs transition-colors duration-300 ${current.accentColor}`}
            >
              <IconComponent className="w-6 h-6 stroke-[2]" />
            </div>

            <div className="pt-0.5">
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-snug">
                {current.title}
              </h3>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-6 min-h-[44px]">
            {current.description}
          </p>

          {/* Technical Metric / Spec Footer */}
          <div className="bg-slate-50/90 border border-slate-200/70 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
              {current.metricLabel}
            </span>
            <span className="font-bold text-slate-800 text-right truncate">
              {current.metricValue}
            </span>
          </div>
        </div>

        {/* Progress & Pagination Controls Bar */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          
          {/* Index Counter */}
          <div className="flex items-center gap-2 font-mono text-xs font-semibold text-slate-500">
            <span className="text-slate-900 font-bold text-sm">{current.id}</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-400">12</span>
          </div>

          {/* Minimal 12 Progression Indicators */}
          <div className="hidden sm:flex items-center gap-1">
            {CAPABILITIES.map((_, idx) => (
              <button
                key={idx}
                onClick={() => jumpTo(idx)}
                aria-label={`Jump to capability ${idx + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentIndex
                    ? 'w-5 bg-blue-600'
                    : 'w-1.5 bg-slate-200 hover:bg-slate-300'
                }`}
              />
            ))}
          </div>

          {/* Play/Pause & Arrow Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsPaused((prev) => !prev)}
              aria-label={isPaused ? 'Resume autoplay' : 'Pause autoplay'}
              className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
              title={isPaused ? 'Resume auto-cycle' : 'Pause auto-cycle'}
            >
              {isPaused ? <Play className="w-3.5 h-3.5 ml-0.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={goToPrev}
              aria-label="Previous capability"
              className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={goToNext}
              aria-label="Next capability"
              className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>

      {/* Bottom Subtext */}
      <div className="mt-3 text-center">
        <span className="text-[11px] font-medium text-slate-400">
          TraceESG Core Platform Architecture · Automated live capability rotation
        </span>
      </div>
    </div>
  );
}
