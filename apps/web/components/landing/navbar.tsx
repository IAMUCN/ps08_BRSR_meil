import Link from 'next/link';

export function LandingNavbar() {
  return (
    <header className="w-full bg-white py-4 sm:py-5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-sm flex-shrink-0">
              {/* House with eco-leaf SVG */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5 text-emerald-400"
              >
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <path d="M12 22v-6c0-1.5 1-2.5 2.5-2.5S17 14.5 17 16" />
                <circle cx="12" cy="11" r="2" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-xl text-slate-900 tracking-tight leading-none group-hover:text-blue-900 transition-colors">
                TraceESG
              </span>
              <span className="text-[11px] font-semibold text-slate-500 tracking-tight mt-1">
                ESG/BRSR Platform for MEIL
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-9">
            <Link
              href="#product"
              className="text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
            >
              Product
            </Link>
            <Link
              href="#how-it-works"
              className="text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
            >
              How It Works
            </Link>
            <Link
              href="#brsr"
              className="text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
            >
              BRSR
            </Link>
            <Link
              href="#solutions"
              className="text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
            >
              Solutions
            </Link>
            <Link
              href="#resources"
              className="text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
            >
              Resources
            </Link>
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-semibold text-[#1e3a8a] bg-white border border-[#1e3a8a] rounded-lg hover:bg-blue-50/70 transition-all shadow-sm"
            >
              Admin Login
            </Link>
            <Link
              href="/login"
              className="px-5 py-2 text-sm font-semibold text-white bg-[#e11d48] rounded-lg hover:bg-[#be123c] transition-all shadow-sm hover:shadow"
            >
              User Login
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
