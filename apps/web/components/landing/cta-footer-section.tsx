import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PixelImage } from "@/registry/magicui/pixel-image";
import { DEMO_HREF, NAV_ITEMS } from "@/components/landing/links";

export function CtaFooterSection() {
  return (
    <footer className="bg-white px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="relative flex min-h-[300px] items-center overflow-hidden rounded-3xl border border-slate-200 p-8 shadow-xl sm:p-12 lg:p-16">
          <PixelImage
            src="/landing/cta-banner.jpg"
            alt=""
            customGrid={{ rows: 4, cols: 8 }}
            grayscaleAnimation
            className="absolute inset-0 h-full w-full"
            imgClassName="object-cover object-right"
          />
          <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-r from-[#0f172a]/95 via-[#0f172a]/80 to-transparent" />

          <div className="relative z-20 max-w-xl text-left">
            <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
              See your own numbers traced to source.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-200">
              Book a walkthrough and follow one document from upload to a BRSR-ready figure.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={DEMO_HREF}
                className="inline-flex items-center gap-2 rounded-lg bg-[#E91029] px-6 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:bg-[#d00e24] sm:text-base"
              >
                Request a demo <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                href="/login"
                className="inline-flex items-center rounded-lg border border-white/30 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/20 sm:text-base"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 text-xs text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} TraceESG by MEIL. All rights reserved.</p>
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="transition-colors hover:text-slate-800"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
