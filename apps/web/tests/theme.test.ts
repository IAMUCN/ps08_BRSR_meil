import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { isTheme, THEME_BOOT_SCRIPT, THEME_STORAGE_KEY } from "../lib/theme.ts";

// The boot script runs before React, so it is run here as the browser would: in its own global scope with
// a stand-in document and storage.
function boot(stored: string | null, storageThrows = false) {
  const html = { dataset: { theme: "theme-1" } as Record<string, string> };
  runInNewContext(THEME_BOOT_SCRIPT, {
    document: { documentElement: html },
    localStorage: {
      getItem: (key: string) => {
        if (storageThrows) throw new Error("storage disabled");
        return key === THEME_STORAGE_KEY ? stored : null;
      },
    },
  });
  return html.dataset.theme;
}

test("the boot script applies a saved theme before first paint", () => {
  assert.equal(boot("theme-3"), "theme-3");
  assert.equal(boot("theme-2"), "theme-2");
});

test("it ignores anything that is not one of the three themes", () => {
  assert.equal(boot(null), "theme-1");
  assert.equal(boot("theme-4"), "theme-1");
  assert.equal(boot('"><script>'), "theme-1");
});

test("it never breaks the page when storage is unavailable", () => {
  assert.equal(boot("theme-3", true), "theme-1");
});

test("isTheme accepts exactly the three themes", () => {
  assert.ok(isTheme("theme-1") && isTheme("theme-2") && isTheme("theme-3"));
  assert.ok(!isTheme("dark") && !isTheme(null) && !isTheme(3));
});
