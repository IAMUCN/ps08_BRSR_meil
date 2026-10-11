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
  Upload,
  UserRound,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "cn";

export type NavItem = { href: string; label: string; icon: NavIcon };

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
  deadlines: AlarmClock,
  reports: FileText,
  audit: History,
} satisfies Record<string, LucideIcon>;

export type NavIcon = keyof typeof ICONS;

/**
 * Persistent left sidebar (03_APP_FLOW.md §1; UI brief §6.2). Lists only pages that exist. Below 1280px it
 * collapses to an icon rail that opens over the page (UI brief §16); labels stay the accessible names.
 */
export function Sidebar({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  const rootHref = items[0]?.href;
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
          "fixed inset-y-0 left-0 z-40 flex flex-col overflow-y-auto bg-sidebar text-sidebar-foreground xl:w-60 xl:shadow-none",
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
        <ul className="flex flex-col gap-1 p-3">
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            const active =
              item.href === rootHref
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={item.label}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setExpanded(false)}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-md px-2.5 text-sm font-medium transition-colors xl:px-3",
                    "focus-visible:ring-2 focus-visible:ring-sidebar-foreground focus-visible:outline-none",
                    active
                      ? "bg-sidebar-active text-sidebar-active-foreground"
                      : "hover:bg-sidebar-hover hover:text-sidebar-hover-foreground",
                  )}
                >
                  <Icon className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
                  <span className={cn("truncate", shown("sr-only xl:not-sr-only"))}>
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
