"use client";

import React, { useSyncExternalStore } from "react";
import { Pointer, usePointer, type CursorMode } from "@/registry/magicui/pointer";

/**
 * Common SVG path for default and hovering arrow cursor variants:
 * - Tip: apex pointing top-left with rounded curve
 * - Right wing: angled downward ~42° with rounded tip
 * - Notch: inner concave fillet
 * - Tail: lowest point on the bottom-left with rounded base
 */
const CURSOR_PATH =
  "M 3.2 4.4 Q 2.8 3.2 3.8 3.9 L 19.8 18.0 Q 20.8 18.8 19.7 19.1 L 12.5 19.6 Q 11.5 19.8 10.9 20.6 L 5.1 27.4 Q 4.4 28.3 4.2 27.2 Z";

/**
 * SVG path for the Minimal Blue I-Beam Cursor:
 * - Smaller, narrower silhouette matching reference icon
 * - Top & bottom horizontal bars with rounded pill caps
 * - Centered vertical stem connecting both bars
 * - Centered at (6, 10) in a 12x20 viewBox
 */
const IBEAM_PATH =
  "M 3.6 2.0 A 0.9 0.9 0 0 0 3.6 3.8 L 5.2 3.8 L 5.2 16.2 L 3.6 16.2 A 0.9 0.9 0 0 0 3.6 18.0 L 8.4 18.0 A 0.9 0.9 0 0 0 8.4 16.2 L 6.8 16.2 L 6.8 3.8 L 8.4 3.8 A 0.9 0.9 0 0 0 8.4 2.0 Z";

/**
 * Default subtle soft gray shadow
 */
const DEFAULT_FILTER =
  "drop-shadow(0px 1.5px 3px rgba(0, 0, 0, 0.12)) drop-shadow(0px 3px 6px rgba(0, 0, 0, 0.07))";

/**
 * Refined blue/indigo glow matching "Hovering Indigo Cursor.png"
 */
const HOVER_FILTER =
  "drop-shadow(0px 0px 4px rgba(67, 97, 238, 0.65)) drop-shadow(0px 0px 10px rgba(49, 52, 144, 0.45)) drop-shadow(0px 2px 14px rgba(67, 97, 238, 0.35))";

/**
 * Subtle soft shadow matching "Minimal Blue I-Beam Cursor Icon.png"
 */
const IBEAM_FILTER =
  "drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.14)) drop-shadow(0px 2px 4px rgba(49, 52, 144, 0.18))";

/**
 * DefaultCursorIcon:
 * - Primary fill: #313490 (MEIL indigo/blue)
 * - Crisp white outline: stroke="#FFFFFF" strokeWidth="2.75" with round joins
 * - Soft gray shadow for default, radiant blue glow for hover
 */
export function DefaultCursorIcon({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "hover";
}) {
  const isHover = variant === "hover";

  return (
    <svg
      width="24"
      height="30"
      viewBox="0 0 24 30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{
        overflow: "visible",
        filter: isHover ? HOVER_FILTER : DEFAULT_FILTER,
        transition: "filter 0.18s ease-out",
      }}
      aria-hidden="true"
    >
      <path
        d={CURSOR_PATH}
        fill="#313490"
        stroke="#FFFFFF"
        strokeWidth="2.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ paintOrder: "stroke fill" }}
      />
    </svg>
  );
}

/**
 * Dedicated HoveringCursorIcon matching "Hovering Indigo Cursor.png":
 * - Same indigo body and crisp white outline
 * - Radiant blue/indigo drop shadow glow
 */
export function HoveringCursorIcon({ className }: { className?: string }) {
  return <DefaultCursorIcon variant="hover" className={className} />;
}

