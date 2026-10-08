import { Cloud, BarChart2, FileCheck2, ArrowRight } from "lucide-react";

export function ProcessStepsSection() {
  const steps = [
    { num: "01", title: "Upload Documents" },
    { num: "02", title: "AI Extract Key Information" },
    { num: "03", title: "Verify and Confirm" },
    { num: "04", title: "Apply Calculations" },
    { num: "05", title: "Map to BRSR" },
    { num: "06", title: "Generate Reports" },
  ];

  return (
    <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        
        {/* Section Heading */}
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-slate-950 tracking-tight">
            Turn Documents into BRSR-Ready Insights
          </h2>
        </div>

        {/* 6 Step Progress Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 max-w-5xl mx-auto mb-16">
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-center gap-3 sm:gap-6 flex-1 min-w-[120px] justify-center">
              <div className="flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-[#e11d48] text-white font-extrabold text-sm flex items-center justify-center shadow-md mb-2">
                  {step.num}
                </div>
                <span className="text-xs font-semibold text-slate-700 leading-tight max-w-[90px]">
                  {step.title}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <ArrowRight className="w-4 h-4 text-slate-300 hidden md:block flex-shrink-0 -mt-5" />
              )}
            </div>
          ))}
        </div>

        {/* 4 Cards with Thick Colorful Arrows */}
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4 max-w-6xl mx-auto">
          
          {/* Card 1: Document */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md p-5 w-full lg:w-[240px] flex-shrink-0 flex flex-col justify-between h-[150px]">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800">Electricity Bill</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 space-y-1.5">
                <div className="h-1.5 bg-slate-300 rounded w-4/5" />
                <div className="h-1.5 bg-slate-200 rounded w-3/5" />
                <div className="h-1.5 bg-slate-200 rounded w-full" />
              </div>
            </div>
            <div className="text-[10px] text-slate-400 font-medium">Source Document</div>
          </div>

          {/* Thick Green Arrow */}
          <div className="flex-shrink-0 text-emerald-500 my-2 lg:my-0">
            <svg className="w-8 h-8 rotate-90 lg:rotate-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 11h12.17l-5.59-5.59L12 4l8 8-8 8-1.41-1.41L16.17 13H4v-2z" />
            </svg>
          </div>

          {/* Card 2: AI Extraction */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md p-5 w-full lg:w-[240px] flex-shrink-0 flex flex-col justify-between h-[150px] relative">
            <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-sky-50 text-sky-500 flex items-center justify-center">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                102,430 <span className="text-sm font-semibold text-slate-500">kWh</span>
              </div>
            </div>
            <div>
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                Extracted with 94% confidence
              </span>
            </div>
          </div>

          {/* Thick Blue Arrow */}
          <div className="flex-shrink-0 text-blue-500 my-2 lg:my-0">
            <svg className="w-8 h-8 rotate-90 lg:rotate-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 11h12.17l-5.59-5.59L12 4l8 8-8 8-1.41-1.41L16.17 13H4v-2z" />
            </svg>
          </div>

          {/* Card 3: Scope 2 Calculated */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md p-5 w-full lg:w-[240px] flex-shrink-0 flex flex-col justify-between h-[150px] relative">
            <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center">
              <BarChart2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                82.5 <span className="text-sm font-semibold text-slate-500">tCO₂e</span>
              </div>
            </div>
            <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide">
              Scope 2 Calculated
            </div>
          </div>

          {/* Thick Orange Arrow */}
          <div className="flex-shrink-0 text-amber-500 my-2 lg:my-0">
            <svg className="w-8 h-8 rotate-90 lg:rotate-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 11h12.17l-5.59-5.59L12 4l8 8-8 8-1.41-1.41L16.17 13H4v-2z" />
            </svg>
          </div>

          {/* Card 4: BRSR Ready */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md p-5 w-full lg:w-[240px] flex-shrink-0 flex flex-col justify-between h-[150px] relative">
            <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileCheck2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xl font-black text-slate-900 tracking-tight">
                BRSR <span className="text-base font-semibold text-slate-700">Ready</span>
              </div>
            </div>
            <div className="text-xs font-semibold text-slate-500">
              Mapped to relevant indicator
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
