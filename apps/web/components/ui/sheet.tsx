"use client";

import * as React from "react";
import { cn } from "cn";
import { Dialog as SheetPrimitive } from "radix-ui";

import { Button } from "@/components/ui/button";
import { Maximize2Icon, Minimize2Icon, XIcon } from "lucide-react";

/**
 * A side panel. On a wide screen (1900px and up) a right-hand panel docks into the empty space beside the
 * page — no backdrop, the page stays usable — and its Expand button opens it full size over the page. On
 * anything narrower it opens over the page as before (owner's page feedback, 2026-10-09; A30).
 *
 * Non-modal so the page behind a docked panel can be clicked; the backdrop of the full-size view is our own.
 */
function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" modal={false} {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

// Docked: below the top bar, as wide as the space left of a full-width page (sidebar 15rem + page 80rem +
// gutters 3.5rem), whatever width the caller asked for. Every one is forced: the side-specific classes
// below (`data-[side=right]:inset-y-0`, `h-full`) would otherwise win and cover the top bar.
const DOCKED =
  "min-[1900px]:top-14! min-[1900px]:h-[calc(100vh-3.5rem)]! min-[1900px]:max-w-none! min-[1900px]:overflow-y-auto min-[1900px]:border-t min-[1900px]:shadow-none";
const DOCKED_WIDTH = "min-[1900px]:w-[clamp(20rem,calc(100vw-98.5rem),40rem)]!";
// Expanded (owner's page feedback, 2026-11-11): the whole window, over the sidebar and the top bar, from
// tablet width up. Esc or the button returns the panel to its size.
const EXPANDED =
  "md:inset-0! md:top-0! md:h-dvh! md:w-screen! md:max-w-none! md:border-0 md:overflow-y-auto";

/** Narrowest width a dragged panel may take, in pixels. */
const MIN_WIDTH = 360;
/** One arrow-key step on the resize handle. */
const KEY_STEP = 40;

/**
 * Which panel a remembered width belongs to: the page it opens on, with ids taken out, so a record panel
 * remembers one width for every record. A page with several kinds of panel names each with `panelKey`.
 */
function widthKey(panelKey: string | undefined) {
  if (typeof window === "undefined") return null;
  const page = window.location.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ":id");
  return `sheet-width:${panelKey ?? page}`;
}
function readWidth(key: string | null): number | null {
  if (!key) return null;
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value >= MIN_WIDTH ? value : null;
  } catch {
    return null;
  }
}
function storeWidth(key: string | null, width: number | null) {
  if (!key) return;
  try {
    if (width === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, String(Math.round(width)));
  } catch {
    // Storage blocked: the width lasts until the panel closes.
  }
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  onOpenAutoFocus,
  onCloseAutoFocus,
  onEscapeKeyDown,
  style,
  panelKey,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
  /** Names this kind of panel for its remembered width, when a page has more than one kind. */
  panelKey?: string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const resizable = side === "right";
  const key = React.useMemo(() => (resizable ? widthKey(panelKey) : null), [resizable, panelKey]);
  // The width the person dragged to (remembered per kind of panel in this browser), or null for the default.
  const [width, setWidth] = React.useState<number | null>(() => readWidth(key));
  const docks = side === "right" && !expanded;
  // The control that had focus when the panel opened: focus goes back to it when the panel closes.
  const opener = React.useRef<HTMLElement | null>(null);

  const clamp = (w: number) => Math.min(window.innerWidth, Math.max(MIN_WIDTH, w));
  const resizeTo = (w: number) => {
    // Dragged (or stepped) to the whole window: that is Expand.
    if (w >= window.innerWidth - 8) {
      setExpanded(true);
      return;
    }
    const next = clamp(w);
    setExpanded(false);
    setWidth(next);
    storeWidth(key, next);
  };
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => resizeTo(window.innerWidth - e.clientX);
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  };
  const sized = resizable && !expanded && width !== null;
  return (
    <SheetPortal>
      <SheetPrimitive.Close asChild>
        <div
          data-slot="sheet-overlay"
          aria-hidden
          className={cn(
            "fixed inset-0 z-50 bg-[var(--overlay)] supports-backdrop-filter:backdrop-blur-xs",
            docks && "min-[1900px]:hidden",
          )}
        />
      </SheetPrimitive.Close>
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        // Clicking the page must not close a docked panel; the backdrop above closes the full-size one.
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          opener.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          onOpenAutoFocus?.(event);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (!event.defaultPrevented && opener.current?.isConnected) {
            event.preventDefault();
            opener.current.focus();
          }
        }}
        // Esc first returns an expanded panel to its size; a second Esc closes it.
        onEscapeKeyDown={(event) => {
          onEscapeKeyDown?.(event);
          if (!event.defaultPrevented && expanded) {
            event.preventDefault();
            setExpanded(false);
          }
        }}
        // The dragged width applies from tablet up; on a phone the panel keeps its own width.
        style={sized ? { ...style, ["--sheet-w" as string]: `${width}px` } : style}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-full data-[side=left]:sm:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-full data-[side=right]:sm:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-[480px] data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-10 data-[side=left]:data-open:slide-in-from-left-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=top]:data-open:slide-in-from-top-10 data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-closed:slide-out-to-right-10 data-[side=top]:data-closed:slide-out-to-top-10",
          className,
          docks && DOCKED,
          docks && !sized && DOCKED_WIDTH,
          sized && "md:w-[var(--sheet-w)]! md:max-w-none!",
          side === "right" && expanded && EXPANDED,
        )}
        {...props}
      >
        {children}
        {resizable ? (
          // The resize handle on the inner edge (owner's page feedback, 2026-11-11): drag, double-click for
          // the default width, or ← / → when focused.
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
            aria-valuemin={MIN_WIDTH}
            aria-valuenow={width ?? undefined}
            tabIndex={0}
            title="Drag to resize · double-click for the default width"
            onPointerDown={startDrag}
            onDoubleClick={() => {
              setExpanded(false);
              setWidth(null);
              storeWidth(key, null);
            }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const panel = event.currentTarget.parentElement;
              const now = expanded
                ? window.innerWidth
                : (width ?? panel?.getBoundingClientRect().width ?? MIN_WIDTH);
              resizeTo(now + (event.key === "ArrowLeft" ? KEY_STEP : -KEY_STEP));
            }}
            className="absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize touch-none outline-none select-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent hover:after:bg-ring focus-visible:after:w-0.5 focus-visible:after:bg-ring md:block"
          />
        ) : null}
        {side === "right" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            // From tablet width up; on a phone the panel already covers the screen.
            className={cn(
              "absolute top-3 hidden md:inline-flex",
              showCloseButton ? "right-12" : "right-3",
            )}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <Minimize2Icon /> : <Maximize2Icon />}
            <span className="sr-only">{expanded ? "Collapse" : "Expand"}</span>
          </Button>
        ) : null}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button variant="ghost" className="absolute top-3 right-3" size="icon-sm">
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4 pr-20", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-heading text-base font-medium text-foreground", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
