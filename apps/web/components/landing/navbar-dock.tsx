"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Dock, DockItem } from "@/registry/magicui/dock";
import { NAV_ITEMS } from "@/components/landing/links";

export function NavbarDock({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <Dock variant="bare" direction="middle" className="gap-8" iconDistance={120}>
        {NAV_ITEMS.map((item) => (
          <DockItem key={item.label} distance={120} maxScale={1.06}>
            <Link
              href={item.href}
              draggable={false}
              className="block select-none whitespace-nowrap text-sm font-medium text-slate-600 transition-colors hover:text-[#313490]"
            >
              {item.label}
            </Link>
          </DockItem>
        ))}
      </Dock>
    </div>
  );
}
