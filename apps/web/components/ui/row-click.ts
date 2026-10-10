import type { MouseEvent } from "react";

/**
 * Makes a whole table row do what its first-cell button does. The button stays, for keyboards and screen
 * readers; a click on a link or control inside the row, or one that ends a text selection, is left alone.
 */
export const rowClick = (open: () => void) => (event: MouseEvent<HTMLElement>) => {
  if ((event.target as HTMLElement).closest("a, button, input, select, textarea, label")) return;
  if (window.getSelection()?.toString()) return;
  open();
};
