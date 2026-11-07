/**
 * Detects whether the current device/viewport supports the custom cursor.
 * - False on mobile viewports (< 768px): hides on mobile devices and responsive mode in devtools.
 * - False on touch-based screens without a precision pointing device.
 * - False on pure coarse touch screens where hover is unavailable.
 * - True on desktop/laptop screens and tablets with a fine pointer (mouse/trackpad).
 */
export function isCustomCursorSupported(): boolean {
  if (typeof window === "undefined") return false;

  // 1. Mobile viewport (< 768px): completely hide on mobile devices and responsive mode in devtools
  if (window.matchMedia("(max-width: 767px)").matches) {
    return false;
  }

  // 2. Touch-based screens without fine pointer (no mouse/trackpad at all)
  if (!window.matchMedia("(any-pointer: fine)").matches) {
    return false;
  }

  // 3. Primary coarse pointer without hover support (pure touch screens)
  if (
    window.matchMedia("(pointer: coarse)").matches &&
    !window.matchMedia("(hover: hover)").matches
  ) {
    return false;
  }

  return true;
}
