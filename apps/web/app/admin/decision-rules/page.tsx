import { requireAdminSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listDecisionRules } from "@/lib/rules/service";
import DecisionRulesClient from "./decision-rules-client";

export default async function DecisionRulesPage() {
  await requireAdminSession();
  const sql = db();

  const [rules, orgUnits, periods] = await Promise.all([
    listDecisionRules(sql),
    sql<{ id: string; name: string; code: string }[]>`
      select id, name, code from public.org_units
      where deleted_at is null
      order by name asc
    `,
    sql<{ id: string; label: string; start_date: string }[]>`
      select id, label, start_date::text from public.reporting_periods
      order by start_date desc
    `,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Decision Center &amp; ESG Intelligence
        </h1>
        <p className="text-sm text-muted-foreground">
          Operational threshold rules, 6-vector risk audits, GBDT predictive forecasting, what-if
          decarbonization simulation, transparent ranked recommendations, and statutory BRSR RAG
          assistant.
        </p>
      </div>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
        <div className="flex items-center gap-2 font-semibold">
          <span>Operational Advisory Guard</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
          This engine detects operational growth thresholds and data quality conditions. It does not
          establish regulatory non-compliance. All rules are versioned, configurable, and auditable
          back to verified input source records.
        </p>
      </div>

      <DecisionRulesClient initialRules={rules} orgUnits={orgUnits} periods={periods} />
    </div>
  );
}
