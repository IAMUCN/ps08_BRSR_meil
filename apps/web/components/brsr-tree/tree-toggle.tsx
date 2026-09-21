import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

// One expandable row of a BRSR tree (UI brief §21) — the readiness tree and the report drill-down are "the
// same interaction pattern applied at different entry points".
export function Toggle({
  open,
  onClick,
  depth,
  trailing,
  children,
}: {
  open: boolean;
  onClick: () => void;
  depth: number;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <div
      className="flex items-center gap-3 py-2 pr-3"
      style={{ paddingLeft: `${12 + depth * 24}px` }}
    >
      <button
        type="button"
        onClick={onClick}
        aria-expanded={open}
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
        {children}
      </button>
      {trailing}
    </div>
  );
}