/**
 * Minimal Blue I-Beam Cursor Icon matching "Minimal Blue I-Beam Cursor Icon.png":
 * - Symmetrical capital serif I-beam with rounded pill caps
 * - Compact, narrow proportions (12x20)
 * - Primary fill: #313490 (MEIL indigo/blue)
 * - Crisp white outline: stroke="#FFFFFF" strokeWidth="1.6" with round joins
 * - Centered hotspot at (6, 10)
 */
export function IBeamCursorIcon({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="20"
      viewBox="0 0 12 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{
        overflow: "visible",
        filter: IBEAM_FILTER,
      }}
      aria-hidden="true"
    >
      <path
        d={IBEAM_PATH}
        fill="#313490"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ paintOrder: "stroke fill" }}
      />
    </svg>
  );
}

/**
 * Filter for the Red Prohibition Symbol matching "Red Prohibition Symbol.png"
 */
const PROHIBITION_FILTER =
  "drop-shadow(0px 1px 2.5px rgba(0, 0, 0, 0.16)) drop-shadow(0px 2px 6px rgba(233, 16, 41, 0.28))";

/**
 * Red Prohibition Symbol Icon matching "Red Prohibition Symbol.png":
 * - Outer circular red ring with crisp white border and soft red-tinted shadow
 * - Solid white interior disc
 * - Symmetrical 45-degree red cross with rounded caps in the center
 * - Sized 22x22 with centered hotspot at (11, 11)
 */
export function ProhibitionCursorIcon({ className }: { className?: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{
        overflow: "visible",
        filter: PROHIBITION_FILTER,
      }}
      aria-hidden="true"
    >
      {/* Base white fill disk to keep interior pure white over any background */}
      <circle cx="11" cy="11" r="9.2" fill="#FFFFFF" />

      {/* Outer red ring with crisp white border */}
      <circle
        cx="11"
        cy="11"
        r="7.9"
        fill="none"
        stroke="#E91029"
        strokeWidth="2.2"
      />
      <circle
        cx="11"
        cy="11"
        r="9.2"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.2"
      />

      {/* Centered red cross with rounded caps */}
      <line
        x1="7.9"
        y1="7.9"
        x2="14.1"
        y2="14.1"
        stroke="#E91029"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <line
        x1="14.1"
        y1="7.9"
        x2="7.9"
        y2="14.1"
        stroke="#E91029"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Internal renderer that renders the appropriate SVG based on the active cursorMode
 */
export function CursorRenderer() {
  const { cursorMode } = usePointer();

  if (cursorMode === "not-allowed") {
    return <ProhibitionCursorIcon />;
  }

  if (cursorMode === "ibeam") {
    return <IBeamCursorIcon />;
  }

  return <DefaultCursorIcon variant={cursorMode === "hover" ? "hover" : "default"} />;
}

/**
 * CustomCursor component that mounts the sitewide custom cursor.
 * - Tracks smoothly with zero input lag.
 * - Dynamically renders:
 *   - "default": Indigo arrow with soft gray shadow (hotspot 2, 2)
 *   - "hover": Indigo arrow with radiant blue glow (hotspot 2, 2)
 *   - "ibeam": Minimal Blue I-Beam cursor over inputs & textareas (hotspot 6, 10)
 *   - "not-allowed": Red Prohibition Symbol over disabled elements (hotspot 11, 11)
 * - Disabled on touch/coarse devices and respects prefers-reduced-motion.
 */
export function CustomCursor({ className }: { className?: string }) {
  // False on the server and during hydration, true afterwards, without a setState-in-effect.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!mounted) return null;

  return (
    <Pointer
      global
      hotspot={{ x: 2, y: 2 }}
      className={className}
    >
      {({ cursorMode }) => {
        if (cursorMode === "not-allowed") {
          return <ProhibitionCursorIcon />;
        }
        if (cursorMode === "ibeam") {
          return <IBeamCursorIcon />;
        }
        return (
          <DefaultCursorIcon
            variant={cursorMode === "hover" ? "hover" : "default"}
          />
        );
      }}
    </Pointer>
  );
}
