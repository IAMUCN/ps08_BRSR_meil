import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The chart colours (--chart-1 … --chart-6) in every theme: each must reach 3:1 (WCAG 1.4.11, graphics) on the
// card and on the page behind it, and no two may be close enough to be mistaken for one another.

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector},\n[data-theme`);
  const from = start >= 0 ? start : css.indexOf(selector);
  assert.ok(from >= 0, `theme block ${selector} not found`);
  return css.slice(from, css.indexOf("\n}\n", from));
}

const THEMES: [string, string][] = [
  ["theme-1", ':root[data-theme="theme-1"]'],
  ["theme-2", ':root,\n[data-theme="theme-2"]'],
  ["theme-3", ':root[data-theme="theme-3"]'],
];

const hex = (b: string, name: string) => {
  const m = b.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m, `--${name} missing`);
  return m[1];
};
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h: string) => {
  const [r, g, b] = rgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const distance = (a: string, b: string) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));

for (const [theme, selector] of THEMES) {
  test(`${theme}: six chart colours, each 3:1 on the card and the page, all distinguishable`, () => {
    const b = block(selector);
    const surface = hex(b, "surface");
    const page = hex(b, "background");
    const colours = [1, 2, 3, 4, 5, 6].map((n) => hex(b, `chart-${n}`));
    colours.forEach((c, i) => {
      assert.ok(
        ratio(c, surface) >= 3,
        `chart-${i + 1} ${c} on card ${surface}: ${ratio(c, surface).toFixed(2)}`,
      );
      assert.ok(
        ratio(c, page) >= 3,
        `chart-${i + 1} ${c} on page ${page}: ${ratio(c, page).toFixed(2)}`,
      );
    });
    for (let i = 0; i < 6; i++)
      for (let j = i + 1; j < 6; j++)
        assert.ok(
          distance(colours[i], colours[j]) > 60,
          `chart-${i + 1} and chart-${j + 1} are too alike`,
        );
  });
}
