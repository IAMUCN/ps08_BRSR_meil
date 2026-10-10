"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  type HTMLMotionProps,
} from "motion/react";
import { cn } from "@/lib/utils";

export type CursorMode = "default" | "hover" | "ibeam" | "not-allowed";

export interface PointerContextValue {
  isHovered: boolean;
  isEditable: boolean;
  isPressed: boolean;
  isNotAllowed: boolean;
  cursorMode: CursorMode;
  isActive: boolean;
}

export const PointerContext = React.createContext<PointerContextValue>({
  isHovered: false,
  isEditable: false,
  isPressed: false,
  isNotAllowed: false,
  cursorMode: "default",
  isActive: false,
});

export function usePointer(): PointerContextValue {
  return React.useContext(PointerContext);
}

export interface PointerProps extends Omit<HTMLMotionProps<"div">, "children"> {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode | ((ctx: PointerContextValue) => React.ReactNode);
  /** When true, tracks cursor across the full document rather than just parent element */
  global?: boolean;
  /** Hotspot offset from top-left (e.g. { x: 2, y: 2 } for arrow tip) */
  hotspot?: { x: number; y: number };
}

/**
 * Magic UI Pointer component.
 * Supports element-scoped hover pointers and global document cursor replacement with dynamic states:
 * - "default": Standard pointer
 * - "hover": Interactive / clickable pointer
 * - "ibeam": Text edit / selection pointer
 * - "not-allowed": Red prohibition symbol over disabled or restricted elements
 */
