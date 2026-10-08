import { Leaf, Users, Shield, ArrowRight } from "lucide-react";
import Link from "next/link";

export function WhatIsBrsrSection() {
  return (
    <section id="brsr" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        
        {/* Left Column */}
        <div className="lg:col-span-6 space-y-6">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-slate-950 tracking-tight">
            What is BRSR?
          </h2>
          <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-lg">
            The Business Responsibility and Sustainability Reporting framework provides a standardized structure for companies to disclose their environmental, social and governance performance.
          </p>
          <div>
            <Link
              href="#brsr"
              className="inline-flex items-center text-base font-bold text-[#e11d48] hover:text-[#be123c] transition-colors gap-1.5"
            >
              Learn More About BRSR <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Right Column: Encapsulated Card with 3 Pillars */}
        <div className="lg:col-span-6">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm flex flex-col gap-6">
            
            {/* Environmental */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0 shadow-xs border border-emerald-100">
                <Leaf className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Environmental</h3>
                <p className="text-sm text-slate-500 mt-0.5">Climate, energy, emissions, water, waste</p>
              </div>
            </div>

            {/* Social */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0 shadow-xs border border-amber-100">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Social</h3>
                <p className="text-sm text-slate-500 mt-0.5">People, communities, health & safety</p>
              </div>
            </div>

            {/* Governance */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center flex-shrink-0 shadow-xs border border-indigo-100">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Governance</h3>
                <p className="text-sm text-slate-500 mt-0.5">Policies, ethics, responsible conduct</p>
              </div>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
}
