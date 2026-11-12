"use client";

import { useState } from "react";
import { LogoMark, LogoWordmark } from "@/components/brand/logo-mark";
import Link from "next/link";
import { X } from "lucide-react";
import { NavbarDock } from "@/components/landing/navbar-dock";
import { NAV_ITEMS } from "@/components/landing/links";
import { DemoRequestButton } from "@/components/landing/demo-request";

function MenuBarsIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 640 640"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M96 160C96 142.3 110.3 128 128 128L512 128C529.7 128 544 142.3 544 160C544 177.7 529.7 192 512 192L128 192C110.3 192 96 177.7 96 160zM96 320C96 302.3 110.3 288 128 288L512 288C529.7 288 544 302.3 544 320C544 337.7 529.7 352 512 352L128 352C110.3 352 96 337.7 96 320zM544 480C544 497.7 529.7 512 512 512L128 512C110.3 512 96 497.7 96 480C96 462.3 110.3 448 128 448L512 448C529.7 448 544 462.3 544 480z" />
    </svg>
  );
}

export function LandingNavbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6 lg:px-8">
        {/* Left Side: Mobile Menu Button + Brand Logo (together on the left) */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg p-1.5 text-slate-700 hover:bg-slate-100 lg:hidden"
          >
            {open ? <X className="h-6 w-6" /> : <MenuBarsIcon className="h-6 w-6" />}
          </button>

          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 sm:gap-2.5"
            aria-label="EmeilSG home"
          >
            <LogoMark className="h-10 w-10 sm:h-12 sm:w-12 lg:h-14 lg:w-14" />
            <LogoWordmark className="h-7 w-auto sm:h-8 lg:h-9" />
          </Link>
        </div>

        {/* Center: Desktop Navigation Dock */}
        <nav aria-label="Primary" className="hidden flex-1 items-center justify-center lg:flex">
          <NavbarDock />
        </nav>

        {/* Right Side: Big Red Sign in on mobile + Request a demo on desktop */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            draggable={false}
            className="inline-flex items-center justify-center rounded-lg bg-[#E91029] px-5 py-2 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#d00e24] hover:shadow sm:bg-transparent sm:px-3 sm:py-2 sm:font-semibold sm:text-slate-700 sm:shadow-none sm:hover:bg-slate-100 sm:hover:text-[#313490]"
          >
            Sign in
          </Link>
          <DemoRequestButton className="hidden rounded-lg bg-[#E91029] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#d00e24] hover:shadow sm:inline-flex">
            Request a demo
          </DemoRequestButton>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="border-t border-slate-200/70 bg-white px-4 pb-5 pt-3 lg:hidden"
        >
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-base font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-[#313490]"
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-3">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center rounded-lg bg-[#E91029] px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#d00e24]"
              >
                Sign in
              </Link>
              <DemoRequestButton className="flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-2xs transition-colors hover:bg-slate-50">
                Request a demo
              </DemoRequestButton>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
