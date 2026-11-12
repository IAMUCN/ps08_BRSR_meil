import { cn } from "cn";
import Link from "next/link";
import { financialYearLabel } from "@/lib/consolidation/aggregate";
import { yearOnYear, type KpiTrends } from "@/lib/dashboard/trends";

const number = (value: number) =>
  value.toLocaleString("en-IN", { maximumFractionDigits: value < 100 ? 2 : 0 });

/**
 * The headline figures of each financial year side by side (Control Tower). A table, so every number is
 * readable as text; the bar in each cell is its size against the row's largest year.
 */
export function KpiTrendsCard({ trends, orgName }: { trends: KpiTrends; orgName: string }) {
  return (
    <section aria-labelledby="trends-heading" className="rounded-md border bg-card">
      <div className="border-b px-4 py-3">
        <h2 id="trends-heading" className="text-base leading-6 font-semibold">
          KPI trends by financial year
        </h2>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          Approved records only, for {orgName} and everything beneath it. A year with no approved
          data is left empty, never shown as zero.{" "}
          <Link
            href="/admin/carbon-intelligence"
            className="text-primary-text underline underline-offset-2"
          >
            Carbon Intelligence
          </Link>{" "}
          has the break-down by activity, suggested actions and emission alerts.
        </p>
      </div>
      {trends.years.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          No approved records yet — the trend appears once a record is approved.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-table-header text-table-header-foreground">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase"
                >
                  KPI
                </th>
                {trends.years.map((year) => (
                  <th
                    key={year}
                    scope="col"
                    className="px-4 py-3 text-right text-[11px] leading-[14px] font-medium tracking-wide uppercase"
                  >
                    {financialYearLabel(year)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trends.kpis.map((kpi) => {
                const max = Math.max(0, ...kpi.values.map((v) => v ?? 0));
                return (
                  <tr key={kpi.key} className="border-t border-table-border bg-table-row align-top">
                    <th scope="row" className="px-4 py-3 text-left font-medium">
                      {kpi.label}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {kpi.unit}
                      </span>
                    </th>
                    {kpi.values.map((value, index) => {
                      const change = yearOnYear(kpi.values, index);
                      return (
                        <td key={trends.years[index]} className="min-w-32 px-4 py-3 text-right">
                          {value === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <>
                              <span className="font-mono">{number(value)}</span>
                              <span
                                aria-hidden
                                className="mt-1 ml-auto block h-1.5 rounded-full bg-primary"
                                style={{
                                  width: `${max > 0 ? Math.max(4, (value / max) * 100) : 4}%`,
                                }}
                              />
                              {change !== null ? (
                                <span
                                  className={cn(
                                    "mt-1 block text-xs",
                                    // For every KPI here, less is better.
                                    change > 0 ? "text-status-error" : "text-status-success",
                                  )}
                                >
                                  {change > 0 ? "▲" : change < 0 ? "▼" : "•"}{" "}
                                  {Math.abs(change).toFixed(1)}% on the year before
                                </span>
                              ) : null}
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
