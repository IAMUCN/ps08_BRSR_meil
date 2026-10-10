import Link from 'next/link';
import { Play } from 'lucide-react';
import { HeroCapabilityCard } from '@/components/landing/capability-card';

export function HeroSection() {
  return (
    <section className="relative pt-12 pb-20 lg:pt-16 lg:pb-28 overflow-hidden bg-white">
      {/* Premium corporate background atmosphere: subtle radial blue mesh */}
      <div className="absolute top-0 right-0 w-[65%] h-[95%] bg-[radial-gradient(ellipse_at_top_right,rgba(219,234,254,0.5),rgba(240,249,255,0.3)_40%,rgba(255,255,255,0)_75%)] pointer-events-none -z-10" />
      <div className="absolute -top-24 left-1/3 w-[500px] h-[500px] bg-sky-50/40 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Hero Content */}
          <div className="lg:col-span-6 flex flex-col items-start">
            
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#313490]/10 border border-[#313490]/20 mb-5 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-[#313490]" />
              <span className="text-[11px] sm:text-xs font-bold tracking-[0.16em] text-[#313490] uppercase">
                ONE PLATFORM. EVERY DOCUMENT. REAL IMPACT.
              </span>
            </div>
            
            {/* Dominant Editorial Serif Headline */}
            <h1 className="font-display text-5xl sm:text-6xl lg:text-[72px] font-bold text-[#333333] tracking-tight leading-[1.08] mb-6">
              From Real<br />
              Documents<br />
              to Real Impact.
            </h1>
            
            {/* Supporting Copy */}
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl mb-8 font-normal">
              TraceESG uses AI and human verification to convert operational documents into accurate ESG data and BRSR-ready reports for MEIL&apos;s infrastructure enterprise.
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-wrap items-center gap-4 mb-8">
              <Link 
                href="/login" 
                draggable={false}
                className="inline-flex items-center justify-center px-8 py-3.5 text-base font-semibold text-white bg-[#E91029] rounded-xl hover:bg-[#E91029]/90 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5"
              >
                Get Started
              </Link>
              <Link 
                href="#how-it-works"
                draggable={false}
                className="inline-flex items-center justify-center px-7 py-3.5 text-base font-bold text-[#313490] bg-white border-2 border-[#313490] rounded-xl hover:bg-[#313490]/5 transition-all gap-2.5 shadow-2xs hover:shadow-xs"
              >
                <div className="w-5 h-5 rounded-full bg-[#313490] flex items-center justify-center text-white">
                  <Play className="w-2.5 h-2.5 fill-white ml-0.5" />
                </div>
                See How It Works
              </Link>
            </div>

          </div>

          {/* Right Hero Content: Live Product Capability Showcase */}
          <div className="lg:col-span-6 relative flex justify-center lg:justify-end">
            <HeroCapabilityCard />
          </div>

        </div>
      </div>
    </section>
  );
}
