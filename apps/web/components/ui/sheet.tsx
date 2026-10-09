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
  "min-[1900px]:top-14! min-[1900px]:h-[calc(100vh-3.5rem)]! min-[1900px]:w-[clamp(20rem,calc(100vw-98.5rem),40rem)]! min-[1900px]:max-w-none! min-[1900px]:overflow-y-auto min-[1900px]:border-t min-[1900px]:shadow-none";
// Expanded: a large window over the page, whatever the panel's usual width.
const EXPANDED = "min-[1900px]:w-[min(1400px,94vw)]! min-[1900px]:max-w-none!";

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const docks = side === "right" && !expanded;
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
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-[480px] data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-10 data-[side=left]:data-open:slide-in-from-left-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=top]:data-open:slide-in-from-top-10 data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-closed:slide-out-to-right-10 data-[side=top]:data-closed:slide-out-to-top-10",
          className,
          docks && DOCKED,
          side === "right" && expanded && EXPANDED,
        )}
        {...props}
      >
        {children}
        {side === "right" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            // Only where docking applies; elsewhere the panel is already full size.
            className={cn(
              "absolute top-3 hidden min-[1900px]:inline-flex",
              showCloseButton ? "right-12" : "right-3",
            )}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <Minimize2Icon /> : <Maximize2Icon />}
            <span className="sr-only">{expanded ? "Dock to the side" : "Expand"}</span>
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
