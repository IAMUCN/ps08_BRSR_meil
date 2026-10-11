"use client";

import dynamic from "next/dynamic";

// The page-feedback widget is a development tool. It is loaded only in development, and from a branch a
// production build removes, so none of its code is shipped to visitors (final verification, 2026-10-12:
// it used to be imported by the root layout and ended up in the production bundle, never rendered).
const Agentation =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("agentation").then((module) => module.Agentation), { ssr: false })
    : null;

export function FeedbackWidget() {
  return Agentation ? <Agentation endpoint="http://localhost:4747" /> : null;
}
