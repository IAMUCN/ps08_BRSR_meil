"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

// The landing page's documentation tabs (UI_NOTES.md, 2026-11-12). The panels are rendered on the server and
// passed in; this only switches between them. Arrow keys, Home and End move between tabs, as a tab list should.
// The landing page's MotionProvider drops the slide for visitors who ask for reduced motion.

export type DocsTab = { id: string; label: string; content: ReactNode };

export function DocsTabs({ tabs }: { tabs: DocsTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === active);
    const next =
      e.key === "ArrowRight"
        ? (i + 1) % tabs.length
        : e.key === "ArrowLeft"
          ? (i - 1 + tabs.length) % tabs.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? tabs.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    setActive(tab.id);
    refs.current[tab.id]?.focus();
  };

  if (!current) return null;
  return (
    <div>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div
          role="tablist"
          aria-label="Documentation"
          onKeyDown={onKeyDown}
          className="mx-auto flex w-max gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-xs"
        >
          {tabs.map((tab) => {
            const selected = tab.id === current.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  refs.current[tab.id] = el;
                }}
                type="button"
                role="tab"
                id={`${base}-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`${base}-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(tab.id)}
                className={`relative min-h-11 rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#313490] focus-visible:ring-offset-2 ${
                  selected ? "text-white" : "text-slate-600 hover:text-[#313490]"
                }`}
              >
                {selected ? (
                  <motion.span
                    layoutId={`${base}-pill`}
                    className="absolute inset-0 rounded-lg bg-[#313490]"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  />
                ) : null}
                <span className="relative">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current.id}
            role="tabpanel"
            id={`${base}-panel-${current.id}`}
            aria-labelledby={`${base}-tab-${current.id}`}
            tabIndex={0}
            className="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#313490] focus-visible:ring-offset-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
          >
            {current.content}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
