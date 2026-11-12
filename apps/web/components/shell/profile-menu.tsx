"use client";

import { LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { signOutAction } from "@/lib/auth/actions";
import type { ActiveSession } from "@/lib/auth/session";

export function ProfileMenu({
  session,
  profileHref,
}: {
  session: ActiveSession;
  profileHref: string;
}) {
  const [open, setOpen] = useState(false);
  const roles = [...new Set(session.assignments.map((a) => a.roleName))].join(", ");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="size-9 p-0 shrink-0 sm:size-auto sm:h-8 sm:px-2 sm:gap-1.5 text-header-foreground hover:bg-header-hover focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="User profile and account menu"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
            {session.displayName.slice(0, 1).toUpperCase()}
          </span>
          <span className="sr-only sm:not-sr-only text-xs font-medium max-w-[120px] truncate">
            {session.displayName}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-56 p-2 text-popover-foreground bg-popover shadow-lg border border-border rounded-xl"
      >
        <div className="px-2 py-1.5 border-b border-border mb-1">
          <p className="font-semibold text-sm truncate text-foreground">{session.displayName}</p>
          {roles ? <p className="text-xs text-muted-foreground truncate mt-0.5">{roles}</p> : null}
        </div>
        <div className="flex flex-col gap-0.5">
          <Link
            href={profileHref}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors"
          >
            <UserRound className="size-4 text-muted-foreground" aria-hidden />
            View profile
          </Link>
          <form action={signOutAction} className="w-full">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors cursor-pointer text-left"
            >
              <LogOut className="size-4" aria-hidden />
              Log out
            </button>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}
