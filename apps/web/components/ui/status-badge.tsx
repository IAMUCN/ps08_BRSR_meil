import { CircleCheck, CircleDashed, CircleX, Clock, Lock, type LucideIcon } from "lucide-react";
import { cn } from "cn";

// UI brief §11.7: one finite badge vocabulary; color is never the only signal (icon + text label).
// Text stays in the foreground color for AA contrast; the status color tints background, border and icon.
const TONES = {
  success: {
    icon: CircleCheck,
    className: "border-status-success/40 bg-status-success/10",
    iconClass: "text-status-success",
  },
  warning: {
    icon: Clock,
    className: "border-status-warning/50 bg-status-warning/10",
    iconClass: "text-status-warning",
  },
  error: {
    icon: CircleX,
    className: "border-status-error/40 bg-status-error/10",
    iconClass: "text-status-error",
  },
  neutral: {
    icon: CircleDashed,
    className: "border-border bg-muted",
    iconClass: "text-muted-foreground",
  },
  locked: { icon: Lock, className: "border-border bg-muted", iconClass: "text-muted-foreground" },
} satisfies Record<string, { icon: LucideIcon; className: string; iconClass: string }>;

export type StatusTone = keyof typeof TONES;

export function StatusBadge({ tone, children }: { tone: StatusTone; children: string }) {
  const { icon: Icon, className, iconClass } = TONES[tone];
  return (
    <span
      className={cn(
        // nowrap: a fixed-height badge in a narrow table cell must not break its words onto a second line
        // (owner's page feedback, 2026-11-11: "Pending approval" spilled out of its box).
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-sm border px-2 text-[11px] leading-[14px] font-medium tracking-wide whitespace-nowrap text-foreground uppercase",
        className,
      )}
    >
      <Icon className={cn("size-3.5", iconClass)} strokeWidth={1.5} aria-hidden />
      {children}
    </span>
  );
}
