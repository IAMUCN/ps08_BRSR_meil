"use client";

import { useEffect } from "react";
import { applyTheme, type ThemeId } from "@/lib/theme";

/** The account's theme wins over this browser's copy (UI brief §4: it follows the user across devices). */
export function ThemeSync({ theme }: { theme: ThemeId }) {
  useEffect(() => applyTheme(theme), [theme]);
  return null;
}
