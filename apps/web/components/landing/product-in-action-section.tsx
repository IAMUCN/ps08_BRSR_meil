import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/ui/border-beam";
import { SectionHeading } from "@/components/landing/section-heading";
import {
  ArrowLeft,
  ArrowRight,
  Maximize2,
  LayoutDashboard,
  FileUp,
  FileText,
  CheckSquare,
  Calculator,
  BarChart3,
  Settings,
  CheckCircle2,
} from "lucide-react";

export function ProductInActionSection() {
  return (
    <section id="product" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        <SectionHeading
          eyebrow="The product"
          title="Verify what was extracted, side by side with the document"
        >
          The reviewer sees the source and every extracted field together, with confidence on each.
          Illustrative screen.
        </SectionHeading>

        <BlurFade inView>
          <div className="relative max-w-6xl mx-auto bg-white rounded-3xl shadow-xl border border-slate-200/90 overflow-hidden flex flex-col md:flex-row min-h-[580px]">
            <BorderBeam
              size={220}
              duration={10}
              colorFrom="#313490"
              colorTo="#10b981"
              borderWidth={2}
            />

            {/* Dark Navy Sidebar */}
            <div className="w-full md:w-56 bg-[#0f172a] text-white flex flex-col flex-shrink-0 p-4 border-r border-slate-800">
              <div className="flex items-center gap-2.5 pb-5 border-b border-slate-800 mb-5">
                <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center text-white text-xs font-black">
                  T
                </div>
                <span className="font-extrabold text-base tracking-tight text-white">EmeilSG</span>
              </div>

              <nav className="space-y-1 text-xs font-semibold flex-1">
                <div className="flex items-center gap-3 px-3 py-2.5 bg-[#313490] text-white rounded-xl shadow-xs">
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
                  <FileUp className="w-4 h-4" />
                  Upload
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
                  <FileText className="w-4 h-4" />
                  Submissions
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
                  <CheckSquare className="w-4 h-4" />
                  Validation
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
                  <Calculator className="w-4 h-4" />
                  Calculations
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
                  <BarChart3 className="w-4 h-4" />
                  Reports
                </div>
              </nav>

              <div className="pt-4 border-t border-slate-800">
                <div className="flex items-center gap-3 px-3 py-2 text-slate-400 hover:text-white text-xs font-semibold">
                  <Settings className="w-4 h-4" />
                  Settings
                </div>
              </div>
            </div>

            {/* Main Inspection Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50">
              {/* Top Toolbar */}
              <div className="h-12 bg-white border-b border-slate-200 px-6 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">Document View</span>
                <div className="flex items-center gap-2 text-slate-400">
                  <button
                    aria-label="Previous page"
                    className="p-1 hover:text-slate-600 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    aria-label="Next page"
                    className="p-1 hover:text-slate-600 transition-colors"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <span className="w-px h-3.5 bg-slate-200 mx-1" />
                  <button
                    aria-label="Fullscreen preview"
                    className="p-1 hover:text-slate-600 transition-colors"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Split: Document Preview & Extracted Fields */}
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
                {/* Document Canvas */}
                <div className="lg:col-span-7 p-6 flex flex-col justify-between items-center bg-slate-100/60 border-r border-slate-200">
                  {/* Simulated Scanned Invoice */}
                  <div className="w-full max-w-[420px] bg-white rounded-xl shadow-sm border border-slate-200/90 p-6 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-[#E91029] text-white flex items-center justify-center text-[10px] font-bold">
                          B
                        </div>
                        <span className="font-extrabold text-sm text-slate-900 tracking-tight">
                          Bharat Bijli
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-600 uppercase">
                        HT Consumer Bill
                      </span>
                    </div>

                    {/* Bill Details */}
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                        <span>Consumer No:</span>
                        <span className="font-bold text-slate-900">MEIL-HYD-0921</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                        <span>Billing Period:</span>
                        <span className="font-bold text-slate-900">01 Mar 2024 - 31 Mar 2024</span>
                      </div>

                      {/* Highlighted Row (AI Target) */}
                      <div className="flex justify-between py-1.5 px-2 bg-emerald-50 rounded-lg border border-emerald-200 text-slate-900 font-bold">
                        <span className="text-emerald-800">Total Consumption:</span>
                        <span className="text-emerald-700">102,430 kWh</span>
                      </div>

                      <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                        <span>Total Amount Payable:</span>
                        <span className="font-bold text-slate-900">₹ 4,43,300.00</span>
                      </div>
                    </div>
                  </div>

                  {/* 4 Page Thumbnails underneath document */}
                  <div className="flex items-center gap-3 mt-4">
                    <div className="w-9 h-12 bg-white rounded border-2 border-[#313490] shadow-xs flex items-center justify-center text-[9px] font-bold text-[#313490]">
                      1
                    </div>
                    <div className="w-9 h-12 bg-white rounded border border-slate-200 shadow-xs flex items-center justify-center text-[9px] text-slate-400">
                      2
                    </div>
                    <div className="w-9 h-12 bg-white rounded border border-slate-200 shadow-xs flex items-center justify-center text-[9px] text-slate-400">
                      3
                    </div>
                    <div className="w-9 h-12 bg-white rounded border border-slate-200 shadow-xs flex items-center justify-center text-[9px] text-slate-400">
                      4
                    </div>
                  </div>
                </div>

                {/* Extracted Fields Panel */}
                <div className="lg:col-span-5 p-6 bg-white flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 mb-5">Extracted Fields</h3>

                    <div className="space-y-3.5">
                      {/* Field 1 */}
                      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                        <span className="text-xs text-slate-500">Electricity Consumption</span>
                        <span className="text-xs font-bold text-slate-900">102,430 kWh</span>
                      </div>

                      {/* Field 2 */}
                      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                        <span className="text-xs text-slate-500">Bill Date</span>
                        <span className="text-xs font-bold text-slate-900">12 Apr 2024</span>
                      </div>

                      {/* Field 3 */}
                      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                        <span className="text-xs text-slate-500">Vendor</span>
                        <span className="text-xs font-bold text-slate-900">ABC Power Ltd.</span>
                      </div>

                      {/* Field 4 */}
                      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                        <span className="text-xs text-slate-500">Amount</span>
                        <span className="text-xs font-bold text-slate-900">₹ 4,43,300</span>
                      </div>

                      {/* Field 5: Confidence */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-slate-500">Confidence</span>
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          94%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action Button */}
                  <div className="pt-6">
                    <button
                      type="button"
                      className="w-full py-3 px-4 bg-[#313490] hover:bg-[#313490]/90 text-white font-bold text-sm rounded-xl shadow-md transition-colors flex items-center justify-center gap-2"
                    >
                      Verify & Confirm
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
