import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminAreaSession } from "@/lib/auth/session";
import { NOTABLE_PCT, monthsLabel, SCOPES, type Comparison } from "@/lib/analytics/trends";
import { api } from "@/lib/trpc/server";
import { AlertsPanel } from "./alerts-panel";
import { Recommendations } from "./recommendations";
import { UnitPicker } from "./unit-picker";
import { YearCharts } from "./year-charts";

// Carbon Analytics (feature_enhancement.md Phase 7, requirements 33 and 34; A47): year-wise emissions from
// approved records, suggested actions, and threshold alerts, for one org unit and everything beneath it.

export const metadata: Metadata = { title: "Carbon Analytics · EmeilSG" };

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: n < 10 ? 2 : n < 100 ? 1 : 0 });
const th = "px-3 py-2 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase";

function Change({ c }: { c: Comparison }) {
  if (c.kind === "none" || c.changePct === null)
    return (
      <span className="text-xs text-muted-foreground">
        {c.kind === "none" ? "Not comparable" : "—"}
      </span>
    );
  const up = c.changePct > 0;
  const notable = Math.abs(c.changePct) >= NOTABLE_PCT;
  return (
    <span className="text-xs">
      <span className={notable ? "font-semibold" : undefined}>
        {up ? "▲" : c.changePct < 0 ? "▼" : "■"} {up ? "+" : ""}
        {Math.round(c.changePct)}%
      </span>
      {notable ? <span className="sr-only"> (a notable change)</span> : null}
      <span className="block text-muted-foreground">
        {c.kind === "full" ? "full year" : `same months: ${monthsLabel(c.months)}`}
      </span>
    </span>
  );
}

export default async function CarbonAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string | string[] }>;
}) {
  const [session, caller, params] = await Promise.all([
    requireAdminAreaSession(),
    api(),
    searchParams,
  ]);
  const units = await caller.analytics.units();
  const asked = typeof params.org === "string" ? params.org : undefined;
  // The first unit the caller may see at the top of their tree: the group for a Super Admin.
  const known = new Set(units.map((u) => u.id));
  const tops = units.filter((u) => !u.parentIds.some((p) => known.has(p)));
  const orgUnitId = asked && known.has(asked) ? asked : (tops[0]?.id ?? units[0]?.id);

  if (!orgUnitId) {
    return (
      <div className="max-w-7xl space-y-6">
        <PageHeader title="Carbon Analytics" />
        <p className="text-sm text-muted-foreground">No org unit is in your scope.</p>
      </div>
    );
  }

  const [overview, alerts, settings] = await Promise.all([
    caller.analytics.overview({ orgUnitId }),
    caller.analytics.alerts({ orgUnitId }),
    caller.analytics.alertSettings(),
  ]);
  const { years, activities } = overview.trends;

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader
        title="Carbon Analytics"
        description="Emissions by financial year from approved records, the actions they suggest, and alerts when a period comes out above its usual level."
      />
      <UnitPicker units={units} value={orgUnitId} />

      <section aria-labelledby="trend-heading" className="space-y-3">
        <div>
          <h2 id="trend-heading" className="text-base font-semibold">
            Emissions by financial year — {overview.orgUnitName}
          </h2>
          <p className="text-sm text-muted-foreground">
            Approved records only, in tCO2e, for this unit and everything beneath it. Years are
            April to March. A hatched bar is a year that is not complete; changes are worked out on
            the months both years have.
          </p>
        </div>
        {years.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No emission records yet for this part of the organisation.
          </p>
        ) : (
          <>
            <YearCharts years={years} />
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">
                  Emissions by financial year, with change and completeness
                </caption>
                <thead className="bg-table-header text-table-header-foreground">
                  <tr>
                    <th scope="col" className={th}>
                      Financial year
                    </th>
                    {SCOPES.map((s) => (
                      <th key={s.code} scope="col" className={`${th} text-right`}>
                        {s.label}
                      </th>
                    ))}
                    <th scope="col" className={`${th} text-right`}>
                      Total
                    </th>
                    <th scope="col" className={th}>
                      Change on year before
                    </th>
                    <th scope="col" className={th}>
                      Data
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...years].reverse().map((y) => (
                    <tr
                      key={y.financialYear}
                      className="border-t border-table-border bg-table-row align-top"
                    >
                      <th scope="row" className="px-3 py-2 text-left font-medium">
                        {y.label}
                      </th>
                      {SCOPES.map((s) => (
                        <td key={s.code} className="px-3 py-2 text-right">
                          <span className="font-mono">{fmt(y.byScope[s.code])}</span>
                          <span className="mt-0.5 block">
                            <Change c={y.changeByScope[s.code]} />
                          </span>
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-mono font-semibold">
                        {fmt(y.total)}
                      </td>
                      <td className="px-3 py-2">
                        <Change c={y.change} />
                      </td>
                      <td className="px-3 py-2">
                        {y.complete ? (
                          <StatusBadge tone="success">Complete</StatusBadge>
                        ) : (
                          <>
                            <StatusBadge tone="warning">Partial</StatusBadge>
                            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                              {y.notes.map((n) => (
                                <li key={n}>{n}</li>
                              ))}
                            </ul>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="rounded-md border border-border bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                By activity ({activities.length})
              </summary>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-table-header text-table-header-foreground">
                    <tr>
                      <th scope="col" className={th}>
                        Activity
                      </th>
                      {years.map((y) => (
                        <th key={y.financialYear} scope="col" className={`${th} text-right`}>
                          {y.label}
                        </th>
                      ))}
                      <th scope="col" className={th}>
                        Latest change
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities.map((a) => (
                      <tr
                        key={a.metricCode}
                        className="border-t border-table-border bg-table-row align-top"
                      >
                        <th scope="row" className="px-3 py-2 text-left font-medium">
                          {a.metricName}
                          <span className="block text-xs font-normal text-muted-foreground">
                            {SCOPES.find((s) => s.code === a.scopeCode)?.label}
                            {a.pendingCount + a.notCalculatedCount
                              ? ` · ${a.pendingCount + a.notCalculatedCount} not counted yet`
                              : ""}
                          </span>
                        </th>
                        {a.values.map((v, i) => (
                          <td
                            key={years[i].financialYear}
                            className="px-3 py-2 text-right font-mono"
                          >
                            {v === null ? <span className="text-muted-foreground">—</span> : fmt(v)}
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          <Change c={a.change} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </section>

      <Recommendations
        orgUnitId={orgUnitId}
        items={overview.recommendations}
        aiAvailable={overview.aiAvailable}
      />

      <AlertsPanel alerts={alerts} settings={settings} isSuperAdmin={session.isAdmin} />
    </div>
  );
}
