import assert from "node:assert/strict";
import { test } from "node:test";
import { isCustomCursorSupported } from "../lib/cursor.ts";

function createMatchMediaMock(matchesMap: Record<string, boolean>) {
  return (query: string): MediaQueryList =>
    ({
      matches: matchesMap[query] ?? false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

test("custom cursor: returns false when window is undefined (SSR)", () => {
  const originalWindow = globalThis.window;
  try {
    // @ts-expect-error simulating SSR
    delete globalThis.window;
    assert.equal(isCustomCursorSupported(), false);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("custom cursor: disabled on mobile viewports (< 768px)", () => {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      matchMedia: createMatchMediaMock({
        "(max-width: 767px)": true,
        "(any-pointer: fine)": true,
        "(hover: hover)": true,
      }),
    } as unknown as Window & typeof globalThis;

    assert.equal(isCustomCursorSupported(), false);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("custom cursor: disabled on touch-only devices without fine pointer", () => {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      matchMedia: createMatchMediaMock({
        "(max-width: 767px)": false,
        "(any-pointer: fine)": false,
        "(pointer: coarse)": true,
        "(hover: hover)": false,
      }),
    } as unknown as Window & typeof globalThis;

    assert.equal(isCustomCursorSupported(), false);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("custom cursor: disabled on touch tablets without hover capability", () => {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      matchMedia: createMatchMediaMock({
        "(max-width: 767px)": false,
        "(any-pointer: fine)": false,
        "(pointer: coarse)": true,
        "(hover: hover)": false,
      }),
    } as unknown as Window & typeof globalThis;

    assert.equal(isCustomCursorSupported(), false);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("custom cursor: enabled on desktop and laptops with fine pointer and hover", () => {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      matchMedia: createMatchMediaMock({
        "(max-width: 767px)": false,
        "(any-pointer: fine)": true,
        "(pointer: coarse)": false,
        "(hover: hover)": true,
      }),
    } as unknown as Window & typeof globalThis;

    assert.equal(isCustomCursorSupported(), true);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("custom cursor: enabled on tablets with trackpad/mouse connected", () => {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      matchMedia: createMatchMediaMock({
        "(max-width: 767px)": false,
        "(any-pointer: fine)": true,
        "(pointer: coarse)": true, // hybrid/touch screen
        "(hover: hover)": true, // mouse/trackpad provides hover
      }),
    } as unknown as Window & typeof globalThis;

    assert.equal(isCustomCursorSupported(), true);
  } finally {
    globalThis.window = originalWindow;
  }
});