export function Pointer({
  className,
  style,
  children,
  global = false,
  hotspot = { x: 0, y: 0 },
  ...props
}: PointerProps): React.ReactNode {
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isPressed, setIsPressed] = useState<boolean>(false);
  const [cursorMode, setCursorMode] = useState<CursorMode>("default");
  const containerRef = useRef<HTMLDivElement>(null);
  const isActiveRef = useRef<boolean>(false);
  const cursorModeRef = useRef<CursorMode>("default");

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Preserve native behavior on touch / coarse pointer devices
    const isTouchOrCoarse =
      window.matchMedia("(pointer: coarse)").matches ||
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0;

    if (isTouchOrCoarse) {
      return;
    }

    if (global) {
      document.documentElement.classList.add("custom-cursor-enabled");

      // Inject high-priority custom cursor stylesheet to guarantee complete suppression of native OS hand/pointer
      const styleEl = document.createElement("style");
      styleEl.setAttribute("data-custom-cursor-style", "true");
      styleEl.textContent = `
        html.custom-cursor-enabled,
        html.custom-cursor-enabled body,
        html.custom-cursor-enabled *,
        html.custom-cursor-enabled *::before,
        html.custom-cursor-enabled *::after,
        html.custom-cursor-enabled a,
        html.custom-cursor-enabled button,
        html.custom-cursor-enabled [role="button"],
        html.custom-cursor-enabled input,
        html.custom-cursor-enabled textarea,
        html.custom-cursor-enabled select,
        html.custom-cursor-enabled label,
        html.custom-cursor-enabled summary,
        html.custom-cursor-enabled *:hover,
        html.custom-cursor-enabled *:active,
        html.custom-cursor-enabled *:focus,
        html.custom-cursor-enabled a:hover,
        html.custom-cursor-enabled a:active,
        html.custom-cursor-enabled a:focus,
        html.custom-cursor-enabled button:hover,
        html.custom-cursor-enabled button:active,
        html.custom-cursor-enabled button:focus {
          cursor: none !important;
        }
        html.custom-cursor-enabled a,
        html.custom-cursor-enabled button,
        html.custom-cursor-enabled [role="button"],
        html.custom-cursor-enabled img {
          -webkit-user-drag: none !important;
          user-drag: none !important;
          user-select: none;
        }
        [data-native-cursor="true"], [data-native-cursor="true"] * {
          cursor: auto !important;
        }
      `;
      document.head.appendChild(styleEl);

      const updateCursorState = (target: HTMLElement | null) => {
        // Detect disabled / not-allowed elements
        const isNotAllowed = !!(
          target &&
          (target.closest(
            ':disabled, [disabled], [aria-disabled="true"], .cursor-not-allowed, [data-cursor="not-allowed"], [data-cursor="prohibited"], [data-state="disabled"]'
          ))
        );

        // Detect text-editable fields and active text selection
        const isTextEditable = !isNotAllowed && !!(
          target &&
          (target.closest(
            'input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([disabled]), textarea:not([disabled]), [contenteditable="true"], [role="textbox"]:not([aria-disabled="true"]), .monaco-editor, [data-cursor="ibeam"]'
          ) ||
            (window.getSelection() && window.getSelection()?.type === "Range"))
        );

        // Detect hover over interactive clickable elements
        const isClickable = !isNotAllowed && !isTextEditable && !!(
          target &&
          (target.closest(
            'a, button:not([disabled]), [role="button"]:not([aria-disabled="true"]), [role="link"], [role="tab"]:not([aria-disabled="true"]), [role="menuitem"], [role="switch"], [role="checkbox"], select:not([disabled]), label, summary, [data-cursor="hover"], [data-pointer="hover"], .cursor-pointer, [tabindex]:not([tabindex="-1"])'
          ) ||
            target.onclick !== null ||
            target.getAttribute("onclick") !== null ||
            (target.parentElement && (target.parentElement.onclick !== null || target.parentElement.getAttribute("onclick") !== null)))
        );

        const currentMode: CursorMode = isNotAllowed
          ? "not-allowed"
          : isTextEditable
          ? "ibeam"
          : isClickable
          ? "hover"
          : "default";

        if (cursorModeRef.current !== currentMode) {
          cursorModeRef.current = currentMode;
          setCursorMode(currentMode);
        }
      };

      const handleMouseMove = (e: MouseEvent) => {
        x.set(e.clientX);
        y.set(e.clientY);

        if (!isActiveRef.current) {
          isActiveRef.current = true;
          setIsActive(true);
        }

        updateCursorState(e.target as HTMLElement | null);
      };

      const handleMouseDown = (e: MouseEvent) => {
        setIsPressed(true);
        x.set(e.clientX);
        y.set(e.clientY);

        if (!isActiveRef.current) {
          isActiveRef.current = true;
          setIsActive(true);
        }

        updateCursorState(e.target as HTMLElement | null);
      };

      const handleMouseUp = () => {
        setIsPressed(false);
      };

      const handleMouseLeaveWindow = (e: MouseEvent) => {
        // Hide custom cursor if mouse leaves browser window viewport
        if (!e.relatedTarget && !("toElement" in e && (e as unknown as { toElement: unknown }).toElement)) {
          isActiveRef.current = false;
          setIsActive(false);
          setIsPressed(false);
          cursorModeRef.current = "default";
          setCursorMode("default");
        }
      };

      const handleMouseEnterWindow = () => {
        isActiveRef.current = true;
        setIsActive(true);
      };

      const handleDragStart = (e: DragEvent) => {
        // Suppress native drag on links/buttons so browser does not invoke OS drag/hand cursor
        const target = e.target as HTMLElement | null;
        if (!target?.closest?.('[data-draggable="true"]')) {
          e.preventDefault();
        }
      };

      window.addEventListener("mousemove", handleMouseMove, { passive: true });
      window.addEventListener("mousedown", handleMouseDown, { passive: true });
      window.addEventListener("mouseup", handleMouseUp, { passive: true });
      window.addEventListener("dragstart", handleDragStart, { capture: true });
      document.documentElement.addEventListener("mouseleave", handleMouseLeaveWindow);
      document.documentElement.addEventListener("mouseenter", handleMouseEnterWindow);

      return () => {
        styleEl.remove();
        document.documentElement.classList.remove("custom-cursor-enabled");
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mousedown", handleMouseDown);
        window.removeEventListener("mouseup", handleMouseUp);
        window.removeEventListener("dragstart", handleDragStart, { capture: true });
        document.documentElement.removeEventListener("mouseleave", handleMouseLeaveWindow);
        document.documentElement.removeEventListener("mouseenter", handleMouseEnterWindow);
      };
    } else {
      // Local parent element scoped pointer (standard Magic UI behavior)
      const parentElement = containerRef.current?.parentElement ?? null;

      const handleMouseMove = (e: MouseEvent) => {
        x.set(e.clientX);
        y.set(e.clientY);
        if (!isActiveRef.current) {
          isActiveRef.current = true;
          setIsActive(true);
        }
      };

      const handleMouseEnter = (e: MouseEvent) => {
        x.set(e.clientX);
        y.set(e.clientY);
        isActiveRef.current = true;
        setIsActive(true);
      };

      const handleMouseLeave = () => {
        isActiveRef.current = false;
        setIsActive(false);
      };

      if (parentElement) {
        parentElement.style.cursor = "none";
        parentElement.addEventListener("mousemove", handleMouseMove);
        parentElement.addEventListener("mouseenter", handleMouseEnter);
        parentElement.addEventListener("mouseleave", handleMouseLeave);
      }

      return () => {
        if (parentElement) {
          parentElement.style.cursor = "";
          parentElement.removeEventListener("mousemove", handleMouseMove);
          parentElement.removeEventListener("mouseenter", handleMouseEnter);
          parentElement.removeEventListener("mouseleave", handleMouseLeave);
        }
      };
    }
  }, [global, x, y]);

  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  // Hotspots:
  // - "not-allowed": Center (11, 11) for 22x22 SVG
  // - "ibeam": Center (6, 10) for 12x20 SVG
  // - "default" / "hover": Top-left tip (2, 2) for arrow
  const currentHotspot =
    cursorMode === "not-allowed"
      ? { x: 11, y: 11 }
      : cursorMode === "ibeam"
      ? { x: 6, y: 10 }
      : hotspot;

  const isHovered = cursorMode === "hover";
  const isEditable = cursorMode === "ibeam";
  const isNotAllowed = cursorMode === "not-allowed";

  return (
    <>
      {!global && <div ref={containerRef} />}
      <AnimatePresence>
        {isActive && (
          <motion.div
            className={cn(
              "pointer-events-none fixed top-0 left-0 z-[9999] select-none",
              className
            )}
            style={{
              x,
              y,
              translateX: -currentHotspot.x,
              translateY: -currentHotspot.y,
              willChange: "transform",
              ...style,
            }}
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.9 }
            }
            animate={{
              opacity: 1,
              scale: prefersReducedMotion ? 1 : isPressed ? 0.92 : 1,
            }}
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.9 }
            }
            transition={{
              duration: prefersReducedMotion ? 0 : 0.08,
              ease: "easeOut",
            }}
            {...props}
          >
            <PointerContext.Provider
              value={{ isHovered, isEditable, isPressed, isNotAllowed, cursorMode, isActive }}
            >
              {typeof children === "function"
                ? (children as (ctx: PointerContextValue) => React.ReactNode)({
                    isHovered,
                    isEditable,
                    isPressed,
                    isNotAllowed,
                    cursorMode,
                    isActive,
                  })
                : children || (
                    <svg
                      stroke="currentColor"
                      fill="currentColor"
                      strokeWidth="1"
                      viewBox="0 0 16 16"
                      height="24"
                      width="24"
                      xmlns="http://www.w3.org/2000/svg"
                      className="rotate-[-70deg] stroke-white text-black"
                    >
                      <path d="M14.082 2.182a.5.5 0 0 1 .103.557L8.528 15.467a.5.5 0 0 1-.917-.007L5.57 10.694.803 8.652a.5.5 0 0 1-.006-.916l12.728-5.657a.5.5 0 0 1 .556.103z" />
                    </svg>
                  )}
            </PointerContext.Provider>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
