"use client";

import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from "motion/react";
import { useId, useState, type ReactNode } from "react";

// The Help page's questions (UI_NOTES.md, 2026-11-12). Each answer opens and closes with a height and fade
// animation and the chevron turns; the list arrives one question after another the first time it scrolls into
// view. People who ask for reduced motion get the same content with no movement. Answers are rendered on the
// server and passed in as children.

const EASE = [0.2, 0, 0, 1] as const;

export function FaqList({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  // The markup is the same with and without reduced motion (the server cannot know the preference); only the
  // timings differ, and MotionConfig drops the slide.
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className="space-y-2"
        initial="hidden"
        whileInView="shown"
        viewport={{ once: true, amount: 0.15 }}
        variants={{ hidden: {}, shown: { transition: { staggerChildren: reduce ? 0 : 0.06 } } }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}

export function FaqItem({ q, children }: { q: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const id = useId();
  const duration = reduce ? 0 : 0.26;

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 8 },
        shown: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.3, ease: EASE } },
      }}
      data-open={open}
      className="rounded-md border border-border transition-colors data-[open=true]:border-ring/60 data-[open=true]:bg-muted/40"
    >
      <h3>
        <button
          type="button"
          id={`${id}-q`}
          aria-expanded={open}
          aria-controls={`${id}-a`}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md p-3 text-left font-medium outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span>{q}</span>
          <motion.span
            aria-hidden
            className="shrink-0 text-muted-foreground"
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration, ease: EASE }}
          >
            <ChevronDown className="size-4" />
          </motion.span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="answer"
            id={`${id}-a`}
            role="region"
            aria-labelledby={`${id}-q`}
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration, ease: EASE }}
          >
            <div className="space-y-2 px-3 pb-3">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
