"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { NotificationRow } from "@/components/notifications/notification-item";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  markAllNotificationsReadAction,
  pollNotificationsAction,
} from "@/lib/notifications/actions";
import type { NotificationItem } from "@/lib/trpc/routers/notifications";

const POLL_MS = 5_000;
const SWEEP_EVERY = 12; // checks: deadline reminders about once a minute
const TOAST_MS = 6_000;
const MAX_SINGLE_TOASTS = 3;

/**
 * Top-bar bell (UI brief §14): red dot when anything is unread, the 5 most recent in a dropdown, and a
 * pop-up for each new notification. Checks every 5 s while the tab is visible and at once on return; a hidden
 * tab does not check (.grill/org-tree-users-notifications-periods-decisions.md). The server hands each
 * notification out once per account, so a reload or a second tab shows nothing again.
 */
export function NotificationBell({ viewAllHref }: { viewAllHref?: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ hasUnread: boolean; items: NotificationItem[] } | null>(
    null,
  );

  const router = useRouter();
  const checks = useRef(0);
  const checking = useRef(false);

  const refresh = useCallback(async () => {
    // One at a time: a slow answer is not overtaken by the next tick.
    if (checking.current || document.visibilityState !== "visible") return;
    checking.current = true;
    try {
      const sweep = checks.current % SWEEP_EVERY === 0;
      checks.current += 1;
      const result = await pollNotificationsAction(sweep);
      if (!result.ok) return;
      setState(result.data);
      const { total, items } = result.data.fresh;
      if (total > MAX_SINGLE_TOASTS) {
        toast(`${total} new notifications`, {
          duration: TOAST_MS,
          description: "Some arrived while you were away.",
          icon: <Bell className="size-4" aria-hidden />,
          action: {
            label: "View",
            onClick: () => router.push(viewAllHref ?? "/app/notifications"),
          },
        });
      } else {
        for (const item of items) {
          toast.custom(
            (id) => (
              <div className="w-[356px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border bg-card text-card-foreground shadow-lg">
                <NotificationRow item={item} onNavigate={() => toast.dismiss(id)} />
              </div>
            ),
            { id: item.id, duration: TOAST_MS },
          );
        }
      }
    } finally {
      checking.current = false;
    }
  }, [router, viewAllHref]);

  async function markAll() {
    const result = await markAllNotificationsReadAction();
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setState(
      (prev) =>
        prev && {
          ...prev,
          hasUnread: false,
          items: prev.items.map((item) => ({ ...item, isRead: true })),
        },
    );
  }

  useEffect(() => {
    // Initial fetch runs as a timer callback, like the polls, so state isn't set during the effect.
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, POLL_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
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
        <div className="flex min-h-12 items-center justify-between gap-2 border-b px-4 py-2">
          <h2 className="text-sm leading-5 font-semibold">Notifications</h2>
          {hasUnread ? (
            <Button type="button" variant="ghost" size="sm" onClick={markAll}>
              <CheckCheck aria-hidden />
              Mark all read
            </Button>
          ) : null}
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
