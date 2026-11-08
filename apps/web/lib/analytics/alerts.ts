// Emission threshold alerts (feature_enhancement.md 7.3, requirement 34; D51, A47). Pure: which unit, period
// and scope came out above its expected average. The daily run (lib/analytics/run-alerts.ts) feeds it figures
// and sends what it finds.
//
// Method (owner's choice, 2026-11-09): the expected average of a period is the mean of the same period in up to
// three earlier financial years (same month for a monthly period, the year for an annual one), so seasonal
// swings do not raise alerts. An alert needs:
//   * the period closed, ended, and ended within `lookbackDays`;
//   * the period complete for that unit and scope: approved data, nothing awaiting approval or a factor, no
//     expected submission missing;
//   * at least `minBaselineYears` earlier periods that are complete in the same way and above zero;
//   * the measured figure above the average by more than the scope's threshold and by `minIncreaseTco2e`.
import { fyOf } from "../factors/source-text.ts";
import type { PeriodInfo, ScopeCode } from "./trends.ts";

export type AlertSettings = {
  enabled: boolean;
  thresholdPct: Record<ScopeCode, number>;
  minBaselineYears: number;
  minIncreaseTco2e: number;
  lookbackDays: number;
};

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  enabled: true,
  thresholdPct: { SCOPE_1: 20, SCOPE_2: 20, SCOPE_3: 20 },
  minBaselineYears: 2,
  minIncreaseTco2e: 0.5,
  lookbackDays: 180,
};

const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : fallback;

/** The stored setting, with anything missing or out of range replaced by the default. */
export function readAlertSettings(raw: unknown): AlertSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pct = (
    o.thresholdPct && typeof o.thresholdPct === "object" ? o.thresholdPct : {}
  ) as Record<string, unknown>;
  const d = DEFAULT_ALERT_SETTINGS;
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : d.enabled,
    thresholdPct: {
      SCOPE_1: num(pct.SCOPE_1, 1, 1000, d.thresholdPct.SCOPE_1),
      SCOPE_2: num(pct.SCOPE_2, 1, 1000, d.thresholdPct.SCOPE_2),
      SCOPE_3: num(pct.SCOPE_3, 1, 1000, d.thresholdPct.SCOPE_3),
    },
    minBaselineYears: Math.round(num(o.minBaselineYears, 1, 3, d.minBaselineYears)),
    minIncreaseTco2e: num(o.minIncreaseTco2e, 0, 1_000_000, d.minIncreaseTco2e),
    lookbackDays: Math.round(num(o.lookbackDays, 1, 730, d.lookbackDays)),
  };
}

/** Approved emissions of one unit (with everything beneath it) for one period and scope, and what is open. */
export type UnitPeriodScope = {
  orgUnitId: string;
  periodId: string;
  scopeCode: ScopeCode;
  approvedT: number;
  approvedCount: number;
  pendingCount: number;
  notCalculatedCount: number;
  missingExpected: number;
};

export type AlertCandidate = {
  orgUnitId: string;
  periodId: string;
  scopeCode: ScopeCode;
  measuredT: number;
  baselineT: number;
  thresholdPct: number;
  baselinePeriods: { periodId: string; label: string; tco2e: number }[];
};

const complete = (c: UnitPeriodScope | undefined): c is UnitPeriodScope =>
  !!c &&
  c.approvedCount > 0 &&
  c.approvedT > 0 &&
  c.pendingCount === 0 &&
  c.notCalculatedCount === 0 &&
  c.missingExpected === 0;

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** The earlier periods a period is compared with: same kind, same start month and day, up to three years back. */
export function baselinePeriods(period: PeriodInfo, periods: PeriodInfo[]): PeriodInfo[] {
  const fy = fyOf(period.startDate);
  return periods
    .filter(
      (p) =>
        p.id !== period.id &&
        p.type === period.type &&
        p.status === "closed" &&
        p.startDate.slice(5) === period.startDate.slice(5) &&
        fyOf(p.startDate) >= fy - 3 &&
        fyOf(p.startDate) < fy,
    )
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export function findAlerts(input: {
  periods: PeriodInfo[];
  figures: UnitPeriodScope[];
  settings: AlertSettings;
  /** Today in India, YYYY-MM-DD. */
  today: string;
}): AlertCandidate[] {
  const { periods, figures, settings, today } = input;
  if (!settings.enabled) return [];
  const key = (u: string, p: string, s: string) => `${u}|${p}|${s}`;
  const byKey = new Map(figures.map((f) => [key(f.orgUnitId, f.periodId, f.scopeCode), f]));
  const eligible = periods.filter(
    (p) =>
      p.status === "closed" &&
      p.endDate < today &&
      daysBetween(p.endDate, today) <= settings.lookbackDays,
  );
  const out: AlertCandidate[] = [];
  for (const period of eligible) {
    const earlier = baselinePeriods(period, periods);
    for (const f of figures) {
      if (f.periodId !== period.id || !complete(f)) continue;
      const base = earlier
        .map((p) => ({ p, c: byKey.get(key(f.orgUnitId, p.id, f.scopeCode)) }))
        .filter((x) => complete(x.c));
      if (base.length < settings.minBaselineYears) continue;
      const baselineT = base.reduce((a, x) => a + x.c!.approvedT, 0) / base.length;
      const pct = settings.thresholdPct[f.scopeCode];
      if (
        f.approvedT > baselineT * (1 + pct / 100) &&
        f.approvedT - baselineT >= settings.minIncreaseTco2e
      ) {
        out.push({
          orgUnitId: f.orgUnitId,
          periodId: f.periodId,
          scopeCode: f.scopeCode,
          measuredT: f.approvedT,
          baselineT,
          thresholdPct: pct,
          baselinePeriods: base.map((x) => ({
            periodId: x.p.id,
            label: x.p.label,
            tco2e: Math.round(x.c!.approvedT * 1000) / 1000,
          })),
        });
      }
    }
  }
  return out;
}
