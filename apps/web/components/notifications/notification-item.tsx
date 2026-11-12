"use client";

import {
  AlertTriangle,
  Bell,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  FileText,
  FileX,
  RotateCcw,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "cn";
import { markNotificationReadAction } from "@/lib/notifications/actions";
import type { NotificationItem } from "@/lib/trpc/routers/notifications";

// UI brief §14: an icon per type; icons never carry meaning alone (the title says it too).
const ICONS: Record<string, { icon: LucideIcon; className: string }> = {
  verification_needed: { icon: FileSearch, className: "text-primary-text" },
  low_confidence: { icon: AlertTriangle, className: "text-status-warning" },
  ocr_failed: { icon: FileX, className: "text-status-error" },
  returned: { icon: RotateCcw, className: "text-status-error" },
  validation_review: { icon: ShieldAlert, className: "text-status-warning" },
  approval_needed: { icon: ClipboardCheck, className: "text-primary-text" },
  approved: { icon: CheckCircle2, className: "text-status-success" },
  calculation_blocked: { icon: Calculator, className: "text-status-warning" },
  report_ready: { icon: FileText, className: "text-status-success" },
  report_failed: { icon: FileX, className: "text-status-error" },
  deadline_approaching: { icon: AlertTriangle, className: "text-status-warning" },
  period_closed: { icon: AlertTriangle, className: "text-status-warning" },
};

const relative = new Intl.RelativeTimeFormat("en-IN", { numeric: "auto" });

function relativeTime(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) {
      return relative
        .formatToParts(Math.trunc(seconds / size), unit)
        .map((part) => part.value)
        .join("");
    }
  }
  return "just now";
}

/** One notification; clicking marks it read and deep-links to its record (03_APP_FLOW.md §0.2). */
export function NotificationRow({
  item,
  onNavigate,
}: {
  item: NotificationItem;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const { icon: Icon, className } = ICONS[item.type] ?? {
    icon: Bell,
    className: "text-muted-foreground",
  };

  async function open() {
    onNavigate?.();
    if (!item.isRead) await markNotificationReadAction(item.id);
    router.push(item.deepLinkPath);
  }

  return (
    <button
      type="button"
      onClick={open}
      className={cn(
        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
        !item.isRead && "bg-primary/5",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", className)} strokeWidth={1.5} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-5 font-semibold">
          {item.title}
          {!item.isRead ? <span className="sr-only"> (unread)</span> : null}
        </span>
        <span className="block text-sm leading-5 break-words text-muted-foreground">
          {item.message}
        </span>
        {/* "5 seconds ago" is a different string by the time the browser hydrates: expected, not an error. */}
        <span className="block text-xs leading-4 text-muted-foreground" suppressHydrationWarning>
          {relativeTime(item.createdAt)}
        </span>
      </span>
      {!item.isRead ? (
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-status-error" aria-hidden />
      ) : null}
    </button>
  );
}
