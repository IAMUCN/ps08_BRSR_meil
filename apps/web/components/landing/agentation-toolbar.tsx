"use client";

import dynamic from "next/dynamic";

const Agentation = dynamic(() => import("agentation").then((mod) => mod.Agentation), {
  ssr: false,
});

// Design-feedback overlay: development only, never shipped to visitors.
export function AgentationToolbar() {
  if (process.env.NODE_ENV !== "development") return null;
  return <Agentation />;
}
