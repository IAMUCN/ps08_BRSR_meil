import { LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";
import type { ActiveSession } from "@/lib/auth/session";

/**
 * Top bar (03_APP_FLOW.md §1). The org/period context switcher and notifications bell are added with
 * the data and notifications they control (Phases 6/16) — built-pages-only rule.
 */
export function TopBar({ session, profileHref }: { session: ActiveSession; profileHref: string }) {
  const roles = [...new Set(session.assignments.map((a) => a.roleName))].join(", ");

  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-4 border-b bg-surface px-6">
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
