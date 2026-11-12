"use client";

import { Building2, Lightbulb, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Recommendation } from "@/lib/analytics/recommend";
import type { UnitEmission } from "@/lib/analytics/service";
import { fyLabel } from "@/lib/factors/source-text";
import { emissionsByUnitAction, wordRecommendationAction } from "./actions";

// Suggestions (feature_enhancement.md 7.2; A47): chosen by fixed rules with the figures that triggered them.
// "Explain in plain words" asks the AI service to reword one; the rules' wording is always shown too.

const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: n < 10 ? 2 : 1 });
const PRIORITY: Record<
  Recommendation["priority"],
  { tone: "error" | "warning" | "neutral"; text: string }
> = {
  high: { tone: "error", text: "High" },
  medium: { tone: "warning", text: "Medium" },
  low: { tone: "neutral", text: "Low" },
};

export function Recommendations({
  orgUnitId,
  items,
  aiAvailable,
}: {
  orgUnitId: string;
  items: Recommendation[];
  aiAvailable: boolean;
}) {
  return (
    <section
      aria-labelledby="recs-heading"
      className="space-y-3 rounded-md border border-border bg-card p-4"
    >
      <div>
        <h2 id="recs-heading" className="flex items-center gap-2 text-base font-semibold">
          <Lightbulb className="size-4" aria-hidden />
          Suggested actions
        </h2>
        <p className="text-sm text-muted-foreground">
          Decision support only: nothing is changed until people decide to act. Each suggestion
          comes from a fixed rule and names the figures behind it, from approved records.
        </p>
      </div>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          Nothing stands out: no activity rose by 20% or more on the year before, had an unusually
          high month, or made up 40% or more of the year&apos;s emissions.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((rec) => (
            <RecommendationCard
              key={rec.id}
              orgUnitId={orgUnitId}
              rec={rec}
              aiAvailable={aiAvailable}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function RecommendationCard({
  orgUnitId,
  rec,
  aiAvailable,
}: {
  orgUnitId: string;
  rec: Recommendation;
  aiAvailable: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [worded, setWorded] = useState<{ text: string; model: string } | null>(null);
  // Which project the emissions come from (owner's request, 2026-11-11): loaded on the first click.
  const [byUnit, setByUnit] = useState<{ financialYear: number; units: UnitEmission[] } | null>(
    null,
  );
  const [showUnits, setShowUnits] = useState(false);
  const [loadingUnits, startUnits] = useTransition();

  function toggleUnits() {
    if (showUnits) return setShowUnits(false);
    setShowUnits(true);
    if (byUnit) return;
    startUnits(async () => {
      const result = await emissionsByUnitAction({ orgUnitId, recommendationId: rec.id });
      if (!result.ok) {
        setShowUnits(false);
        toast.error(result.error);
        return;
      }
      setByUnit(result.data);
    });
  }
  const explorer =
    `/admin/data-explorer?org=${orgUnitId}&fy=${rec.evidence.financialYear}` +
    (rec.evidence.metricCodes.length === 1
      ? `&metric=${rec.evidence.metricCodes[0]}`
      : `&scope=${rec.scopeCode}`);

  function word() {
    startTransition(async () => {
      const result = await wordRecommendationAction({ orgUnitId, recommendationId: rec.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setWorded(result.data);
    });
  }

  return (
    <li className="space-y-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={PRIORITY[rec.priority].tone}>{PRIORITY[rec.priority].text}</StatusBadge>
        <h3 className="text-sm font-semibold">{rec.title}</h3>
      </div>
      <p className="text-sm">
        <span className="font-medium">What the data shows: </span>
        {rec.reason}
      </p>
      <p className="text-sm text-muted-foreground">{rec.why}</p>
      <div className="text-sm">
        <p className="font-medium">Steps to consider</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {rec.actions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <p className="mt-1">
          <span className="font-medium">Policy: </span>
          {rec.policy}
        </p>
      </div>
      {rec.caveats.length ? (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {rec.caveats.map((c) => (
            <li key={c}>Note: {c}</li>
          ))}
        </ul>
      ) : null}
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={showUnits}
          aria-controls={`units-${rec.id}`}
          onClick={toggleUnits}
        >
          {loadingUnits ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Building2 aria-hidden />
          )}
          {showUnits ? "Hide projects" : "Which project emits the most?"}
        </Button>
        {showUnits && byUnit ? (
          <div id={`units-${rec.id}`} className="space-y-2 rounded-md border border-border p-3">
            {byUnit.units.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No approved, calculated {rec.groupLabel.toLowerCase()} records in FY{" "}
                {fyLabel(byUnit.financialYear)}.
              </p>
            ) : (
              <>
                <p className="text-sm">
                  <span className="font-medium">{byUnit.units[0].name}</span> emits the most{" "}
                  {rec.groupLabel.toLowerCase()} CO2e in FY {fyLabel(byUnit.financialYear)}:{" "}
                  <span className="font-mono">{fmt(byUnit.units[0].tco2e)} tCO2e</span> (
                  {Math.round(byUnit.units[0].sharePct)}% of{" "}
                  {fmt(byUnit.units.reduce((sum, u) => sum + u.tco2e, 0))} tCO2e).
                </p>
                <ol className="space-y-1.5">
                  {byUnit.units.map((u, i) => (
                    <li key={u.orgUnitId} className="text-xs">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className={i === 0 ? "font-semibold" : undefined}>
                          {i + 1}. {u.name}{" "}
                          <span className="font-normal text-muted-foreground">
                            {u.level} · {u.records} record{u.records === 1 ? "" : "s"}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono">
                          {fmt(u.tco2e)} tCO2e · {Math.round(u.sharePct)}%
                        </span>
                      </div>
                      <div
                        className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted"
                        aria-hidden
                      >
                        <div
                          className={i === 0 ? "h-full bg-status-error" : "h-full bg-primary/60"}
                          style={{ width: `${Math.max(2, u.sharePct)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="text-xs text-muted-foreground">
                  Approved records of FY {fyLabel(byUnit.financialYear)}, by the unit each record
                  was filed under.
                </p>
              </>
            )}
          </div>
        ) : null}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-primary-text">
          Evidence: {rec.evidence.periods.length} period(s)
        </summary>
        <table className="mt-2 text-xs">
          <tbody>
            {rec.evidence.periods.map((p) => (
              <tr key={p.periodId}>
                <td className="pr-4">{p.label}</td>
                <td className="text-right font-mono">{fmt(p.tco2e)} tCO2e</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2">
          <Link href={explorer} className="text-primary-text underline-offset-2 hover:underline">
            Open the records in the Data Explorer
          </Link>
        </p>
      </details>
      {worded ? (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5" aria-hidden /> In plain words, written by the AI service
            ({worded.model}). Its figures were checked against the ones above.
          </p>
          <p>{worded.text}</p>
        </div>
      ) : aiAvailable ? (
        <Button variant="outline" size="sm" disabled={pending} onClick={word}>
          <Sparkles className="size-4" aria-hidden />
          {pending ? "Writing…" : "Explain in plain words"}
        </Button>
      ) : null}
    </li>
  );
}
