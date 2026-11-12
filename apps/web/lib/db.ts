import "server-only";
import postgres from "postgres";
import { holdForIdleClose, poolSettings } from "@/lib/pooler-url";

// Direct Postgres access for server-side transactional mutations (.grill/phase-3-auth-decisions.md).
// Bypasses RLS like the service role — import only from server code (tRPC procedures).

const globalForDb = globalThis as unknown as { emeilSgSql?: postgres.Sql };

export function db(): postgres.Sql {
  if (!globalForDb.emeilSgSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    // prepare: false is required by Supabase's transaction-mode pooler (hosted deployments).
    // Cached on globalThis so dev hot-reloads don't open a new pool each time.
    // idle_timeout / max_lifetime: close pooled connections before the Supabase pooler or the network drops
    // them silently, which otherwise surfaces as "read ECONNRESET" on the next query after a quiet spell.
    globalForDb.emeilSgSql = postgres(url, {
      prepare: false,
      ...poolSettings(5),
      max_lifetime: 60 * 30,
      connect_timeout: 15,
    });
  }
  holdForIdleClose();
  return globalForDb.emeilSgSql;
}

export type Tx = postgres.TransactionSql;

/** Postgres SQLSTATE of a failed query, if any (e.g. 23505 unique violation). */
export function pgErrorCode(error: unknown): string | undefined {
  // Checked by shape, not `instanceof`: the Next.js server bundle can load a separate copy of
  // postgres.js, which makes `instanceof postgres.PostgresError` false for real database errors.
  const code =
    typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
}
