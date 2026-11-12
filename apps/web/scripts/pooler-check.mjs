// Reproduces the transaction-pooler hang (feature_enhancement.md Phase 10, "Database connections for
// production") and tries the client settings that matter. Read-only: every query is `select pg_sleep`.
//
//   node scripts/pooler-check.mjs <connection-url> [parallel=20]
//
// Prints, for each client configuration, how many of the parallel queries finished and how long they took.
// Run it against the transaction pooler (port 6543 on Supabase; 55329 locally with [db.pooler] enabled) and
// against the session pooler or the direct port as a control. Prints no secret.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const postgres = require("postgres");

const [url, parallelArg] = process.argv.slice(2);
if (!url) {
  console.error("usage: node scripts/pooler-check.mjs <connection-url> [parallel]");
  process.exit(1);
}
const parallel = Number(parallelArg ?? 20);
const TIMEOUT_MS = 15_000;

const configs = {
  "app today (max 5, prepare false)": { max: 5, prepare: false },
  "max 1": { max: 1, prepare: false },
  "max 5, no pipelining, no type fetch": {
    max: 5,
    prepare: false,
    max_pipeline: 1,
    fetch_types: false,
  },
  "max 20 (one connection per query)": { max: 20, prepare: false },
};

for (const [name, options] of Object.entries(configs)) {
  const sql = postgres(url, { ...options, idle_timeout: 2, connect_timeout: 10, onnotice() {} });
  const started = Date.now();
  let finished = 0;
  const outcomes = await Promise.all(
    Array.from({ length: parallel }, (_, i) =>
      Promise.race([
        sql`select pg_sleep(0.2), ${i}::int as i`.then(() => {
          finished += 1;
          return "ok";
        }),
        new Promise((resolve) => setTimeout(() => resolve("timeout"), TIMEOUT_MS)),
      ]).catch((e) => `error: ${e.code ?? e.message}`),
    ),
  );
  const errors = outcomes.filter((o) => o.startsWith("error"));
  console.log(
    `${name}: ${finished}/${parallel} finished in ${((Date.now() - started) / 1000).toFixed(1)} s` +
      `${outcomes.includes("timeout") ? `, ${outcomes.filter((o) => o === "timeout").length} hung` : ""}` +
      `${errors.length ? `, errors: ${[...new Set(errors)].join(" | ")}` : ""}`,
  );
  await sql.end({ timeout: 2 }).catch(() => {});
}
// What the app also does: transactions (two statements each) running beside plain reads, as the report job and
// the audit-writing procedures do.
{
  const sql = postgres(url, {
    max: 5,
    prepare: false,
    idle_timeout: 2,
    connect_timeout: 10,
    onnotice() {},
  });
  const started = Date.now();
  const work = [
    ...Array.from({ length: parallel / 2 }, (_, i) =>
      sql.begin(async (tx) => {
        await tx`select pg_sleep(0.1), ${i}::int`;
        await tx`select pg_sleep(0.1), ${i}::int`;
        return "ok";
      }),
    ),
    ...Array.from({ length: parallel / 2 }, (_, i) =>
      sql`select pg_sleep(0.2), ${i}::int`.then(() => "ok"),
    ),
  ].map((p) =>
    Promise.race([p, new Promise((r) => setTimeout(() => r("timeout"), TIMEOUT_MS))]).catch(
      (e) => `error: ${e.code ?? e.message}`,
    ),
  );
  const outcomes = await Promise.all(work);
  console.log(
    `transactions beside reads (max 5): ${outcomes.filter((o) => o === "ok").length}/${outcomes.length} in ${((Date.now() - started) / 1000).toFixed(1)} s` +
      `${outcomes.includes("timeout") ? `, ${outcomes.filter((o) => o === "timeout").length} hung` : ""}`,
  );
  await sql.end({ timeout: 2 }).catch(() => {});
}
process.exit(0);
