"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

// Tooltip and interactive-mark plumbing shared by the SVG charts. A mark is a real link when it drills down
// (so it opens in a new tab, shows its address and works from the keyboard) and a focusable group otherwise;
// hover and focus both show the tooltip.

export type Tip = { x: number; y: number; text: string } | null;

export function useTip() {
  const [tip, setTip] = useState<Tip>(null);
  return { tip, show: (t: NonNullable<Tip>) => setTip(t), hide: () => setTip(null) };
}

/** Positions are in viewBox units; the wrapper turns them into percentages so the tip follows a resized chart. */
export function ChartCanvas({
  width,
  height,
  tip,
  label,
  children,
}: {
  width: number;
  height: number;
  tip: Tip;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label={label}
        className="block h-auto w-full overflow-visible"
      >
        {children}
      </svg>
      {tip ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 max-w-60 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2 py-1 text-xs leading-4 text-popover-foreground shadow-md"
          style={{ left: `${(tip.x / width) * 100}%`, top: `${(tip.y / height) * 100}%` }}
        >
          {tip.text}
        </div>
      ) : null}
    </div>
  );
}

export function Mark({
  href,
  label,
  at,
  text,
  show,
  hide,
  children,
}: {
  href?: string;
  /** Read out by a screen reader; the tooltip says the same. */
  label: string;
  at: { x: number; y: number };
  text: string;
  show: (t: NonNullable<Tip>) => void;
  hide: () => void;
  children: ReactNode;
}) {
  const events = {
    onMouseEnter: () => show({ ...at, text }),
    onMouseLeave: hide,
    onFocus: () => show({ ...at, text }),
    onBlur: hide,
  };
  const focus = "outline-none [&:focus-visible_*]:stroke-foreground [&:focus-visible_*]:stroke-2";
  return href ? (
    <Link href={href} aria-label={label} className={focus} {...events}>
      {children}
    </Link>
  ) : (
    <g tabIndex={0} role="img" aria-label={label} className={focus} {...events}>
      {children}
    </g>
  );
}
