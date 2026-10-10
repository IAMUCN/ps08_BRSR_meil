"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Dock, DockItem } from "@/registry/magicui/dock";

const NAV_ITEMS = [
  { href: "#infrastructure", label: "Infrastructure" },
  { href: "#brsr", label: "BRSR" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#product", label: "Product" },
  { href: "#governance", label: "Governance" },
  { href: "#performance", label: "Performance" },
];

export function NavbarDock({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <Dock
        variant="bare"
        direction="middle"
        className="gap-6 sm:gap-7 lg:gap-8"
        iconDistance={140}
      >
        {NAV_ITEMS.map((item) => (
          <DockItem key={item.label} distance={140} maxScale={1.18}>
            <Link
              href={item.href}
              draggable={false}
              className="text-sm font-medium text-slate-700 hover:text-[#313490] transition-colors whitespace-nowrap block select-none"
            >
              {item.label}
            </Link>
          </DockItem>
        ))}
      </Dock>
    </div>
  );
}
