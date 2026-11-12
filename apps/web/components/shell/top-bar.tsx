import Link from "next/link";
import { LogoWordmark } from "@/components/brand/logo-mark";
import { MobileMenuTrigger } from "@/components/shell/sidebar";
import { ProfileMenu } from "@/components/shell/profile-menu";
import { GlobalSearch } from "@/components/search/global-search";
import { NotificationBell } from "@/components/shell/notification-bell";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import type { ActiveSession } from "@/lib/auth/session";

/**
 * Top bar (03_APP_FLOW.md §1). The org/period context switcher arrives with its data (Phase 16) —
 * built-pages-only rule. Admin has the bell dropdown only, no full notifications page (§2.3).
 */
export function TopBar({
  session,
  profileHref,
  notificationsHref,
}: {
  session: ActiveSession;
  profileHref: string;
  notificationsHref?: string;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 w-full shrink-0 items-center justify-between gap-2 border-b bg-header/95 px-3 text-header-foreground backdrop-blur sm:px-4 md:justify-end md:gap-4 md:px-6">
      {/* Mobile top-left: Menu button + EmeilSG title text only (owner feedback 2026-11-13) */}
      <div data-shell="mobile-top-bar" className="flex shrink-0 items-center gap-2 md:hidden">
        <MobileMenuTrigger />
        <Link
          href={profileHref.startsWith("/admin") ? "/admin" : "/app"}
          className="flex shrink-0 items-center"
          aria-label="EmeilSG home"
        >
          <LogoWordmark className="h-8 w-auto shrink-0" />
        </Link>
      </div>

      {/* Right controls: search, theme, notifications, profile */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-2 md:gap-3">
        <GlobalSearch />
        <ThemeToggle current={session.theme} />
        <NotificationBell viewAllHref={notificationsHref} />
        <ProfileMenu session={session} profileHref={profileHref} />
      </div>
    </header>
  );
}
