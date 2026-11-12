import assert from "node:assert/strict";
import { test } from "node:test";
import { poolSettings } from "../lib/pooler-url.ts";

test("on Vercel the pool is small and gives idle connections back quickly", () => {
  assert.deepEqual(poolSettings(5, { VERCEL: "1" }), { max: 3, idle_timeout: 5 });
  assert.deepEqual(poolSettings(2, { VERCEL: "1" }), { max: 2, idle_timeout: 5 });
});

test("elsewhere the pool keeps its normal size", () => {
  assert.deepEqual(poolSettings(5, {}), { max: 5, idle_timeout: 20 });
});
