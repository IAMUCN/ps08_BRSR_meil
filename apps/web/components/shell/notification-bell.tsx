"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NotificationRow } from "@/components/notifications/notification-item";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { pollNotificationsAction } from "@/lib/notifications/actions";
import type { NotificationItem } from "@/lib/trpc/routers/notifications";

const POLL_MS = 30_000;

/**
 * Top-bar bell (UI brief §14): red dot when anything is unread, the 5 most recent in a dropdown.
 * Polls every 30 s and on window focus — no Realtime (.grill/phase-6-ocr-integration-decisions.md).
 */
export function NotificationBell({ viewAllHref }: { viewAllHref?: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ hasUnread: boolean; items: NotificationItem[] } | null>(
    null,
  );

  const refresh = useCallback(async () => {
    const result = await pollNotificationsAction();
    if (result.ok) setState(result.data);
  }, []);

  useEffect(() => {
    // Initial fetch runs as a timer callback, like the polls, so state isn't set during the effect.
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, POLL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  const hasUnread = state?.hasUnread ?? false;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void refresh();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-lg"
          className="relative"
          aria-label={hasUnread ? "Notifications, unread items" : "Notifications"}
        >
          <Bell className="size-5" strokeWidth={1.5} aria-hidden />
          {hasUnread ? (
            <span
              className="absolute top-1.5 right-1.5 size-2 rounded-full bg-status-error ring-2 ring-header"
              aria-hidden
            />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Notifications" className="w-96 p-0">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm leading-5 font-semibold">Notifications</h2>
        </div>
        {state === null ? (
          <div className="space-y-2 p-4" aria-label="Loading notifications">
            {[0, 1].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-sm bg-surface-elevated" />
            ))}
          </div>
        ) : state.items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No notifications yet.
          </p>
        ) : (
          <ul className="max-h-[420px] divide-y overflow-y-auto">
            {state.items.map((item) => (
              <li key={item.id}>
                <NotificationRow item={item} onNavigate={() => setOpen(false)} />
              </li>
            ))}
          </ul>
        )}
        {viewAllHref ? (
          <div className="border-t px-4 py-2 text-right">
            <Button asChild variant="ghost" size="sm" onClick={() => setOpen(false)}>
              <Link href={viewAllHref}>View all</Link>
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
