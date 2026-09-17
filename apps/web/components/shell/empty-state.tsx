import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** UI brief §15.2: short explanation plus the next action, 48px line icon, never a bare "No data". */
export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <Icon className="size-12 text-muted-foreground" strokeWidth={1.5} aria-hidden />
      <h1 className="text-xl leading-7 font-semibold">{title}</h1>
      <p className="max-w-sm text-sm leading-5 text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
