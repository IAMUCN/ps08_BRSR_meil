import assert from "node:assert/strict";
import { test } from "node:test";
import { holdForIdleClose, poolSettings } from "../lib/pooler-url.ts";

test("on Vercel the pool is small and gives idle connections back quickly", () => {
  assert.deepEqual(poolSettings(5, { VERCEL: "1" }), { max: 3, idle_timeout: 2 });
  assert.deepEqual(poolSettings(2, { VERCEL: "1" }), { max: 2, idle_timeout: 2 });
});

test("on Vercel each use keeps the request alive until idle connections have closed", () => {
  const held: number[] = [];
  const key = Symbol.for("@vercel/request-context");
  const g = globalThis as Record<symbol, unknown>;
  g[key] = { get: () => ({ waitUntil: () => held.push(Date.now()) }) };
  try {
    holdForIdleClose({ VERCEL: "1" });
    holdForIdleClose({ VERCEL: "1" }); // the same moment: one hold covers both
    assert.equal(held.length, 1);
    holdForIdleClose({});
    assert.equal(held.length, 1, "nothing to do off Vercel");
  } finally {
    delete g[key];
  }
});

test("elsewhere the pool keeps its normal size", () => {
  assert.deepEqual(poolSettings(5, {}), { max: 5, idle_timeout: 20 });
});
