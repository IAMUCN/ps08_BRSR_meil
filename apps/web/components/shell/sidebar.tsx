"use client";

import {
  AlarmClock,
  Building2,
  CalendarRange,
  Calculator,
  ChartColumn,
  CircleHelp,
  ClipboardCheck,
  Coins,
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
import { LogoMark } from "@/components/brand/logo-mark";
import { LogoWordmarkOnBar } from "@/components/brand/logo-wordmark-on-bar";

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
  carbon: Coins,
  analytics: ChartColumn,
  help: CircleHelp,
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
    // The placeholder keeps the page clear of the fixed rail. On phones there is no rail: a bottom bar and a
    // Menu drawer instead (feature_enhancement.md 9.1, requirement 3).
    <div className="shrink-0 md:w-16 xl:w-60">
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
          expanded ? "w-60 shadow-lg" : "w-16 max-md:hidden",
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
          {/* The mark and the wordmark as two separate images, in the owner's colours as given (owner's
              page feedback, 2026-11-11). */}
          <span className={cn("flex items-center gap-1", shown("hidden xl:flex"))}>
            <LogoMark className="size-12 shrink-0" />
            <LogoWordmarkOnBar className="h-6 w-auto text-sidebar-foreground" />
            <span className="sr-only">EmeilSG</span>
          </span>
        </div>
        {/* Only the list scrolls (scrollbar hidden); the EmeilSG header above it stays put. */}
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
      <BottomBar
        items={items}
        isActive={isActive}
        onMenu={() => setExpanded(true)}
        menuOpen={expanded}
      />
    </div>
  );
}

/** Short names for the bar, where the full one does not fit under an icon. */
const SHORT: Record<string, string> = {
  "/admin": "Home",
  "/app": "Home",
  "/app/submissions": "Uploads",
  "/admin/approval-queue": "Approvals",
  "/app/approvals": "Approvals",
  "/app/activity": "Activity",
};

/** The pages a phone reaches most, in this order; whichever the person has. */
const BOTTOM_PREFERENCE = [
  ["/admin", "/app"],
  ["/app/upload"],
  ["/app/submissions"],
  ["/admin/approval-queue", "/app/approvals", "/app/activity"],
];

/**
 * Phones only (below 768px): the four most-used pages and Menu, which opens the full navigation as a drawer.
 * Upload (the import of documents) sits in the middle, as the main action.
 */
function BottomBar({
  items,
  isActive,
  onMenu,
  menuOpen,
}: {
  items: NavItem[];
  isActive: (item: NavItem) => boolean;
  onMenu: () => void;
  menuOpen: boolean;
}) {
  const picked = BOTTOM_PREFERENCE.flatMap((hrefs) => {
    const found = hrefs.map((h) => items.find((i) => i.href === h)).find(Boolean);
    return found ? [found] : [];
  });
  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul
        className="grid h-16"
        style={{ gridTemplateColumns: `repeat(${picked.length + 1}, minmax(0, 1fr))` }}
      >
        {picked.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(item);
          const upload = item.href === "/app/upload";
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  active ? "text-primary-text" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full",
                    upload && "bg-primary text-primary-foreground",
                  )}
                >
                  <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="max-w-full truncate px-1">{SHORT[item.href] ?? item.label}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex">
          <button
            type="button"
            onClick={onMenu}
            aria-expanded={menuOpen}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="flex size-8 items-center justify-center">
              <Menu className="size-5" strokeWidth={1.75} aria-hidden />
            </span>
            Menu
          </button>
        </li>
      </ul>
    </nav>
  );
}
