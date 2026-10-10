"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TooltipContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const TooltipContext = React.createContext<TooltipContextType>({
  open: false,
  setOpen: () => {},
});

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function Tooltip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      <div
        className="relative inline-flex items-center justify-center"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </div>
    </TooltipContext.Provider>
  );
}

export function TooltipTrigger({
  children,
  asChild,
  className,
  ...props
}: {
  children: React.ReactNode;
  asChild?: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  if (asChild && React.isValidElement(children)) {
    return children;
  }
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}

export function TooltipContent({
  children,
  className,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const { open } = React.useContext(TooltipContext);
  if (!open) return null;
  return (
    <div
      role="tooltip"
      className={cn(
        "absolute -top-10 left-1/2 -translate-x-1/2 z-50 overflow-hidden rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white shadow-md pointer-events-none whitespace-nowrap animate-in fade-in-0 zoom-in-95",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
