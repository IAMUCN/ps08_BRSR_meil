// Shaping for the Group Overview tiles (role-wise dashboard, Phase 4): rows from SQL in, the figures a tile
// draws out. Pure, so the rules (what counts as a finished unit, what is left out, how a share is rounded) are
// unit-tested. Levels are data (org_levels): nothing here names "subsidiary" or "project".

export type UnitRow = {
  id: string;
  name: string;
  parent_id: string | null;
  level: string;
  level_label: string;
  level_order: number;
  /** Expected submissions in this unit's subtree for the period, and how many are approved. */
  expected: number;
  approved: number;
};

/** A unit is finished when it has something expected and every expected submission is approved. */
export const isComplete = (u: Pick<UnitRow, "expected" | "approved">) =>
  u.expected > 0 && u.approved >= u.expected;

/** Whole-number percentage, or null when nothing is expected (never 0 % or 100 % for "nothing to measure"). */
export const percent = (done: number, total: number): number | null =>
  total > 0 ? Math.round((done / total) * 100) : null;

export type LevelRing = {
  key: string;
  label: string;
  /** Units at this level that are finished, and units at this level that have something expected. */
  done: number;
  total: number;
  pct: number | null;
};

/** Reporting completion per hierarchy level, shallowest level first; levels with nothing expected are left out. */
export function levelRings(units: UnitRow[]): LevelRing[] {
  const byLevel = new Map<string, { label: string; order: number; done: number; total: number }>();
  for (const u of units) {
    if (u.expected === 0) continue;
    const entry = byLevel.get(u.level) ?? {
      label: u.level_label,
      order: u.level_order,
      done: 0,
      total: 0,
    };
    entry.total += 1;
    if (isComplete(u)) entry.done += 1;
    byLevel.set(u.level, entry);
  }
  return [...byLevel.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key, e]) => ({
      key,
      label: e.label,
      done: e.done,
      total: e.total,
      pct: percent(e.done, e.total),
    }));
}

export type HierarchyRow = {
  id: string;
  name: string;
  level: string;
  depth: 0 | 1;
  done: number;
  total: number;
  pct: number | null;
};

/**
 * The top units of the scope and the units directly beneath each (by main parent), at most `limit` rows in
 * all. `more` counts what was left out so the tile can say so. Percentages count submissions, not units.
 */
export function hierarchyRows(units: UnitRow[], rootIds: string[], limit = 12) {
  const byId = new Map(units.map((u) => [u.id, u]));
  const rows: HierarchyRow[] = [];
  let all = 0;
  const row = (u: UnitRow, depth: 0 | 1): HierarchyRow => ({
    id: u.id,
    name: u.name,
    level: u.level_label,
    depth,
    done: u.approved,
    total: u.expected,
    pct: percent(u.approved, u.expected),
  });
  for (const id of rootIds) {
    const root = byId.get(id);
    if (!root) continue;
    const children = units
      .filter((u) => u.parent_id === id)
      .sort((a, b) => a.level_order - b.level_order || a.name.localeCompare(b.name));
    all += 1 + children.length;
    for (const r of [row(root, 0), ...children.map((c) => row(c, 1))]) {
      if (rows.length < limit) rows.push(r);
    }
  }
  return { rows, more: Math.max(0, all - rows.length) };
}

export type EmissionRow = {
  scope_code: string;
  period_id: string;
  label: string;
  start_date: string;
  /** Approved emissions in tonnes CO2e; null when the units were not kg or t CO2e. */
  tonnes: number | null;
};

const SCOPE_NAMES: Record<string, string> = {
  SCOPE_1: "Scope 1",
  SCOPE_2: "Scope 2",
  SCOPE_3: "Scope 3",
};

/** The selected period's split by scope (zero scopes kept out of the donut) and the last `count` periods' totals. */
export function emissionFigures(rows: EmissionRow[], periodId: string | null, count = 6) {
  const t = (n: number | null) => n ?? 0;
  const selected =
    periodId ??
    [...rows].sort((a, b) => b.start_date.localeCompare(a.start_date))[0]?.period_id ??
    null;
  const slices = ["SCOPE_1", "SCOPE_2", "SCOPE_3"].map((code) => ({
    key: code,
    label: SCOPE_NAMES[code],
    value: rows
      .filter((r) => r.period_id === selected && r.scope_code === code)
      .reduce((a, r) => a + t(r.tonnes), 0),
  }));
  const periods = new Map<string, { label: string; start: string; tonnes: number }>();
  for (const r of rows) {
    const p = periods.get(r.period_id) ?? { label: r.label, start: r.start_date, tonnes: 0 };
    p.tonnes += t(r.tonnes);
    periods.set(r.period_id, p);
  }
  const trend = [...periods.values()]
    .filter((p) => p.tonnes > 0)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(-count);
  return {
    periodId: selected,
    periodLabel: rows.find((r) => r.period_id === selected)?.label ?? null,
    total: slices.reduce((a, s) => a + s.value, 0),
    slices,
    trend: { categories: trend.map((p) => p.label), values: trend.map((p) => p.tonnes) },
  };
}

// --- Role content (Phase 4b) ------------------------------------------------------------------------------

/** First year of the Indian financial year (April to March) an ISO date falls in: 2026-02-10 is FY 2025. */
export function fyStartYear(iso: string): number {
  const [y, m] = iso.split("-").map(Number);
  return m >= 4 ? y : y - 1;
}

/** A date as printed on a certificate (2026-03-31, 31/03/2026, 31-03-2026, 31.03.2026) as ISO, or null when it cannot be read. */
export function parseCertificateDate(text: string | null): string | null {
  const t = (text ?? "").trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dmy = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  const [y, m, d] = iso
    ? [+iso[1], +iso[2], +iso[3]]
    : dmy
      ? [+dmy[3], +dmy[2], +dmy[1]]
      : [0, 0, 0];
  const at = new Date(Date.UTC(y, m - 1, d));
  // Reject 31 February and the like: the date must survive the round trip.
  if (!y || at.getUTCFullYear() !== y || at.getUTCMonth() !== m - 1 || at.getUTCDate() !== d)
    return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export type CertificateState = {
  state: "expired" | "expiring" | "valid" | "unreadable";
  /** Days from today to the last valid day; negative once expired. */
  days: number | null;
};

/** Where a certificate stands today. `windowDays` is how far ahead "expiring" looks (60 by the owner's decision). */
export function certificateState(
  validTo: string | null,
  today: string,
  windowDays = 60,
): CertificateState {
  const end = parseCertificateDate(validTo);
  if (!end) return { state: "unreadable", days: null };
  const days = Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  return { state: days < 0 ? "expired" : days <= windowDays ? "expiring" : "valid", days };
}

export const AREA_STATES = [
  { key: "approved", label: "Approved" },
  { key: "pending_approval", label: "Pending approval" },
  { key: "needs_verification", label: "To verify" },
  { key: "returned", label: "Returned" },
  { key: "in_progress", label: "In progress" },
] as const;

/** My Submissions tabs grouped for a donut; rejected records are left out. */
export function areaCounts(tabs: string[]) {
  const group = (tab: string) =>
    tab === "approved" ||
    tab === "pending_approval" ||
    tab === "needs_verification" ||
    tab === "returned"
      ? tab
      : tab === "rejected"
        ? null
        : "in_progress";
  const counts = new Map<string, number>(AREA_STATES.map((s) => [s.key, 0]));
  for (const tab of tabs) {
    const g = group(tab);
    if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return AREA_STATES.map((s) => ({ key: s.key, label: s.label, value: counts.get(s.key) ?? 0 }));
}
