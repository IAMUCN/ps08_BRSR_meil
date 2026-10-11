"use client";

import { Check, Palette } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { setThemeAction } from "@/lib/profile/actions";
import { applyTheme, THEMES, type ThemeId } from "@/lib/theme";

/**
 * Top-bar theme picker (theme-toggle-decisions.md) — replaces the Profile page's full picker. A single
 * icon button, matching the notification bell's own trigger, opens a small menu of the three themes with
 * a live colour swatch each. Same behaviour as before: applies at once, saved on the account, rolled back
 * on a failed save.
 */
export function ThemeToggle({ current }: { current: ThemeId }) {
  const [theme, setTheme] = useState(current);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);

  /** Magic UI's AnimatedThemeToggler reveal: the new theme grows as a circle from the button (view transition). */
  function applyWithReveal(next: ThemeId) {
    const button = triggerRef.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!button || reduce || !document.startViewTransition) return applyTheme(next);
    const { top, left, width, height } = button.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Percentages, not pixels: the view-transition layer scales pixel coordinates with browser zoom and
    // display scaling (the circle then starts away from the button); percentages scale with it.
    // Radius 100% = hypot(w, h) / sqrt(2), so the end radius is the distance to the farthest corner.
    const at = `${(x / w) * 100}% ${(y / h) * 100}%`;
    const reach = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
    const end = (reach / (Math.hypot(w, h) / Math.SQRT2)) * 100;
    document
      .startViewTransition(() => applyTheme(next))
      .ready.then(() =>
        document.documentElement.animate(
          { clipPath: [`circle(0% at ${at})`, `circle(${end}% at ${at})`] },
          { duration: 500, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" },
        ),
      )
      .catch(() => {});
  }

  function choose(next: ThemeId) {
    setOpen(false);
    if (next === theme) return;
    const previous = theme;
    setTheme(next);
    applyWithReveal(next);
    start(async () => {
      const result = await setThemeAction({ theme: next });
      if (result.ok) return;
      setTheme(previous);
      applyTheme(previous);
      toast.error(`Theme not saved — ${result.error}`);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon-lg"
          aria-busy={pending}
          aria-label="Theme"
        >
          <Palette className="size-5" strokeWidth={1.5} aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1">
        <p className="px-2 py-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Theme
        </p>
        <div role="radiogroup" aria-label="Theme" className="space-y-0.5">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={theme === t.id}
              onClick={() => choose(t.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-sm px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                theme === t.id && "bg-accent/60",
              )}
            >
              {/* A live swatch drawn from the theme's own tokens, not a hard-coded colour. */}
              <span
                data-theme={t.id}
                aria-hidden
                className="flex size-6 shrink-0 overflow-hidden rounded-full border border-border shadow-sm"
              >
                <span className="w-1/2 bg-sidebar" />
                <span className="w-1/2 bg-background" />
              </span>
              <span className="flex-1 text-left">
                <span className="block font-medium">{t.label}</span>
                <span className="block text-xs text-muted-foreground">{t.description}</span>
              </span>
              {theme === t.id ? (
                <Check className="size-4 shrink-0 text-primary" aria-hidden />
              ) : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
