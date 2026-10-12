import { BellOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";
import { NotificationRow } from "@/components/notifications/notification-item";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { requireAppSession } from "@/lib/auth/session";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/trpc/routers/notifications";
import { api } from "@/lib/trpc/server";
import { MarkAllReadButton } from "./mark-all-read-button";

export const metadata: Metadata = { title: "Notifications · EmeilSG" };

const FILTERS = Object.entries(NOTIFICATION_TYPES) as [NotificationType, string][];

// 03_APP_FLOW.md §2.3 Notifications: the complete, filterable history behind the bell.
export default async function NotificationsPage({ searchParams }: PageProps<"/app/notifications">) {
  const [, params, caller] = await Promise.all([requireAppSession(), searchParams, api()]);
  const type = FILTERS.some(([key]) => key === params.type) ? (params.type as string) : undefined;
  const { hasUnread, items } = await caller.notifications.list({ limit: 200, type });

  return (
    <div className="max-w-3xl">
      <PageHeader title="Notifications" action={hasUnread ? <MarkAllReadButton /> : null} />

      <nav aria-label="Filter by type" className="mb-4">
        <ul className="flex flex-wrap gap-2">
          {[["", "All"] as const, ...FILTERS].map(([key, label]) => {
            const active = (type ?? "") === key;
            return (
              <li key={key || "all"}>
                <Link
                  href={key ? `/app/notifications?type=${key}` : "/app/notifications"}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center rounded-sm border px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-surface hover:bg-muted",
                  )}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {items.length === 0 ? (
        <EmptyState
          nested
          icon={BellOff}
          title="No notifications yet"
          message={
            type
              ? "Nothing of this type yet."
              : "You'll be notified here when a document is ready to verify."
          }
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-md border bg-card">
          {items.map((item) => (
            <li key={item.id}>
              <NotificationRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
