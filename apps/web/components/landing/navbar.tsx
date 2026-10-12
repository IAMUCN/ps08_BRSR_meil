"use client";

import { useState } from "react";
import { LogoMark } from "@/components/brand/logo-mark";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { NavbarDock } from "@/components/landing/navbar-dock";
import { DEMO_HREF, NAV_ITEMS } from "@/components/landing/links";

export function LandingNavbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="EmeilSG home">
          <LogoMark className="h-9 w-9" />
          <span className="text-xl leading-none font-extrabold tracking-tight text-[#0B2A5B]">
            Emeil<span className="text-[#1E7A34]">SG</span>
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden flex-1 items-center justify-center lg:flex">
          <NavbarDock />
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            draggable={false}
            className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-[#313490] sm:inline-block"
          >
            Sign in
          </Link>
          <a
            href={DEMO_HREF}
            draggable={false}
            className="rounded-lg bg-[#E91029] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#d00e24] hover:shadow"
          >
            Request a demo
          </a>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="border-t border-slate-200/70 bg-white px-4 pb-4 pt-2 lg:hidden"
        >
          <ul className="flex flex-col">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-3 text-base font-medium text-slate-700 hover:bg-slate-50 hover:text-[#313490]"
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <Link
                href="/login"
                className="block rounded-lg px-3 py-3 text-base font-semibold text-[#313490] hover:bg-slate-50"
              >
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
