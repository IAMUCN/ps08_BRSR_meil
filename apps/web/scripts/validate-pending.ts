// Runs the validation engine once over every verified record still waiting for validation — records
// confirmed before Phase 8 added validation to Confirm. Each record gets exactly what a Confirm today
// would give it: results, status, approval submission, audit entry and notifications, one transaction
// per record. Records already validated are never touched, so running it twice is harmless.
//
//   pnpm --filter web validate-pending
//
// Reads DATABASE_URL (apps/web/.env.local by default). Local/dev data only — decided in
// .grill/phase-8-validation-engine-decisions.md.

import postgres from "postgres";
import { runValidation } from "../lib/validation/engine.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("validate-pending: DATABASE_URL is not set");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1 });

const pending = await sql<{ id: string }[]>`
  select id from public.esg_records
  where verification_status = 'user_verified' and validation_status = 'pending'
    and data_quality_state <> 'rejected'
  order by created_at`;

const counts: Record<string, number> = {};
for (const { id } of pending) {
  const outcome = await sql.begin((tx) => runValidation(tx, id));
  counts[outcome.status] = (counts[outcome.status] ?? 0) + 1;
}
console.log(
  `validate-pending: ${pending.length} record(s) validated`,
  Object.keys(counts).length ? counts : "",
);
await sql.end();
