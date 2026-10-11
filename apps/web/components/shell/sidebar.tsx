"use client";

import {
  AlarmClock,
  Building2,
  CalendarRange,
  Calculator,
  ClipboardCheck,
  Flame,
  FileStack,
  FileText,
  History,
  LayoutDashboard,
  Link2,
  ListTree,
  Menu,
  PanelLeftClose,
  ScanText,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  TrendingUp,
  Upload,
  UserRound,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { cn } from "cn";

/** `startsGroup` draws a thin separator above the item, to set a group of related pages apart. */
export type NavItem = { href: string; label: string; icon: NavIcon; startsGroup?: boolean };

// Icons are referenced by name so Server Components can pass nav items to this Client Component.
const ICONS = {
  dashboard: LayoutDashboard,
  organization: Building2,
  users: Users,
  roles: ShieldCheck,
  periods: CalendarRange,
  profile: UserRound,
  upload: Upload,
  submissions: FileStack,
  ocr: ScanText,
  validation: ShieldAlert,
  approvals: ClipboardCheck,
  factors: Calculator,
  scope1: Flame,
  scope2: Zap,
  scope3: Link2,
  brsr: ListTree,
  explorer: Search,
  simulator: Sliders,
  forecast: TrendingUp,
  deadlines: AlarmClock,
  reports: FileText,
  audit: History,
} satisfies Record<string, LucideIcon>;

export type NavIcon = keyof typeof ICONS;

/**
 * Persistent left sidebar (03_APP_FLOW.md §1; UI brief §6.2). Lists only pages that exist. Below 1280px it
 * collapses to an icon rail that opens over the page (UI brief §16); labels stay the accessible names.
 */
// A spring as a CSS easing curve: overshoots the target slightly, then settles.
// A long jump with the same overshoot would sweep over many rows and dividers, so it settles smoothly instead.
const GLIDE = "cubic-bezier(0.22, 1, 0.36, 1)";
const SPRING =
  "linear(0, 0.4 7%, 0.85 15%, 1.08 25%, 1.13 31%, 1.1 38%, 1.03 49%, 0.99 60%, 1.005 75%, 1)";

export function Sidebar({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  const rootHref = items[0]?.href;
  const isActive = (item: NavItem) =>
    item.href === rootHref
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const activeIndex = items.findIndex(isActive);
  // Row the highlight came from: state adjusted during render (React's pattern for "previous value").
  const [track, setTrack] = useState({ from: activeIndex, to: activeIndex });
  if (track.to !== activeIndex) setTrack({ from: track.to, to: activeIndex });
  const hops = Math.abs(activeIndex - track.from);
  // Each separator is 0.75rem plus one flex gap (0.25rem), so it pushes every later row down 1rem.
  const separatorsAbove = items
    .slice(0, Math.max(activeIndex, 0) + 1)
    .filter((i) => i.startsGroup).length;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);

  const shown = (collapsed: string) => (expanded ? "" : collapsed);
  return (
    // The placeholder keeps the page clear of the fixed rail.
    <div className="w-16 shrink-0 xl:w-60">
      {expanded ? (
        <div
          aria-hidden
          className="fixed inset-0 z-30 bg-[var(--overlay)] xl:hidden"
          onClick={() => setExpanded(false)}
        />
      ) : null}
      <nav
        aria-label={label}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden bg-sidebar text-sidebar-foreground xl:w-60 xl:shadow-none",
          expanded ? "w-60 shadow-lg" : "w-16",
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-divider px-3 xl:px-5">
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
            onClick={() => setExpanded(!expanded)}
            className="flex size-10 shrink-0 items-center justify-center rounded-md hover:bg-sidebar-hover hover:text-sidebar-hover-foreground focus-visible:ring-2 focus-visible:ring-sidebar-foreground focus-visible:outline-none xl:hidden"
          >
            {expanded ? (
              <PanelLeftClose className="size-5" strokeWidth={1.5} aria-hidden />
            ) : (
              <Menu className="size-5" strokeWidth={1.5} aria-hidden />
            )}
          </button>
          <span className={cn("text-base font-semibold", shown("hidden xl:inline"))}>TraceESG</span>
        </div>
        {/* Only the list scrolls (scrollbar hidden); the TraceESG header above it stays put. */}
        <ul className="relative flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* One highlight that slides to the active item with a spring overshoot (CSS only). Rows are
              h-10 with gap-1, so row n sits n × 2.75rem down. */}
          <span
            aria-hidden
            className="absolute inset-x-3 top-3 h-10 rounded-md bg-sidebar-active transition-[transform,opacity] duration-500 motion-reduce:transition-none"
            style={{
              transform: `translateY(calc(${Math.max(activeIndex, 0)} * 2.75rem + ${separatorsAbove} * 1rem))`,
              opacity: activeIndex < 0 ? 0 : 1,
              transitionTimingFunction: hops <= 2 ? SPRING : GLIDE,
            }}
          />
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(item);
            return (
              <Fragment key={item.href}>
                {item.startsGroup ? (
                  <li aria-hidden className="flex h-3 shrink-0 items-center">
                    <span className="h-px w-full bg-sidebar-divider" />
                  </li>
                ) : null}
                <li>
                  <Link
                    suppressHydrationWarning // browser extensions add inline styles to links before hydration
                    href={item.href}
                    title={item.label}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setExpanded(false)}
                    className={cn(
                      "flex h-10 items-center gap-3 rounded-md px-2.5 text-sm font-medium transition-colors xl:px-3",
                      "focus-visible:ring-2 focus-visible:ring-sidebar-foreground focus-visible:outline-none",
                      "relative",
                      active
                        ? "text-sidebar-active-foreground"
                        : "hover:bg-sidebar-hover hover:text-sidebar-hover-foreground",
                    )}
                  >
                    <Icon className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
                    <span className={cn("truncate", shown("sr-only xl:not-sr-only"))}>
                      {item.label}
                    </span>
                  </Link>
                </li>
              </Fragment>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
