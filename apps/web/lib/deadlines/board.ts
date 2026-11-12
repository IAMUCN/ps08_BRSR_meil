// The submission status board of Reporting Deadlines (deadline escalation, phase 2, .grill/deadline-escalation-decisions.md):
// for one reporting period, every unit an Administrator oversees with what is expected from it and everything
// beneath it, how much is approved, on file but not approved, not started and overdue, and who is behind. Pure:
// the tRPC procedure loads the units and the tasks, this shapes them.

import type { DeadlineTask } from "./types";

export type BoardUnit = {
  id: string;
  name: string;
  /** The main parent (a unit shared by several parents is shown under its main one only). */
  parentId: string | null;
  levelLabel: string;
  levelOrder: number;
};

export type BoardTask = Pick<
  DeadlineTask,
  | "expectationId"
  | "orgUnitId"
  | "metricName"
  | "categoryName"
  | "submissionStatus"
  | "daysOverdue"
  | "assignedOwners"
>;

export type BoardItem = {
  id: string;
  metric: string;
  category: string;
  status: BoardTask["submissionStatus"];
  /** Whole days past the due date; 0 when not overdue or already approved. */
  daysLate: number;
  owners: string[];
};

export type BoardRow = {
  id: string;
  name: string;
  level: string;
  /** How far below the top of the Administrator's scope. */
  depth: number;
  /** Expected of this unit and every unit beneath it. */
  total: number;
  approved: number;
  /** On file but not approved: uploaded, being verified, under review or awaiting approval. */
  inProgress: number;
  missing: number;
  /** Not approved and past the due date (counts missing and in-progress ones). */
  overdue: number;
  /** Owners, in this unit and beneath it, with something not started. */
  behind: string[];
  /** This unit's own expected submissions, not yet approved first, the longest overdue first. */
  items: BoardItem[];
};

const unfinished = (t: BoardTask) => t.submissionStatus !== "approved";

/**
 * Rows depth first from every top unit of the scope (a unit whose parent is outside the scope, or has none), each
 * with its subtree's counts. Units with nothing expected anywhere beneath them are left out.
 */
export function buildBoard(units: readonly BoardUnit[], tasks: readonly BoardTask[]): BoardRow[] {
  const inScope = new Set(units.map((u) => u.id));
  const children = new Map<string, BoardUnit[]>();
  const tops: BoardUnit[] = [];
  for (const u of units) {
    if (u.parentId && inScope.has(u.parentId)) {
      children.set(u.parentId, [...(children.get(u.parentId) ?? []), u]);
    } else tops.push(u);
  }
  const order = (a: BoardUnit, b: BoardUnit) =>
    a.levelOrder - b.levelOrder || a.name.localeCompare(b.name);

  const own = new Map<string, BoardTask[]>();
  for (const t of tasks) own.set(t.orgUnitId, [...(own.get(t.orgUnitId) ?? []), t]);

  type Sums = {
    total: number;
    approved: number;
    inProgress: number;
    missing: number;
    overdue: number;
    behind: Map<string, string>;
  };
  const sums = new Map<string, Sums>();
  const sumOf = (u: BoardUnit, seen: Set<string>): Sums => {
    const done = sums.get(u.id);
    if (done) return done;
    const s: Sums = {
      total: 0,
      approved: 0,
      inProgress: 0,
      missing: 0,
      overdue: 0,
      behind: new Map(),
    };
    seen.add(u.id);
    for (const t of own.get(u.id) ?? []) {
      s.total += 1;
      if (!unfinished(t)) s.approved += 1;
      else if (t.submissionStatus === "missing") {
        s.missing += 1;
        for (const o of t.assignedOwners) s.behind.set(o.userId, o.displayName);
      } else s.inProgress += 1;
      if (unfinished(t) && t.daysOverdue > 0) s.overdue += 1;
    }
    for (const c of children.get(u.id) ?? []) {
      if (seen.has(c.id)) continue; // a cycle would be a data error; never loop on it
      const cs = sumOf(c, seen);
      s.total += cs.total;
      s.approved += cs.approved;
      s.inProgress += cs.inProgress;
      s.missing += cs.missing;
      s.overdue += cs.overdue;
      for (const [id, name] of cs.behind) s.behind.set(id, name);
    }
    sums.set(u.id, s);
    return s;
  };

  const rows: BoardRow[] = [];
  const walk = (u: BoardUnit, depth: number) => {
    const s = sumOf(u, new Set());
    if (s.total === 0) return;
    rows.push({
      id: u.id,
      name: u.name,
      level: u.levelLabel,
      depth,
      total: s.total,
      approved: s.approved,
      inProgress: s.inProgress,
      missing: s.missing,
      overdue: s.overdue,
      behind: [...s.behind.values()].sort((a, b) => a.localeCompare(b)),
      items: (own.get(u.id) ?? [])
        .map((t) => ({
          id: t.expectationId,
          metric: t.metricName,
          category: t.categoryName,
          status: t.submissionStatus,
          daysLate: unfinished(t) ? t.daysOverdue : 0,
          owners: t.assignedOwners.map((o) => o.displayName),
        }))
        .sort(
          (a, b) =>
            Number(a.status === "approved") - Number(b.status === "approved") ||
            b.daysLate - a.daysLate ||
            a.metric.localeCompare(b.metric),
        ),
    });
    for (const c of [...(children.get(u.id) ?? [])].sort(order)) walk(c, depth + 1);
  };
  for (const top of tops.sort(order)) walk(top, 0);
  return rows;
}
