// Connection pool settings for the server's direct database connection (lib/db.ts, lib/chat/data.ts).
//
// Supabase's session pooler (port 5432) allows only 15 clients in all, shared with the OCR worker, every
// developer's machine and every serverless instance. On Vercel an instance that keeps five idle
// connections for 20 seconds therefore exhausts it ("EMAXCONNSESSION"). There the pool is smaller and
// gives idle connections back quickly instead.
//
// The transaction pooler (port 6543) was tried and rejected: on Vercel it stalled a report job and every
// request behind it until the function timed out after 300 s, although the same queries finish in about
// two seconds from a laptop. The URL is therefore used exactly as configured.
//
// On Vercel an instance is paused between requests, and a paused instance runs no timers: its idle
// connections were never closed and stayed held in the session pooler, until all 30 slots were taken and
// every page failed with EMAXCONNSESSION (2026-11-12). So each request that uses the database also keeps
// its instance awake a moment after the last query (`holdForIdleClose`, Vercel's `waitUntil`), long enough
// for the short idle timeout to close those connections before the pause.
import { waitUntil } from "@vercel/functions";

export type PoolSettings = { max: number; idle_timeout: number };

/** Seconds an idle connection is kept on Vercel. */
export const VERCEL_IDLE_SECONDS = 2;

export function poolSettings(
  local: number,
  env: Record<string, string | undefined> = process.env,
): PoolSettings {
  return env.VERCEL
    ? { max: Math.min(local, 3), idle_timeout: VERCEL_IDLE_SECONDS }
    : { max: local, idle_timeout: 20 };
}

let heldUntil = 0;

/**
 * On Vercel: keeps the current request's instance awake until its idle connections have closed. Called on
 * every use of a pool; one timer covers the calls of the same half second. Does nothing elsewhere, or
 * outside a request (`waitUntil` then has nothing to extend).
 */
export function holdForIdleClose(env: Record<string, string | undefined> = process.env): void {
  if (!env.VERCEL) return;
  const until = Date.now() + (VERCEL_IDLE_SECONDS + 1) * 1000;
  if (until - heldUntil < 500) return;
  heldUntil = until;
  waitUntil(new Promise((resolve) => setTimeout(resolve, until - Date.now()).unref?.()));
}
