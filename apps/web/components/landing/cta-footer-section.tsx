import Link from "next/link";
import { ArrowRight, Target } from "lucide-react";
import { PixelImage } from "@/registry/magicui/pixel-image";

export function CtaFooterSection() {
  return (
    <footer className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-6xl mx-auto">
        
        {/* Scenic Panoramic CTA Banner Card */}
        <div className="relative rounded-3xl overflow-hidden shadow-2xl min-h-[300px] flex items-center p-8 sm:p-12 lg:p-16 border border-slate-200">
          
          {/* Scenic Background Image with Pixel Effect */}
          <PixelImage
            src="/landing/cta-banner.jpg"
            alt="Sustainable Infrastructure Landscape"
            customGrid={{ rows: 4, cols: 8 }}
            grayscaleAnimation
            className="absolute inset-0 w-full h-full"
            imgClassName="object-cover object-right"
          />

          {/* Left-to-right gradient wash for text legibility */}
          <div className="absolute inset-0 z-10 bg-gradient-to-r from-sky-950/95 via-sky-950/80 to-transparent pointer-events-none" />

          {/* Content */}
          <div className="relative z-20 max-w-xl text-left">
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight leading-tight">
              Let&apos;s build a more sustainable tomorrow.
            </h2>
            <p className="mt-3 text-base text-sky-100/90 leading-relaxed">
              Turn operational evidence into verified ESG data and BRSR-ready reporting.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/login"
                className="inline-flex items-center justify-center px-6 py-3.5 text-sm sm:text-base font-bold text-white bg-[#E91029] rounded-lg hover:bg-[#d00e24] transition-all shadow-md gap-2"
              >
                Request a Demo <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center px-6 py-3.5 text-sm sm:text-base font-bold text-[#333333] bg-white/95 hover:bg-white rounded-lg transition-all shadow-md gap-2 border border-white"
              >
                <Target className="w-4 h-4 text-[#313490]" />
                Contact Us
              </Link>
            </div>
          </div>

        </div>

        {/* Minimal Copyright Bar */}
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© {new Date().getFullYear()} TraceESG by MEIL. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-slate-800 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-slate-800 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-slate-800 transition-colors">Contact</a>
          </div>
        </div>

      </div>
    </footer>
  );
}
