"use client";

import {
  Building2,
  CalendarRange,
  Calculator,
  ClipboardCheck,
  Factory,
  FileStack,
  LayoutDashboard,
  ListTree,
  ScanText,
  ShieldAlert,
  ShieldCheck,
  Upload,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  scope: Factory,
  brsr: ListTree,
} satisfies Record<string, LucideIcon>;

export type NavIcon = keyof typeof ICONS;

/** Persistent left sidebar (03_APP_FLOW.md §1; UI brief §6.2). Lists only pages that exist. */
export function Sidebar({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  const rootHref = items[0]?.href;

  return (
    <nav
      aria-label={label}
      className="flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      <div className="flex h-14 items-center border-b border-sidebar-divider px-5">
        <span className="text-base font-semibold">TraceESG</span>
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
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-sidebar-foreground focus-visible:outline-none",
                  active
                    ? "bg-sidebar-active text-sidebar-active-foreground"
                    : "hover:bg-sidebar-hover hover:text-sidebar-hover-foreground",
                )}
              >
                <Icon className="size-5" strokeWidth={1.5} aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
