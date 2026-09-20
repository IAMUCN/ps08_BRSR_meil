// Runs the calculation engine once over every record that reached approval or approval-ready state before
// Phase 9 added calculation, plus any record whose calculation was blocked and whose factor now exists.
// Each record gets exactly what a Confirm today would give it: a calculations row, the record's status,
// the audit entry, one transaction per record. Records with a current calculation are never touched, so
// running it twice is harmless.
//
//   pnpm --filter web calculate-pending
//
// Reads DATABASE_URL (apps/web/.env.local by default). Local/dev data only — decided in
// .grill/phase-9-calculation-engine-decisions.md.

import postgres from "postgres";
import { runCalculation } from "../lib/calculation/engine.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("calculate-pending: DATABASE_URL is not set");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1 });

const pending = await sql<{ id: string }[]>`
  select r.id from public.esg_records r
  join public.esg_metrics m on m.id = r.metric_id
  where r.validation_status = 'validated' and r.data_quality_state <> 'rejected'
    and m.requires_calculation
    and not exists (select 1 from public.calculations c
                     where c.esg_record_id = r.id and c.is_current)
  order by r.created_at`;

const counts: Record<string, number> = {};
const reasons = new Set<string>();
for (const { id } of pending) {
  const outcome = await sql.begin((tx) => runCalculation(tx, id));
  counts[outcome.status] = (counts[outcome.status] ?? 0) + 1;
  if (outcome.status === "blocked") reasons.add(outcome.reason);
}
console.log(
  `calculate-pending: ${pending.length} record(s) processed`,
  Object.keys(counts).length ? counts : "",
);
for (const reason of reasons) console.log(`  blocked: ${reason}`);
await sql.end();
