import { ArrowUp } from "lucide-react";

export function PerformanceSection() {
  return (
    <section id="performance" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        
        {/* Section Heading */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#313490]/10 text-[#313490] text-xs font-bold uppercase tracking-wider mb-2">
            Executive Oversight
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#333333] tracking-tight">
            ESG Performance at a Glance
          </h2>
          <p className="text-base sm:text-lg text-slate-600 mt-2">
            Consolidated GHG emissions and reporting readiness across MEIL&apos;s organizational hierarchy.
          </p>
        </div>

        {/* 3 Dashboard Metric Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          
          {/* Card 1: Emissions Trend */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm flex flex-col justify-between h-[340px]">
            <div>
              <h3 className="text-base font-bold text-slate-900">Emissions Trend</h3>
            </div>
            
            <div className="relative flex-1 flex items-end pt-6 pb-2">
              {/* Y Axis */}
              <div className="flex flex-col justify-between h-full pr-3 text-[10px] font-semibold text-slate-500">
                <span>90</span>
                <span>70</span>
                <span>50</span>
                <span>30</span>
              </div>
              
              {/* Line Graph with Nodes */}
              <div className="relative flex-1 h-full flex flex-col justify-end">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 240 100" preserveAspectRatio="none">
                  {/* Subtle Grid Lines */}
                  <line x1="0" y1="10" x2="240" y2="10" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="0" y1="40" x2="240" y2="40" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="0" y1="70" x2="240" y2="70" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />

                  {/* Trend Line */}
                  <path
                    d="M 10 80 Q 40 65 60 70 T 110 50 T 160 55 T 200 30 T 235 20"
                    fill="none"
                    stroke="#313490"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />

                  {/* Data Points */}
                  <circle cx="10" cy="80" r="4.5" fill="#313490" className="shadow-xs" />
                  <circle cx="60" cy="70" r="4.5" fill="#313490" />
                  <circle cx="110" cy="50" r="4.5" fill="#313490" />
                  <circle cx="160" cy="55" r="4.5" fill="#313490" />
                  <circle cx="200" cy="30" r="4.5" fill="#313490" />
                  <circle cx="235" cy="20" r="4.5" fill="#313490" />
                </svg>

                {/* X Axis */}
                <div className="flex justify-between text-[11px] font-semibold text-slate-500 pt-3 border-t border-slate-100">
                  <span>Jan</span>
                  <span>Feb</span>
                  <span>Mar</span>
                  <span>Apr</span>
                  <span>May</span>
                  <span>Jun</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Scope Composition */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm flex flex-col justify-between h-[340px]">
            <div>
              <h3 className="text-base font-bold text-slate-900">Scope Composition</h3>
            </div>
            
            <div className="space-y-6 flex-1 flex flex-col justify-center">
              {/* Scope 1 */}
              <div>
                <div className="flex justify-between items-center text-xs font-bold mb-2">
                  <span className="text-slate-700">Scope 1 (Direct Fuel)</span>
                  <span className="text-slate-900">32,400</span>
                </div>
                <div className="w-full h-4 bg-slate-100 rounded-md overflow-hidden">
                  <div className="h-full bg-[#313490] rounded-md" style={{ width: '42%' }} />
                </div>
              </div>

              {/* Scope 2 */}
              <div>
                <div className="flex justify-between items-center text-xs font-bold mb-2">
                  <span className="text-slate-700">Scope 2 (Electricity)</span>
                  <span className="text-slate-900">56,210</span>
                </div>
                <div className="w-full h-4 bg-slate-100 rounded-md overflow-hidden">
                  <div className="h-full bg-[#E91029] rounded-md" style={{ width: '75%' }} />
                </div>
              </div>

              {/* Scope 3 */}
              <div>
                <div className="flex justify-between items-center text-xs font-bold mb-2">
                  <span className="text-slate-700">Scope 3 (Supply Chain)</span>
                  <span className="text-slate-900">34,810</span>
                </div>
                <div className="w-full h-4 bg-slate-100 rounded-md overflow-hidden">
                  <div className="h-full bg-[#333333] rounded-md" style={{ width: '48%' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: BRSR Readiness */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm flex flex-col justify-between items-center h-[340px]">
            <div className="w-full text-left">
              <h3 className="text-base font-bold text-slate-900">BRSR Readiness</h3>
            </div>

            {/* Circular Gauge */}
            <div className="relative flex items-center justify-center my-auto">
              <svg className="w-40 h-40 transform -rotate-90" viewBox="0 0 120 120">
                {/* Background Ring */}
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  className="stroke-sky-100"
                  strokeWidth="12"
                  fill="none"
                />
                {/* Progress Ring with bright cyan/green */}
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  stroke="#10b981"
                  strokeWidth="12"
                  strokeDasharray="301.59"
                  strokeDashoffset={301.59 * (1 - 0.78)}
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-4xl font-black text-slate-950 tracking-tight">78%</span>
                <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-600 mt-0.5">
                  <ArrowUp className="w-3.5 h-3.5 stroke-[3]" /> 12%
                </span>
              </div>
            </div>

            <div className="text-xs font-medium text-slate-600">
              Audit-ready indicators completed
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
