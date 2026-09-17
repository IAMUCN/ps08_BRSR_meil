import { LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { NotificationBell } from "@/components/shell/notification-bell";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";
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
  const roles = [...new Set(session.assignments.map((a) => a.roleName))].join(", ");

  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-4 border-b bg-surface px-6">
      <NotificationBell viewAllHref={notificationsHref} />
      <p className="text-right text-sm leading-5">
        <span className="font-semibold">{session.displayName}</span>
        {roles ? (
          <span className="block text-xs leading-4 text-muted-foreground">{roles}</span>
        ) : null}
      </p>
      <Button asChild variant="ghost" size="sm">
        <Link href={profileHref}>
          <UserRound aria-hidden />
          Profile
        </Link>
      </Button>
      <form action={signOutAction}>
        <Button type="submit" variant="outline" size="sm">
          <LogOut aria-hidden />
          Log out
        </Button>
      </form>
    </header>
  );
}
