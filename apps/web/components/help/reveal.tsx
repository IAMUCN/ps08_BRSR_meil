"use client";

import { motion, MotionConfig, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

// The Help page's entrance animation (UI_NOTES.md, 2026-11-12): a group's items fade and rise one after another
// the first time the group scrolls into view. The markup is the same with and without reduced motion (the server
// cannot know the preference); with it the timings are zero and MotionConfig drops the movement.

const EASE = [0.2, 0, 0, 1] as const;

type GroupTag = "div" | "ol" | "ul";
type ItemTag = "div" | "li";

export function Reveal({
  as = "div",
  className,
  label,
  children,
}: {
  as?: GroupTag;
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const Tag = as === "ol" ? motion.ol : as === "ul" ? motion.ul : motion.div;
  return (
    <MotionConfig reducedMotion="user">
      <Tag
        className={className}
        aria-label={label}
        initial="hidden"
        whileInView="shown"
        viewport={{ once: true, amount: 0.1 }}
        variants={{ hidden: {}, shown: { transition: { staggerChildren: reduce ? 0 : 0.07 } } }}
      >
        {children}
      </Tag>
    </MotionConfig>
  );
}

export function RevealItem({
  as = "div",
  className,
  children,
}: {
  as?: ItemTag;
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const Tag = as === "li" ? motion.li : motion.div;
  return (
    <Tag
      className={className}
      variants={{
        hidden: { opacity: 0, y: 10 },
        shown: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.32, ease: EASE } },
      }}
    >
      {children}
    </Tag>
  );
}
