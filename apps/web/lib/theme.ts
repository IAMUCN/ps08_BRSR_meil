// The three UI themes (UI brief §4). Shared by the server (users.theme, migration 0028) and the browser.

export const THEMES = [
  { id: "theme-1", label: "Warm", description: "Default" },
  { id: "theme-2", label: "Corporate", description: "MEIL official" },
  { id: "theme-3", label: "Dark", description: "Dark enterprise" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "theme-1";
export const THEME_STORAGE_KEY = "traceesg-theme";

export const isTheme = (value: unknown): value is ThemeId => THEMES.some((t) => t.id === value);

/**
 * Runs before first paint (root layout): applies this browser's copy of the user's theme so the page never
 * flashes the default. The signed-in shell then re-applies the account's value.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(${JSON.stringify(THEMES.map((t) => t.id))}.indexOf(t)>-1)document.documentElement.dataset.theme=t}catch(e){}`;

/** Applies a theme in the browser and remembers it for the next first paint. */
export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // storage disabled: the account's value is re-applied on every signed-in page anyway
  }
}
