"use client";

import { MotionConfig } from "motion/react";

// Honors the visitor's reduced-motion setting for every Magic UI animation on the page.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
