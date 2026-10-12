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
export type PoolSettings = { max: number; idle_timeout: number };

export function poolSettings(
  local: number,
  env: Record<string, string | undefined> = process.env,
): PoolSettings {
  return env.VERCEL
    ? { max: Math.min(local, 3), idle_timeout: 5 }
    : { max: local, idle_timeout: 20 };
}
