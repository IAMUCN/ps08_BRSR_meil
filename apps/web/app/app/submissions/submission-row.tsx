"use client";

import { useRouter } from "next/navigation";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "cn";

interface SubmissionRowProps extends ComponentPropsWithoutRef<"tr"> {
  href?: string | null;
  children: ReactNode;
}

export function SubmissionRow({
  href,
  className,
  children,
  onClick,
  ...props
}: SubmissionRowProps) {
  const router = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || !href) return;

    // Allow user to select/copy text without triggering navigation
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      return;
    }

    // If click was on an existing link, button, or form control, let it handle it
    const target = e.target as HTMLElement | null;
    if (target?.closest("a, button, input, select, textarea")) {
      return;
    }

    // Support Cmd/Ctrl + click to open in a new tab
    if (e.metaKey || e.ctrlKey) {
      window.open(href, "_blank");
      return;
    }

    router.push(href);
  };

  return (
    <tr
      onClick={handleClick}
      className={cn(
        "group border-t border-table-border bg-table-row even:bg-table-row-alt hover:bg-table-row-hover",
        href && "cursor-pointer",
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
}
