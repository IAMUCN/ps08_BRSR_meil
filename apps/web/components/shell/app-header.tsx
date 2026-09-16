import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";
import type { ActiveSession } from "@/lib/auth/session";

// Phase 3 minimal shell header — the full sidebar/top-bar shell (UI brief §19–§20) is built in Phase 4.
export function AppHeader({
  session,
  area,
}: {
  session: ActiveSession;
  area: "Admin" | "Workspace";
}) {
  const roleLabel = [...new Set(session.assignments.map((a) => a.roleName))].join(", ");

  return (
    <header className="flex h-14 items-center justify-between border-b bg-surface px-6">
      <p className="text-sm font-semibold">
        <span className="text-primary">TraceESG</span>
        <span className="text-muted-foreground"> · {area}</span>
      </p>
      <div className="flex items-center gap-4">
        <p className="text-right text-sm leading-5">
          <span className="font-semibold">{session.displayName}</span>
          {roleLabel ? (
            <span className="block text-xs leading-4 text-muted-foreground">{roleLabel}</span>
          ) : null}
        </p>
        <form action={signOutAction}>
          <Button type="submit" variant="outline" size="sm">
            <LogOut aria-hidden />
            Log out
          </Button>
        </form>
      </div>
    </header>
  );
}
