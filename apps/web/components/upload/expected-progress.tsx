"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { expectedProgressAction } from "@/app/app/upload/actions";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ExpectedProgress } from "@/lib/upload/progress";

// Expected submissions on Upload (owner's request, 2026-11-11): every activity the chosen project is expected
// to submit for the chosen period, ticked once a document for it is on file, with the newest one's stage. It
// follows the form's project and period, refreshes after each upload, and every 20 seconds while the tab is
// visible (OCR and reviewers move stages along in the meantime).

const POLL_MS = 20_000;
const SCOPE_LABEL: Record<string, string> = {
  SCOPE_1: "Scope 1",
  SCOPE_2: "Scope 2",
  SCOPE_3: "Scope 3",
};

export function ExpectedProgressPanel({
  orgUnitId,
  periodId,
  orgUnitName,
  periodLabel,
  refreshKey,
}: {
  orgUnitId: string;
  periodId: string;
  orgUnitName: string;
  periodLabel: string;
  /** Changes after each recorded upload. */
  refreshKey: number;
}) {
  const [data, setData] = useState<ExpectedProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const wanted = useRef(`${orgUnitId}:${periodId}`);

  const load = useCallback(async () => {
    const key = `${orgUnitId}:${periodId}`;
    wanted.current = key;
    const result = await expectedProgressAction({ orgUnitId, periodId });
    // A newer project or period was chosen while this one loaded: drop it.
    if (wanted.current !== key) return;
    setLoading(false);
    if (result.ok) {
      setData(result.data);
      setError(null);
    } else setError(result.error);
  }, [orgUnitId, periodId]);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled && document.visibilityState === "visible") void load();
    };
    run();
    const timer = setInterval(run, POLL_MS);
    document.addEventListener("visibilitychange", run);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
    };
  }, [load, refreshKey]);

  const percent = data && data.total ? Math.round((data.submitted / data.total) * 100) : 0;
  return (
    <section
      aria-labelledby="expected-heading"
      className="space-y-3 rounded-lg border bg-card p-4 lg:sticky lg:top-4"
    >
      <div>
        <h2 id="expected-heading" className="text-sm leading-5 font-semibold">
          Expected submissions
        </h2>
        <p className="text-xs leading-4 text-muted-foreground">
          {orgUnitName} · {periodLabel}
        </p>
      </div>

      {loading && !data ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
        </p>
      ) : error && !data ? (
        <p role="alert" className="text-sm text-status-error">
          {error}
        </p>
      ) : data && data.total === 0 ? (
        <p className="text-sm text-muted-foreground">
          No submissions are expected from this project for this period. Expectations are set by an
          administrator on the Organization page.
        </p>
      ) : data ? (
        <>
          <div className="space-y-1" aria-live="polite">
            <p className="text-sm leading-5">
              <span className="font-semibold">
                {data.submitted} of {data.total}
              </span>{" "}
              submitted
            </p>
            <div
              role="progressbar"
              aria-label="Expected submissions submitted"
              aria-valuemin={0}
              aria-valuemax={data.total}
              aria-valuenow={data.submitted}
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-status-success transition-[width] duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
          <ul className="divide-y divide-border">
            {data.items.map((item) => (
              <li key={item.metricId} className="flex items-start justify-between gap-3 py-2">
                <span className="flex min-w-0 items-start gap-2">
                  {item.submitted ? (
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-status-success"
                      aria-label="Submitted"
                    />
                  ) : (
                    <Circle
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-label="Not submitted"
                    />
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm leading-5">{item.metricName}</span>
                    <span className="block text-xs leading-4 text-muted-foreground">
                      {item.scopeCode ? `${SCOPE_LABEL[item.scopeCode]} · ` : ""}
                      {item.categoryName}
                      {item.records > 1 ? ` · ${item.records} documents` : ""}
                    </span>
                  </span>
                </span>
                {item.stage ? (
                  <StatusBadge tone={item.stage.tone}>{item.stage.label}</StatusBadge>
                ) : (
                  <span className="shrink-0 text-xs leading-6 text-muted-foreground">
                    Not submitted
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
