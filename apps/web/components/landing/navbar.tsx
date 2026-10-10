import Link from 'next/link';
import { NavbarDock } from '@/components/landing/navbar-dock';

export function LandingNavbar() {
  return (
    <header className="w-full bg-white py-4 sm:py-5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group flex-shrink-0">
            <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-sm flex-shrink-0">
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
            <span className="font-extrabold text-xl text-slate-900 tracking-tight leading-none group-hover:text-blue-900 transition-colors">
              TraceESG
            </span>
          </Link>

          {/* Center: Magic UI Dock Component */}
          <div className="hidden lg:flex items-center justify-center flex-1 max-w-xl">
            <NavbarDock />
          </div>

          {/* Previous text navigation links preserved in comment:
          <nav className="hidden lg:flex items-center gap-7">
            <Link href="#infrastructure" className="text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors">Infrastructure</Link>
            <Link href="#brsr" className="text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors">BRSR</Link>
            <Link href="#how-it-works" className="text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors">How It Works</Link>
            <Link href="#product" className="text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors">Product</Link>
            <Link href="#governance" className="text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors">Governance</Link>
            <Link href="#performance" className="text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors">Performance</Link>
          </nav>
          */}

          {/* Action Buttons */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <Link
              href="/login"
              draggable={false}
              className="px-4 py-2 text-sm font-semibold text-[#313490] bg-white border border-[#313490] rounded-lg hover:bg-[#313490]/5 transition-all shadow-sm"
            >
              Admin Login
            </Link>
            <Link
              href="/login"
              draggable={false}
              className="px-5 py-2 text-sm font-semibold text-white bg-[#E91029] rounded-lg hover:bg-[#E91029]/90 transition-all shadow-sm hover:shadow"
            >
              User Login
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
