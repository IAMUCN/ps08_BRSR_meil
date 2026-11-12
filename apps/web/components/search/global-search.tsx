"use client";

import { Loader2, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { globalSearchAction } from "@/lib/search/actions";
import { MIN_QUERY, type SearchResult } from "@/lib/search/rules";

// The top-bar search (feature_enhancement.md 8.3, requirement 19; A48). Ctrl+K (or ⌘K) opens it anywhere. The
// server decides what each person may find; the section of the current page is listed first.

const DEBOUNCE_MS = 250;

export function GlobalSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const latest = useRef(0);
  const listId = useId();

  // Ctrl+K / ⌘K anywhere; "/" when not typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Ask the server after a pause in typing; an older answer never replaces a newer one.
  useEffect(() => {
    if (!open) return;
    const ticket = ++latest.current;
    const timer = window.setTimeout(
      async () => {
        setLoading(true);
        const response = await globalSearchAction({ q: query, pathname });
        if (ticket !== latest.current) return;
        setLoading(false);
        if (response.ok) {
          setResult(response.data);
          setError(null);
        } else setError(response.error);
        setActive(0);
      },
      query.trim().length < MIN_QUERY ? 0 : DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [open, query, pathname]);

  const hits = useMemo(
    () =>
      (result?.sections ?? []).flatMap((s) => s.hits.map((hit) => ({ ...hit, section: s.key }))),
    [result],
  );

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!hits.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(hits[active].href);
    }
  }

  // Where each section starts in the flat list the arrow keys move through.
  const starts = useMemo(
    () =>
      (result?.sections ?? []).map((_, i, all) =>
        all.slice(0, i).reduce((sum, section) => sum + section.hits.length, 0),
      ),
    [result],
  );

  const short = query.trim().length < MIN_QUERY;
  // The audit-trail link is always offered; "no matches" means nothing else was found.
  const nothingFound =
    !!result &&
    result.query === query &&
    !loading &&
    !result.sections.some((s) => s.key !== "audit" && s.hits.length > 0);
  const searched = result?.searched.join(", ");

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-keyshortcuts="Control+K Meta+K"
        className="gap-2"
      >
        <Search aria-hidden />
        <span className="sr-only sm:not-sr-only">Search</span>
        <kbd className="hidden rounded border border-current/30 px-1 font-mono text-[10px] leading-4 lg:inline">
          Ctrl K
        </kbd>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="top-[12vh] translate-y-0 gap-3 p-0 sm:max-w-xl"
          showCloseButton={false}
        >
          <div className="border-b border-border px-4 pt-4 pb-3">
            <DialogTitle className="sr-only">Search EmeilSG</DialogTitle>
            <DialogDescription className="sr-only">
              Results are limited to what your role may open. Use the arrow keys to move and Enter
              to open.
            </DialogDescription>
            <div className="flex items-center gap-2">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                autoFocus
                role="combobox"
                aria-expanded={hits.length > 0}
                aria-controls={listId}
                aria-activedescendant={hits.length ? `${listId}-${active}` : undefined}
                aria-autocomplete="list"
                aria-label="Search"
                placeholder="Search records, people, org units, reports, pages…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                maxLength={100}
                className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {loading ? (
                <Loader2
                  className="size-4 shrink-0 animate-spin text-muted-foreground"
                  aria-hidden
                />
              ) : null}
            </div>
          </div>
          {/* Focusable so the results can be scrolled from the keyboard too. */}
          <div
            className="max-h-[60vh] overflow-y-auto px-2 pb-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-live="polite"
            tabIndex={0}
            aria-label="Search results"
          >
            {error ? (
              <p className="px-2 py-3 text-sm text-status-error">{error}</p>
            ) : short ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                Type at least {MIN_QUERY} characters.
                {searched ? ` Searching ${searched}.` : ""}
              </p>
            ) : (
              <>
                {nothingFound ? (
                  <div className="px-2 py-3 text-sm">
                    <p>No matches for “{query.trim()}”.</p>
                    <p className="mt-1 text-muted-foreground">
                      Searched {searched}. Every word must match; try fewer or shorter words.
                    </p>
                  </div>
                ) : null}
                <ul id={listId} role="listbox" aria-label="Search results" className="space-y-2">
                  {(result?.sections ?? []).map((section, sectionIndex) => (
                    <li key={section.key} role="presentation">
                      <p className="px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        {section.label}
                      </p>
                      <ul role="group" aria-label={section.label}>
                        {section.hits.map((hit, hitIndex) => {
                          const i = starts[sectionIndex] + hitIndex;
                          return (
                            <li
                              key={`${section.key}-${hit.href}-${i}`}
                              id={`${listId}-${i}`}
                              role="option"
                              aria-selected={i === active}
                              onMouseEnter={() => setActive(i)}
                              onClick={() => go(hit.href)}
                              className={cn(
                                "cursor-pointer rounded-md px-2 py-1.5",
                                i === active ? "bg-muted" : "hover:bg-muted/60",
                              )}
                            >
                              <span className="block truncate text-sm font-medium">
                                {hit.title}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {hit.detail}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
