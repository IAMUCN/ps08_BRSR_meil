"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setThemeAction } from "@/lib/profile/actions";
import { applyTheme, THEMES, type ThemeId } from "@/lib/theme";

/**
 * UI brief §4: a three-option segmented control. Native radios, so arrow keys move between themes. The
 * choice applies at once and is saved on the account; a failed save puts the previous theme back.
 */
export function ThemePicker({ current }: { current: ThemeId }) {
  const [theme, setTheme] = useState(current);
  const [pending, start] = useTransition();

  function choose(next: ThemeId) {
    const previous = theme;
    setTheme(next);
    applyTheme(next);
    start(async () => {
      const result = await setThemeAction({ theme: next });
      if (result.ok) return;
      setTheme(previous);
      applyTheme(previous);
      toast.error(`Theme not saved — ${result.error}`);
    });
  }

  return (
    <fieldset aria-busy={pending}>
      <legend className="text-sm font-medium">Theme</legend>
      <div className="mt-2 inline-flex flex-wrap rounded-md border bg-surface-elevated p-1">
        {THEMES.map((t) => (
          <label
            key={t.id}
            className="flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm has-checked:bg-card has-checked:font-medium has-checked:shadow-sm has-focus-visible:ring-2 has-focus-visible:ring-ring"
          >
            <input
              type="radio"
              name="theme"
              value={t.id}
              checked={theme === t.id}
              onChange={() => choose(t.id)}
              className="sr-only"
            />
            {/* A swatch drawn from the theme's own tokens (no hard-coded colours). */}
            <span
              data-theme={t.id}
              aria-hidden
              className="flex size-5 overflow-hidden rounded-full border border-border"
            >
              <span className="w-1/2 bg-sidebar" />
              <span className="w-1/2 bg-background" />
            </span>
            <span>
              {t.label}
              <span className="sr-only"> — {t.description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
