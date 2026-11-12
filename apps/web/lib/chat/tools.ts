// The approved, read-only tools of the ESG data analyst (.grill/chat-analyst-decisions.md). This list is
// the whole of what a language model can ask the application to do: each tool has a strict argument
// schema, resolves org units only inside the set the signed-in person may see, bounds what it returns,
// and computes every figure with the consolidation rules the screens and reports use. Pure — the data
// layer is handed in — so authorization and arithmetic are unit-tested without a database or a model.
import { z } from "zod";
import { parseFormula } from "../calculation/formulas.ts";
import { normalize } from "../calculation/units.ts";
import {
  consolidate,
  financialYearOf,
  type Consolidated,
  type MetricInfo,
} from "../consolidation/aggregate.ts";
import {
  PRESETS,
  percentChange,
  resolvePeriods,
  tonnesCo2e,
  type Period,
  type PeriodSpec,
} from "./analysis.ts";
import { formatNumber, type Block } from "./blocks.ts";
import { generateForecast, type HistoricalObservation } from "../forecast/engine.ts";

// --- What a tool is given ---------------------------------------------------------------------------------

export type OrgUnit = {
  id: string;
  name: string;
  code: string | null;
  type: string;
  parentId: string | null;
  /** Other units it also sits under (migration 0044): it belongs to, and counts in, each of them. */
  alsoUnder?: string[];
};

/** Whether a unit sits directly under any of the given units, by its main parent or an extra one. */
const sitsUnder = (u: OrgUnit, parents: { has(id: string): boolean }) =>
  Boolean(u.parentId && parents.has(u.parentId)) ||
  Boolean(u.alsoUnder?.some((p) => parents.has(p)));

export type Metric = {
  id: string;
  code: string;
  name: string;
  unit: string;
  requiresCalculation: boolean;
  scopeCode: string | null;
  scopeName: string | null;
  formulaType: string | null;
  formulaDefinition: unknown;
};

type Cell = { nodeId: string; periodId: string; metricId: string };

export type CalculationRow = {
  periodLabel: string;
  orgUnitId: string;
  approvalStatus: string;
  inputValue: number;
  inputUnit: string;
  normalizedValue: number;
  normalizedUnit: string;
  factorName: string | null;
  factorVersion: number | null;
  factorValue: number | null;
  factorInputUnit: string | null;
  factorOutputUnit: string | null;
  factorSource: string | null;
  resultValue: number;
  resultUnit: string;
  engineVersion: string;
  inputs: { key: string; value: number; unit: string }[];
};

/** Every read the tools make. `nodeId` rows are roll-ups: the node and everything beneath it. */
export type DataLayer = {
  metrics(filter: { metricCode?: string; scopeCode?: string }): Promise<Metric[]>;
  fieldLabels(metricIds: string[]): Promise<{ metricId: string; key: string; label: string }[]>;
  values(
    nodeIds: string[],
    periodIds: string[],
    metricIds: string[],
  ): Promise<
    (Cell & {
      unit: string | null;
      approved: number;
      awaiting: number;
      records: number;
      notCalculated: number;
    })[]
  >;
  inputs(
    nodeIds: string[],
    periodIds: string[],
    metricIds: string[],
  ): Promise<(Cell & { key: string; approved: number; awaiting: number })[]>;
  /** Verified activity quantities (litres, kWh) behind calculated results, per unit as entered. */
  quantities(
    nodeIds: string[],
    periodIds: string[],
    metricIds: string[],
  ): Promise<(Cell & { unit: string; approved: number; awaiting: number })[]>;
  statuses(
    nodeId: string,
    periodIds: string[],
  ): Promise<{ periodId: string; status: string; records: number }[]>;
  expectations(
    nodeId: string,
  ): Promise<{ orgUnitId: string; metricId: string; metric: string; frequency: string }[]>;
  submitted(
    nodeId: string,
    periodIds: string[],
  ): Promise<{ orgUnitId: string; metricId: string; periodId: string }[]>;
  calculations(
    nodeId: string,
    periodIds: string[],
    metricId: string,
    limit: number,
  ): Promise<{ total: number; rows: CalculationRow[] }>;
};

export type Person = {
  name: string;
  email: string;
  employeeId: string | null;
  active: boolean;
  /** Current assignments: role name and org unit name. */
  assignments: { role: string; orgUnit: string }[];
};

export type RecordRow = {
  orgUnitId: string;
  periodLabel: string;
  metric: string;
  value: number | null;
  unit: string | null;
  status: string;
  submittedBy: string;
  approvedBy: string | null;
  fileName: string | null;
};

/** What only an Admin's questions may read: people, and who submitted and approved each record. */
export type AdminData = {
  /** `nodeId`: people assigned at that org unit or beneath it. */
  people(filter: {
    search?: string;
    role?: string;
    nodeId?: string;
    limit: number;
  }): Promise<{ total: number; rows: Person[] }>;
  records(filter: {
    nodeId: string;
    periodIds: string[];
    metricId?: string;
    limit: number;
  }): Promise<{ total: number; rows: RecordRow[] }>;
};

export type ToolContext = {
  /** Every org unit the signed-in person may see, resolved by the server for this request. */
  units: OrgUnit[];
  periods: Period[];
  /** Today's date in India, ISO. */
  today: string;
  data: DataLayer;
  /** Set by the server for an Admin and nobody else; without it the Admin-only tools do not exist. */
  admin?: AdminData;
};

export type ToolResult = { data: unknown; blocks: Block[]; orgUnitIds: string[] };

/** A refusal the model may read and pass on: wrong name, out of scope, too wide. Never internal detail. */
export class ToolError extends Error {
  /** "out_of_scope": the lookup named something this person may not see; the answer becomes a fixed refusal. */
  readonly kind: "error" | "out_of_scope";
  constructor(message: string, kind: "error" | "out_of_scope" = "error") {
    super(message);
    this.kind = kind;
  }
}

// --- Limits -----------------------------------------------------------------------------------------------

const MAX_TABLE_ROWS = 50;
const MAX_TREND_PERIODS = 36;
const MAX_COMPLETENESS_PERIODS = 24;
const MAX_RANK_CANDIDATES = 500;
const MAX_MISSING_LISTED = 30;
const MAX_EXPLAINED = 5;

// --- Shared argument shapes -------------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const period = z
  .strictObject({
    preset: z.enum(PRESETS).optional(),
    financial_year: z
      .number()
      .int()
      .min(2000)
      .max(2100)
      .optional()
      .describe(
        "Starting calendar year of an April to March financial year: 2026 means FY 2026-27.",
      ),
    from: isoDate.optional(),
    to: isoDate.optional(),
    label: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .optional()
      .describe("A reporting period's exact label."),
  })
  .describe("Exactly one of: preset, financial_year, from and to, or label.");
const orgUnit = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .optional()
  .describe(
    "Name or code of an org unit from list_org_units. Leave out for the person's own unit.",
  );
const metric = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .optional()
  .describe("A metric code from list_metrics.");
const scope = z.enum(["SCOPE_1", "SCOPE_2", "SCOPE_3"]).optional();
const measure = z
  .enum(["quantity", "emissions"])
  .optional()
  .describe("quantity = the activity itself (kWh, litres); emissions = tCO2e. Default: quantity.");

// --- Resolving what the model named, inside what the person may see ---------------------------------------

/**
 * An org unit by id, code or name — looked up only among the units in scope, so a unit outside it is
 * indistinguishable from one that does not exist. With no name: the person's own unit, if they have one.
 */
export function resolveUnit(ctx: ToolContext, ref: string | undefined): OrgUnit {
  const names = (units: OrgUnit[]) =>
    units
      .slice(0, 8)
      .map((u) => u.name)
      .join(", ");
  if (!ref) {
    const ids = new Set(ctx.units.map((u) => u.id));
    const roots = ctx.units.filter((u) => !u.parentId || !ids.has(u.parentId));
    if (roots.length === 1) return roots[0];
    throw new ToolError(
      roots.length
        ? `Ask which org unit is meant. This person can see: ${names(roots)}.`
        : "This person has no org unit in scope.",
      roots.length ? "error" : "out_of_scope",
    );
  }
  const wanted = ref.toLowerCase();
  const exact = ctx.units.filter(
    (u) => u.id === wanted || u.code?.toLowerCase() === wanted || u.name.toLowerCase() === wanted,
  );
  const found = exact.length
    ? exact
    : ctx.units.filter((u) => u.name.toLowerCase().includes(wanted));
  if (found.length === 1) return found[0];
  if (found.length > 1) {
    throw new ToolError(`"${ref}" matches several org units: ${names(found)}. Ask which one.`);
  }
  throw new ToolError(`No org unit called "${ref}" is in this person's scope.`, "out_of_scope");
}

function resolveWhen(ctx: ToolContext, spec: PeriodSpec) {
  const resolved = resolvePeriods(spec, ctx.periods, ctx.today);
  if (!resolved.ok) throw new ToolError(resolved.error);
  return resolved;
}

async function resolveMetrics(ctx: ToolContext, filter: { metric?: string; scope?: string }) {
  const metricCode = filter.metric?.toUpperCase();
  const metrics = await ctx.data.metrics({ metricCode, scopeCode: filter.scope });
  if (metricCode && metrics.length === 0) {
    throw new ToolError(`No metric has the code "${metricCode}". Use list_metrics to find it.`);
  }
  return metrics;
}

const levelName = (type: string) => type.replace(/_/g, " ");

const sourceBlock = (unit: OrgUnit, label: string): Block => ({
  type: "source",
  text: `${unit.name} (${levelName(unit.type)}) and everything beneath it · ${label} · Approved records are the headline, records awaiting approval are shown separately, rejected records are left out.`,
});

const note = (text: string, tone: "info" | "warning" = "info"): Block => ({
  type: "note",
  tone,
  text,
});

// --- Consolidation: the application's own rules, per org unit and (optionally) per period -----------------

type Quantity = { unit: string; approved: number; awaiting: number };
export type Line = { metric: Metric; result: Consolidated; quantity: Quantity[] };

async function measureLines(
  ctx: ToolContext,
  nodeIds: string[],
  periods: Period[],
  metrics: Metric[],
  byPeriod: boolean,
) {
  const lines = new Map<string, Line[]>();
  const periodIds = periods.map((p) => p.id);
  const metricIds = metrics.map((m) => m.id);
  if (!nodeIds.length || !periodIds.length || !metricIds.length) {
    return { lines, withData: [] as Period[] };
  }
  const [values, inputs, quantities, labels] = await Promise.all([
    ctx.data.values(nodeIds, periodIds, metricIds),
    ctx.data.inputs(nodeIds, periodIds, metricIds),
    ctx.data.quantities(nodeIds, periodIds, metricIds),
    ctx.data.fieldLabels(metricIds),
  ]);
  const keyOf = (c: Cell) => `${c.nodeId}|${byPeriod ? c.periodId : ""}`;

  for (const m of metrics) {
    const formula = m.formulaType ? parseFormula(m.formulaType, m.formulaDefinition) : null;
    const labelOf = (key: string) =>
      labels.find((l) => l.metricId === m.id && l.key === key)?.label ?? key;
    const info: MetricInfo = {
      unit: m.unit,
      requiresCalculation: m.requiresCalculation,
      ratio:
        formula?.op === "percentage"
          ? {
              part: formula.part,
              whole: formula.whole,
              partLabel: labelOf(formula.part),
              wholeLabel: labelOf(formula.whole),
              scale: formula.scale,
            }
          : null,
    };
    const own = values.filter((v) => v.metricId === m.id);
    for (const key of new Set(own.map(keyOf))) {
      const here = <T extends Cell>(rows: T[]) =>
        rows.filter((r) => r.metricId === m.id && keyOf(r) === key);
      const quantity: Quantity[] = [];
      // Only a factor-based result has a separate activity quantity; elsewhere the result is the quantity.
      if (formula?.op === "multiply_by_factor") {
        for (const q of here(quantities)) {
          // Converted to the metric's unit where the units measure the same thing; otherwise kept apart.
          const n = normalize(1, q.unit, m.unit);
          const unit = n.ok ? m.unit : q.unit;
          const scale = n.ok ? n.normalized.value : 1;
          let sum = quantity.find((x) => x.unit === unit);
          if (!sum) quantity.push((sum = { unit, approved: 0, awaiting: 0 }));
          sum.approved += q.approved * scale;
          sum.awaiting += q.awaiting * scale;
        }
      }
      const line: Line = {
        metric: m,
        result: consolidate(
          info,
          here(own),
          here(inputs).map((i) => ({ key: i.key, approved: i.approved, awaiting: i.awaiting })),
        ),
        quantity,
      };
      lines.set(key, [...(lines.get(key) ?? []), line]);
    }
  }
  const seen = new Set(values.map((v) => v.periodId));
  return { lines, withData: periods.filter((p) => seen.has(p.id)) };
}

type Headline = { approved: number | null; awaiting: number | null; unit: string };

/** One number for a metric: its quantity (or its result where it has no separate quantity), or its emissions. */
function headline(line: Line, wanted: "quantity" | "emissions" | undefined): Headline | null {
  if (wanted === "emissions") return emissionsOf([line]);
  const quantity = line.quantity.find((q) => q.unit === line.metric.unit) ?? line.quantity[0];
  if (quantity) return quantity;
  const figure = line.result.figures[0];
  return figure
    ? { approved: figure.approved, awaiting: figure.awaiting, unit: figure.unit }
    : null;
}

/** Emissions of a set of lines in tCO2e; null when none of them is an emission. */
function emissionsOf(lines: Line[], scopeCode?: string): Headline | null {
  let approved = 0;
  let awaiting = 0;
  let found = false;
  for (const line of lines) {
    if (!line.metric.scopeCode || (scopeCode && line.metric.scopeCode !== scopeCode)) continue;
    for (const figure of line.result.figures) {
      const a = tonnesCo2e(figure.approved ?? 0, figure.unit);
      const w = tonnesCo2e(figure.awaiting ?? 0, figure.unit);
      if (a === null || w === null) continue;
      approved += a;
      awaiting += w;
      found = true;
    }
  }
  return found ? { approved, awaiting, unit: "tCO2e" } : null;
}

/** The headline for a metric when one was asked for, else the emissions of the scope (or of all scopes). */
function valueOf(
  lines: Line[] | undefined,
  a: { metric?: string; scope?: string; measure?: "quantity" | "emissions" },
): Headline | null {
  if (!lines?.length) return null;
  return a.metric ? headline(lines[0], a.measure) : emissionsOf(lines, a.scope);
}

const measureName = (
  metrics: Metric[],
  a: { metric?: string; scope?: string; measure?: "quantity" | "emissions" },
) =>
  a.metric
    ? `${metrics[0].name}${a.measure === "emissions" ? " emissions" : ""}`
    : a.scope
      ? `Scope ${a.scope.slice(-1)} emissions`
      : "Total emissions (Scope 1 + 2 + 3)";

const round = (value: number | null) => (value === null ? null : Math.round(value * 1e4) / 1e4);
const show = (value: number | null, unit: string) =>
  value === null ? "—" : `${formatNumber(value)} ${unit}`;
const notCalculatedNote = (n: number) =>
  note(
    `${n} record${n === 1 ? " has" : "s have"} no calculation yet (usually a missing conversion factor). They are left out of the result; they are not counted as zero.`,
    "warning",
  );

// --- The tools --------------------------------------------------------------------------------------------

type Tool<S extends z.ZodType> = {
  description: string;
  /** Offered to, and run for, an Admin only (`ctx.admin`). */
  adminOnly?: true;
  schema: S;
  run(args: z.infer<S>, ctx: ToolContext): Promise<ToolResult>;
};
const tool = <S extends z.ZodType>(t: Tool<S>) => t;

export const TOOLS = {
  list_org_units: tool({
    description:
      'The org units (group, subsidiaries, projects, sites...) this person may see. Use it to find the exact name before another tool. For what belongs to a unit ("the projects under X"), pass under: the answer then holds only units beneath X.',
    schema: z.strictObject({
      search: z.string().trim().max(80).optional().describe("Part of a name."),
      type: z.string().trim().max(40).optional().describe("A level, e.g. project or subsidiary."),
      under: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .optional()
        .describe("Name or code of an org unit: list only the units beneath it, at any depth."),
      direct_only: z
        .boolean()
        .optional()
        .describe("With under: only the units directly beneath it, not their own children."),
    }),
    async run(a, ctx) {
      const search = a.search?.toLowerCase();
      // Membership is worked out here from the hierarchy, never left to the model to read off a list.
      const beneath = new Set<string>();
      if (a.under) {
        let layer = [resolveUnit(ctx, a.under).id];
        while (layer.length) {
          const parents = new Set(layer);
          const children = ctx.units.filter((u) => sitsUnder(u, parents) && !beneath.has(u.id));
          for (const child of children) beneath.add(child.id);
          layer = a.direct_only ? [] : children.map((u) => u.id);
        }
      }
      const found = ctx.units.filter(
        (u) =>
          (!a.under || beneath.has(u.id)) &&
          (!search || u.name.toLowerCase().includes(search)) &&
          (!a.type || u.type === a.type.toLowerCase().replace(/ /g, "_")),
      );
      const shown = found.slice(0, MAX_TABLE_ROWS);
      // Every parent of a shared unit, main one first.
      const parent = (u: OrgUnit) =>
        [u.parentId, ...(u.alsoUnder ?? [])]
          .map((id) => ctx.units.find((p) => p.id === id)?.name)
          .filter(Boolean)
          .join(" and ") || null;
      return {
        data: {
          total: found.length,
          org_units: shown.map((u) => ({
            name: u.name,
            code: u.code,
            level: levelName(u.type),
            parent: parent(u),
          })),
        },
        blocks: [
          {
            type: "table",
            title:
              found.length > shown.length
                ? `Org units in your scope (first ${shown.length} of ${found.length})`
                : "Org units in your scope",
            columns: ["Org unit", "Level", "Under"],
            rows: shown.map((u) => [u.name, levelName(u.type), parent(u) ?? "—"]),
          },
        ],
        orgUnitIds: [],
      };
    },
  }),

  list_metrics: tool({
    description:
      "The ESG metrics the application records (code, name, unit, scope). Use it to find a metric code.",
    schema: z.strictObject({ scope }),
    async run(a, ctx) {
      const metrics = (await ctx.data.metrics({ scopeCode: a.scope })).slice(0, 100);
      return {
        data: metrics.map((m) => ({
          code: m.code,
          name: m.name,
          unit: m.unit,
          scope: m.scopeName,
        })),
        blocks: [
          {
            type: "table",
            title: "Metrics",
            columns: ["Metric", "Unit", "Scope"],
            rows: metrics.slice(0, MAX_TABLE_ROWS).map((m) => [m.name, m.unit, m.scopeName ?? "—"]),
          },
        ],
        orgUnitIds: [],
      };
    },
  }),

  get_totals: tool({
    description:
      "Totals for one org unit over a period: every metric with data (or one metric, or one scope), with quantity, calculated result, what awaits approval, and Scope 1/2/3 emissions. Use for 'how much', summaries and reports.",
    schema: z.strictObject({ org_unit: orgUnit, period, metric, scope }),
    async run(a, ctx) {
      const unit = resolveUnit(ctx, a.org_unit);
      const when = resolveWhen(ctx, a.period);
      const metrics = await resolveMetrics(ctx, a);
      const { lines, withData } = await measureLines(ctx, [unit.id], when.periods, metrics, false);
      const own = lines.get(`${unit.id}|`) ?? [];
      const blocks: Block[] = [];
      if (when.note) blocks.push(note(when.note));
      if (!own.length) {
        const text = `No verified records for ${unit.name} in ${when.label}${a.metric ? ` for ${metrics[0].name}` : ""}. That means no data was found, not a value of zero.`;
        return {
          data: { org_unit: unit.name, period: when.label, no_data: true, explanation: text },
          blocks: [...blocks, note(text, "warning"), sourceBlock(unit, when.label)],
          orgUnitIds: [unit.id],
        };
      }

      const scopes = ["SCOPE_1", "SCOPE_2", "SCOPE_3"].flatMap((code) => {
        const total = emissionsOf(own, code);
        return total ? [{ scope: `Scope ${code.slice(-1)}`, ...total }] : [];
      });
      const single = a.metric ? own[0] : null;
      if (single) {
        const quantity = headline(single, "quantity");
        const emissions = emissionsOf([single]);
        const items = [];
        if (quantity) {
          items.push({
            label: `${single.metric.name}, approved`,
            value: quantity.approved === null ? "—" : formatNumber(quantity.approved),
            unit: quantity.unit,
            sub: quantity.awaiting
              ? `${show(quantity.awaiting, quantity.unit)} awaiting approval`
              : undefined,
          });
        }
        if (emissions && single.quantity.length) {
          items.push({
            label: "Emissions, approved",
            value: formatNumber(emissions.approved ?? 0),
            unit: emissions.unit,
            sub: emissions.awaiting
              ? `${show(emissions.awaiting, emissions.unit)} awaiting approval`
              : undefined,
          });
        }
        if (items.length) blocks.push({ type: "stats", items });
      } else if (scopes.length) {
        blocks.push({
          type: "stats",
          items: scopes.map((s) => ({
            label: `${s.scope} emissions, approved`,
            value: formatNumber(s.approved ?? 0),
            unit: s.unit,
            sub: s.awaiting ? `${show(s.awaiting, s.unit)} awaiting approval` : undefined,
          })),
        });
      }

      const shown = own.slice(0, MAX_TABLE_ROWS);
      blocks.push({
        type: "table",
        title: `${unit.name} · ${when.label}`,
        columns: [
          "Metric",
          "Quantity (approved)",
          "Result (approved)",
          "Awaiting approval",
          "Records",
        ],
        rows: shown.map((l) => {
          const waiting = l.quantity.length
            ? l.quantity.filter((q) => q.awaiting).map((q) => show(q.awaiting, q.unit))
            : l.result.figures.filter((f) => f.awaiting).map((f) => show(f.awaiting, f.unit));
          return [
            l.metric.name,
            l.quantity.map((q) => show(q.approved, q.unit)).join(" + ") || "—",
            l.result.figures.map((f) => show(f.approved, f.unit)).join(" + ") || "—",
            waiting.join(" + ") || "—",
            String(l.result.figures.reduce((n, f) => n + f.records, 0) + l.result.notCalculated),
          ];
        }),
      });
      const notCalculated = own.reduce((n, l) => n + l.result.notCalculated, 0);
      if (notCalculated) blocks.push(notCalculatedNote(notCalculated));
      const coverage =
        when.periods.length > 1
          ? `Records were found in ${withData.length} of ${when.periods.length} reporting periods${
              withData.length
                ? ` (${withData[0].label} to ${withData[withData.length - 1].label})`
                : ""
            }.`
          : null;
      if (coverage) blocks.push(note(coverage));
      blocks.push(sourceBlock(unit, when.label));

      return {
        data: {
          org_unit: unit.name,
          level: levelName(unit.type),
          period: when.label,
          coverage,
          scope_emissions: scopes.map((s) => ({
            scope: s.scope,
            approved: round(s.approved),
            awaiting_approval: round(s.awaiting),
            unit: s.unit,
          })),
          metrics: shown.map((l) => ({
            code: l.metric.code,
            name: l.metric.name,
            scope: l.metric.scopeName,
            quantity: l.quantity.map((q) => ({
              approved: round(q.approved),
              awaiting_approval: round(q.awaiting),
              unit: q.unit,
            })),
            result: l.result.figures.map((f) => ({
              approved: round(f.approved),
              awaiting_approval: round(f.awaiting),
              unit: f.unit,
            })),
            derived_from: l.result.basis
              ? `${l.result.basis.partLabel} ${l.result.basis.approved.part} of ${l.result.basis.wholeLabel} ${l.result.basis.approved.whole}`
              : undefined,
            records_without_calculation: l.result.notCalculated || undefined,
          })),
          metrics_not_shown: own.length - shown.length || undefined,
        },
        blocks,
        orgUnitIds: [unit.id],
      };
    },
  }),

  compare: tool({
    description:
      "Compares two sides: the same org unit in two periods, or two org units in one period. 'a' is the current side and 'b' is what it is compared against. Gives the difference and percentage change for one metric, or for Scope 1/2/3 emissions when no metric is named.",
    schema: z.strictObject({
      a: z.strictObject({ org_unit: orgUnit, period }),
      b: z.strictObject({ org_unit: orgUnit, period }),
      metric,
      scope,
      measure,
    }),
    async run(a, ctx) {
      const metrics = await resolveMetrics(ctx, a);
      // Both sides are resolved inside the person's scope before either is read.
      const sides = [a.a, a.b].map((side) => ({
        unit: resolveUnit(ctx, side.org_unit),
        when: resolveWhen(ctx, side.period),
      }));
      const [first, second] = await Promise.all(
        sides.map(async ({ unit, when }) => {
          const { lines } = await measureLines(ctx, [unit.id], when.periods, metrics, false);
          return { unit, when, lines: lines.get(`${unit.id}|`) };
        }),
      );
      const label = (side: typeof first, other: typeof first) =>
        side.unit.id === other.unit.id
          ? side.when.label
          : side.when.label === other.when.label
            ? side.unit.name
            : `${side.unit.name} · ${side.when.label}`;
      const labels = [label(first, second), label(second, first)];

      const wanted = a.metric
        ? [{ name: measureName(metrics, a), pick: (l?: Line[]) => valueOf(l, a) }]
        : (a.scope ? [a.scope] : ["SCOPE_1", "SCOPE_2", "SCOPE_3", undefined]).map((code) => ({
            name: measureName(metrics, { scope: code }),
            pick: (l?: Line[]) => (l?.length ? emissionsOf(l, code) : null),
          }));
      const rows = wanted.flatMap((w) => {
        const x = w.pick(first.lines);
        const y = w.pick(second.lines);
        if (!x && !y) return [];
        const unit = (x ?? y)!.unit;
        // Different units are never subtracted.
        const comparable = !x || !y || x.unit === y.unit;
        const change = comparable
          ? percentChange(x?.approved ?? null, y?.approved ?? null)
          : { difference: null, percent: null, note: "The two sides are in different units." };
        return [{ name: w.name, unit, a: x, b: y, change }];
      });

      const blocks: Block[] = [];
      for (const side of [first, second]) if (side.when.note) blocks.push(note(side.when.note));
      if (!rows.length) {
        const text = `No verified records on either side (${labels.join(" and ")}) for ${measureName(metrics, a)}.`;
        blocks.push(note(text, "warning"));
      } else {
        const main = rows[rows.length - 1];
        blocks.push({
          type: "table",
          title: `${labels[0]} against ${labels[1]} (approved records)`,
          columns: ["Measure", labels[0], labels[1], "Difference", "Change"],
          rows: rows.map((r) => [
            r.name,
            r.a ? show(r.a.approved, r.a.unit) : "No data",
            r.b ? show(r.b.approved, r.b.unit) : "No data",
            r.change.difference === null ? "—" : show(r.change.difference, r.unit),
            r.change.percent === null ? "—" : `${formatNumber(r.change.percent)}%`,
          ]),
        });
        blocks.push({
          type: "chart",
          kind: "bar",
          title: main.name,
          unit: main.unit,
          points: [
            { label: labels[0], value: main.a?.approved ?? null },
            { label: labels[1], value: main.b?.approved ?? null },
          ],
        });
        for (const text of new Set(rows.flatMap((r) => (r.change.note ? [r.change.note] : [])))) {
          blocks.push(note(text, "warning"));
        }
      }
      blocks.push(sourceBlock(first.unit, first.when.label));
      if (second.unit.id !== first.unit.id || second.when.label !== first.when.label) {
        blocks.push(sourceBlock(second.unit, second.when.label));
      }
      return {
        data: {
          a: { org_unit: first.unit.name, period: first.when.label },
          b: { org_unit: second.unit.name, period: second.when.label },
          rows: rows.map((r) => ({
            measure: r.name,
            unit: r.unit,
            a_approved: r.a ? round(r.a.approved) : "no data",
            b_approved: r.b ? round(r.b.approved) : "no data",
            a_awaiting_approval: r.a ? round(r.a.awaiting) : undefined,
            b_awaiting_approval: r.b ? round(r.b.awaiting) : undefined,
            difference_a_minus_b: round(r.change.difference),
            percent_change: round(r.change.percent),
            note: r.change.note ?? undefined,
          })),
          no_data: rows.length === 0 || undefined,
        },
        blocks,
        orgUnitIds: [...new Set([first.unit.id, second.unit.id])],
      };
    },
  }),

  get_trend: tool({
    description:
      "One figure per reporting period for an org unit: a metric's quantity or emissions, or Scope 1/2/3 emissions when no metric is named. Use for trends over months.",
    schema: z.strictObject({ org_unit: orgUnit, period, metric, scope, measure }),
    async run(a, ctx) {
      const unit = resolveUnit(ctx, a.org_unit);
      const when = resolveWhen(ctx, a.period);
      if (when.periods.length > MAX_TREND_PERIODS) {
        throw new ToolError(
          `A trend covers at most ${MAX_TREND_PERIODS} reporting periods. Narrow it.`,
        );
      }
      const metrics = await resolveMetrics(ctx, a);
      const { lines } = await measureLines(ctx, [unit.id], when.periods, metrics, true);
      const name = measureName(metrics, a);
      const points = when.periods.map((p) => ({
        period: p,
        value: valueOf(lines.get(`${unit.id}|${p.id}`), a),
      }));
      const withData = points.filter((p) => p.value);
      const unitLabel = withData[0]?.value?.unit ?? "";
      const blocks: Block[] = [];
      if (when.note) blocks.push(note(when.note));
      let change = null;
      if (!withData.length) {
        blocks.push(
          note(`No verified records for ${name} at ${unit.name} in ${when.label}.`, "warning"),
        );
      } else {
        blocks.push({
          type: "chart",
          kind: "line",
          title: `${name} · ${unit.name}`,
          unit: unitLabel,
          points: points.map((p) => ({
            label: p.period.label,
            // A period in another unit is left out of the line, never plotted on the wrong scale.
            value: p.value?.unit === unitLabel ? p.value.approved : null,
          })),
        });
        blocks.push({
          type: "table",
          title: `${name} by reporting period`,
          columns: ["Period", "Approved", "Awaiting approval"],
          rows: points.map((p) => [
            p.period.label,
            p.value ? show(p.value.approved, p.value.unit) : "No data",
            p.value?.awaiting ? show(p.value.awaiting, p.value.unit) : "—",
          ]),
        });
        const missing = points.length - withData.length;
        if (missing) {
          blocks.push(
            note(
              `${missing} of ${points.length} periods have no verified records; they are gaps, not zeros.`,
            ),
          );
        }
        const same = withData.filter((p) => p.value!.unit === unitLabel);
        if (same.length > 1) {
          change = percentChange(same[same.length - 1].value!.approved, same[0].value!.approved);
        }
      }
      blocks.push(sourceBlock(unit, when.label));
      return {
        data: {
          org_unit: unit.name,
          period: when.label,
          measure: name,
          unit: unitLabel,
          series: points.map((p) => ({
            period: p.period.label,
            approved: p.value ? round(p.value.approved) : "no data",
            awaiting_approval: p.value ? round(p.value.awaiting) : undefined,
          })),
          first_to_last: change
            ? { difference: round(change.difference), percent_change: round(change.percent) }
            : undefined,
          no_data: withData.length === 0 || undefined,
        },
        blocks,
        orgUnitIds: [unit.id],
      };
    },
  }),

  rank_org_units: tool({
    description:
      "Ranks the org units beneath one org unit by a metric's quantity or emissions, or by Scope emissions, highest first. Use for 'which projects have the highest...'.",
    schema: z.strictObject({
      parent: orgUnit,
      type: z
        .string()
        .trim()
        .max(40)
        .optional()
        .describe("Level to rank, e.g. project. Default: the units directly beneath the parent."),
      period,
      metric,
      scope,
      measure,
      limit: z.number().int().min(1).max(20).optional(),
    }),
    async run(a, ctx) {
      const parent = resolveUnit(ctx, a.parent);
      const when = resolveWhen(ctx, a.period);
      const metrics = await resolveMetrics(ctx, a);
      const type = a.type?.toLowerCase().replace(/ /g, "_");
      const beneath = new Set([parent.id]);
      // ctx.units is the person's whole scope; a few passes reach every level of the tree.
      for (let grew = true; grew;) {
        grew = false;
        for (const u of ctx.units) {
          if (sitsUnder(u, beneath) && !beneath.has(u.id)) {
            beneath.add(u.id);
            grew = true;
          }
        }
      }
      const candidates = ctx.units.filter((u) =>
        type
          ? beneath.has(u.id) && u.id !== parent.id && u.type === type
          : sitsUnder(u, new Set([parent.id])),
      );
      if (!candidates.length) {
        throw new ToolError(
          `${parent.name} has no ${type ? levelName(type) : "org unit"} beneath it.`,
        );
      }
      if (candidates.length > MAX_RANK_CANDIDATES) {
        throw new ToolError(
          `That would rank ${candidates.length} org units. Start from a lower level.`,
        );
      }
      const { lines } = await measureLines(
        ctx,
        candidates.map((c) => c.id),
        when.periods,
        metrics,
        false,
      );
      const name = measureName(metrics, a);
      const valued = candidates
        .map((unit) => ({ unit, value: valueOf(lines.get(`${unit.id}|`), a) }))
        .filter((c) => c.value && c.value.approved !== null);
      const unitLabel = valued[0]?.value?.unit ?? "";
      const ranked = valued
        .filter((c) => c.value!.unit === unitLabel)
        .sort((x, y) => y.value!.approved! - x.value!.approved!);
      const top = ranked.slice(0, a.limit ?? 10);
      const blocks: Block[] = [];
      if (when.note) blocks.push(note(when.note));
      if (!top.length) {
        blocks.push(
          note(
            `No verified records for ${name} beneath ${parent.name} in ${when.label}.`,
            "warning",
          ),
        );
      } else {
        blocks.push({
          type: "chart",
          kind: "bar",
          title: `${name} · ${when.label}`,
          unit: unitLabel,
          points: top.map((c) => ({ label: c.unit.name, value: c.value!.approved })),
        });
        blocks.push({
          type: "table",
          title: `${name}, highest first (approved records)`,
          columns: ["Rank", "Org unit", "Approved", "Awaiting approval"],
          rows: top.map((c, i) => [
            String(i + 1),
            c.unit.name,
            show(c.value!.approved, unitLabel),
            c.value!.awaiting ? show(c.value!.awaiting, unitLabel) : "—",
          ]),
        });
        const without = candidates.length - ranked.length;
        if (without) {
          blocks.push(
            note(
              `${without} of ${candidates.length} org units have no such data and are not ranked.`,
            ),
          );
        }
      }
      blocks.push(sourceBlock(parent, when.label));
      return {
        data: {
          beneath: parent.name,
          period: when.label,
          measure: name,
          unit: unitLabel,
          compared: candidates.length,
          with_data: ranked.length,
          ranking: top.map((c, i) => ({
            rank: i + 1,
            org_unit: c.unit.name,
            approved: round(c.value!.approved),
            awaiting_approval: round(c.value!.awaiting),
          })),
          no_data: top.length === 0 || undefined,
        },
        blocks,
        orgUnitIds: [parent.id],
      };
    },
  }),

  get_completeness: tool({
    description:
      "Data completeness and quality for an org unit, per reporting period: submissions expected and missing, and how many records are unverified, flagged, awaiting approval, approved or returned.",
    schema: z.strictObject({ org_unit: orgUnit, period }),
    async run(a, ctx) {
      const unit = resolveUnit(ctx, a.org_unit);
      const when = resolveWhen(ctx, a.period);
      if (when.periods.length > MAX_COMPLETENESS_PERIODS) {
        throw new ToolError(
          `Completeness covers at most ${MAX_COMPLETENESS_PERIODS} periods. Narrow it.`,
        );
      }
      const periodIds = when.periods.map((p) => p.id);
      const [statuses, expectations, submitted] = periodIds.length
        ? await Promise.all([
            ctx.data.statuses(unit.id, periodIds),
            ctx.data.expectations(unit.id),
            ctx.data.submitted(unit.id, periodIds),
          ])
        : [[], [], []];
      const filed = new Set(submitted.map((s) => `${s.orgUnitId}|${s.metricId}|${s.periodId}`));
      const nameOf = (id: string) => ctx.units.find((u) => u.id === id)?.name ?? "An org unit";
      const count = (periodId: string, ...wanted: string[]) =>
        statuses
          .filter((s) => s.periodId === periodId && wanted.includes(s.status))
          .reduce((n, s) => n + s.records, 0);
      const missing: string[][] = [];
      const rows = when.periods.map((p) => {
        // An expectation applies to periods of the metric's own frequency, as on the Control Tower.
        const expected = expectations.filter((e) => e.frequency === p.type);
        const absent = expected.filter((e) => !filed.has(`${e.orgUnitId}|${e.metricId}|${p.id}`));
        for (const e of absent) missing.push([p.label, nameOf(e.orgUnitId), e.metric]);
        return {
          period: p.label,
          expected: expected.length,
          missing: absent.length,
          unverified: count(p.id, "processing", "needs_verification"),
          flagged_or_failed: count(p.id, "flagged", "failed"),
          awaiting_approval: count(p.id, "verified", "awaiting_approval"),
          approved: count(p.id, "approved"),
          returned: count(p.id, "returned"),
        };
      });
      const blocks: Block[] = [];
      if (when.note) blocks.push(note(when.note));
      if (!rows.length) {
        blocks.push(note(`No reporting period to check for ${when.label}.`, "warning"));
      } else {
        blocks.push({
          type: "table",
          title: `Completeness · ${unit.name}`,
          columns: [
            "Period",
            "Expected",
            "Missing",
            "Unverified",
            "Flagged or failed",
            "Awaiting approval",
            "Approved",
            "Returned",
          ],
          rows: rows.map((r) => [
            r.period,
            String(r.expected),
            String(r.missing),
            String(r.unverified),
            String(r.flagged_or_failed),
            String(r.awaiting_approval),
            String(r.approved),
            String(r.returned),
          ]),
        });
        if (missing.length) {
          blocks.push({
            type: "table",
            title:
              missing.length > MAX_MISSING_LISTED
                ? `Missing submissions (first ${MAX_MISSING_LISTED} of ${missing.length})`
                : "Missing submissions",
            columns: ["Period", "Org unit", "Metric"],
            rows: missing.slice(0, MAX_MISSING_LISTED),
          });
        }
        if (!expectations.length) {
          blocks.push(
            note(
              "No expected submissions are configured beneath this org unit, so nothing can be called missing.",
            ),
          );
        }
      }
      blocks.push({
        type: "source",
        text: `${unit.name} (${levelName(unit.type)}) and everything beneath it · ${when.label} · Expected submissions are the ones an Admin configured; a rejected record does not count as submitted.`,
      });
      return {
        data: {
          org_unit: unit.name,
          period: when.label,
          periods: rows,
          missing_submissions: missing
            .slice(0, MAX_MISSING_LISTED)
            .map(([p, o, m]) => ({ period: p, org_unit: o, metric: m })),
          missing_total: missing.length,
        },
        blocks,
        orgUnitIds: [unit.id],
      };
    },
  }),

  explain_calculation: tool({
    description:
      "How a metric's calculated results were worked out for an org unit and period: the verified input, the conversion factor with its version and source, the formula and the result, record by record.",
    schema: z.strictObject({
      org_unit: orgUnit,
      period,
      metric: z.string().trim().min(1).max(60).describe("A metric code from list_metrics."),
    }),
    async run(a, ctx) {
      const unit = resolveUnit(ctx, a.org_unit);
      const when = resolveWhen(ctx, a.period);
      const [m] = await resolveMetrics(ctx, { metric: a.metric });
      const { total, rows } = when.periods.length
        ? await ctx.data.calculations(
            unit.id,
            when.periods.map((p) => p.id),
            m.id,
            MAX_EXPLAINED,
          )
        : { total: 0, rows: [] };
      const formula = m.formulaType ? parseFormula(m.formulaType, m.formulaDefinition) : null;
      const method = !m.requiresCalculation
        ? "This metric is a recorded amount: the verified value is reported as it is, with no calculation."
        : formula?.op === "multiply_by_factor"
          ? "Result = verified quantity, converted to the factor's unit, × the conversion factor in force for the record's reporting period."
          : formula?.op === "subtract"
            ? `Result = ${formula.inputs[0]} − ${formula.inputs[1]}, both verified fields of the same document.`
            : formula?.op === "percentage"
              ? `Result = ${formula.part} ÷ ${formula.whole} × ${formula.scale}. Across org units or periods the parts and wholes are summed first, then divided; percentages are never averaged.`
              : "No active formula is configured for this metric.";
      const blocks: Block[] = [];
      if (when.note) blocks.push(note(when.note));
      blocks.push(note(method));
      if (!rows.length) {
        blocks.push(
          note(`No calculated record for ${m.name} at ${unit.name} in ${when.label}.`, "warning"),
        );
      } else {
        blocks.push({
          type: "table",
          title:
            total > rows.length
              ? `${m.name}: ${rows.length} of ${total} calculations`
              : `${m.name}: calculations`,
          columns: [
            "Period",
            "Org unit",
            "Verified input",
            "Factor",
            "Result",
            "Factor source",
            "Status",
          ],
          rows: rows.map((r) => [
            r.periodLabel,
            ctx.units.find((u) => u.id === r.orgUnitId)?.name ?? "—",
            r.inputs.length
              ? r.inputs.map((i) => `${i.key} ${show(i.value, i.unit)}`).join(", ")
              : `${show(r.inputValue, r.inputUnit)}${r.normalizedUnit !== r.inputUnit ? ` = ${show(r.normalizedValue, r.normalizedUnit)}` : ""}`,
            r.factorValue === null
              ? "—"
              : `${formatNumber(r.factorValue)} ${r.factorOutputUnit}/${r.factorInputUnit} (${r.factorName}, v${r.factorVersion})`,
            show(r.resultValue, r.resultUnit),
            (r.factorSource ?? "—").slice(0, 200),
            r.approvalStatus === "approved" ? "Approved" : "Awaiting approval",
          ]),
        });
      }
      blocks.push(sourceBlock(unit, when.label));
      return {
        data: {
          org_unit: unit.name,
          period: when.label,
          metric: m.name,
          method,
          calculations_total: total,
          calculations: rows.map((r) => ({
            period: r.periodLabel,
            org_unit: ctx.units.find((u) => u.id === r.orgUnitId)?.name,
            status: r.approvalStatus,
            verified_input: `${r.inputValue} ${r.inputUnit}`,
            normalized_input: `${r.normalizedValue} ${r.normalizedUnit}`,
            inputs: r.inputs.length ? r.inputs : undefined,
            factor:
              r.factorValue === null
                ? undefined
                : {
                    name: r.factorName,
                    version: r.factorVersion,
                    value: r.factorValue,
                    unit: `${r.factorOutputUnit} per ${r.factorInputUnit}`,
                    source: r.factorSource?.slice(0, 300),
                  },
            result: `${r.resultValue} ${r.resultUnit}`,
            engine: r.engineVersion,
          })),
        },
        blocks,
        orgUnitIds: [unit.id],
      };
    },
  }),

  // --- Admin only (.grill/chat-admin-access-decisions.md) ------------------------------------------------

  list_people: tool({
    adminOnly: true,
    description:
      "The people with an account: name, roles, org units, active or deactivated. Use for any question about employees, users, who holds a role or who works where. Email addresses and employee ids are in the table the application shows the person beneath your answer; you are not given them, so point to the table for those.",
    schema: z.strictObject({
      search: z
        .string()
        .trim()
        .max(80)
        .optional()
        .describe("Part of a name, email or employee id."),
      role: z.string().trim().max(60).optional().describe("A role's name or code, e.g. hr."),
      org_unit: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .optional()
        .describe("Only people assigned at this org unit or beneath it. Leave out for everyone."),
    }),
    async run(a, ctx) {
      const unit = a.org_unit ? resolveUnit(ctx, a.org_unit) : undefined;
      const { total, rows } = await ctx.admin!.people({
        search: a.search,
        role: a.role,
        nodeId: unit?.id,
        limit: MAX_TABLE_ROWS,
      });
      const list = (p: Person, key: "role" | "orgUnit") =>
        [...new Set(p.assignments.map((x) => x[key]))].join(", ") || "—";
      return {
        // What leaves for the AI service is what wording an answer needs. Email addresses and employee ids
        // stay here: the table below is drawn by the application for the Admin and never passes the model.
        data: {
          total,
          people: rows.map((p) => ({
            name: p.name,
            status: p.active ? "active" : "deactivated",
            assignments: p.assignments,
          })),
        },
        blocks: [
          {
            type: "table",
            title:
              total > rows.length
                ? `People (first ${rows.length} of ${total})`
                : `People (${total})`,
            columns: ["Name", "Email", "Employee ID", "Role", "Org unit", "Status"],
            rows: rows.map((p) => [
              p.name,
              p.email,
              p.employeeId ?? "—",
              list(p, "role"),
              list(p, "orgUnit"),
              p.active ? "Active" : "Deactivated",
            ]),
          },
        ],
        orgUnitIds: unit ? [unit.id] : [],
      };
    },
  }),

  list_records: tool({
    adminOnly: true,
    description:
      "The individual records of one org unit (and everything beneath it) over a period: value, status, who submitted it and who approved it. Use for 'who uploaded', 'who approved', 'which records'. Each document's file name is in the table the application shows beneath your answer; you are not given it.",
    schema: z.strictObject({ org_unit: orgUnit, period, metric }),
    async run(a, ctx) {
      const unit = resolveUnit(ctx, a.org_unit);
      const when = resolveWhen(ctx, a.period);
      const [wanted] = a.metric ? await resolveMetrics(ctx, { metric: a.metric }) : [];
      const { total, rows } = await ctx.admin!.records({
        nodeId: unit.id,
        periodIds: when.periods.map((p) => p.id),
        metricId: wanted?.id,
        limit: MAX_TABLE_ROWS,
      });
      const unitName = (id: string) => ctx.units.find((u) => u.id === id)?.name ?? "—";
      const status = (s: string) => s.replace(/_/g, " ");
      return {
        data: {
          org_unit: unit.name,
          period: when.label,
          total,
          records: rows.map((r) => ({
            org_unit: unitName(r.orgUnitId),
            period: r.periodLabel,
            metric: r.metric,
            value: r.value === null ? null : `${r.value} ${r.unit ?? ""}`.trim(),
            status: status(r.status),
            submitted_by: r.submittedBy,
            approved_by: r.approvedBy,
            // The file name is typed by whoever uploaded it: it is shown in the table, not sent to the model.
          })),
        },
        blocks: [
          {
            type: "table",
            title:
              total > rows.length
                ? `Records (first ${rows.length} of ${total})`
                : `Records (${total})`,
            columns: [
              "Org unit",
              "Period",
              "Metric",
              "Value",
              "Status",
              "Submitted by",
              "Approved by",
              "Document",
            ],
            rows: rows.map((r) => [
              unitName(r.orgUnitId),
              r.periodLabel,
              r.metric,
              r.value === null ? "—" : show(r.value, r.unit ?? ""),
              status(r.status),
              r.submittedBy,
              r.approvedBy ?? "—",
              r.fileName?.slice(0, 200) ?? "—",
            ]),
          },
          ...(when.note ? [note(when.note)] : []),
          {
            type: "source",
            text: `${unit.name} (${levelName(unit.type)}) and everything beneath it · ${when.label} · Every record, whatever its status.`,
          },
        ],
        orgUnitIds: [unit.id],
      };
    },
  }),

  open_report_page: tool({
    adminOnly: true,
    description:
      "Takes the person to the Reports page with an org unit and a period already selected, so they can generate or find the BRSR report. Use whenever they want to see, open, generate or download a report for a month, a financial year or any custom period.",
    schema: z.strictObject({ org_unit: orgUnit, period }),
    async run(a, ctx) {
      const unit = resolveUnit(ctx, a.org_unit);
      const when = resolveWhen(ctx, a.period);
      const first = when.periods[0];
      const last = when.periods[when.periods.length - 1];
      if (!first) throw new ToolError(when.note ?? "No reporting period covers that.");
      const year = financialYearOf(ctx.today);
      const financialYear =
        a.period.financial_year ??
        (a.period.preset === "current_financial_year"
          ? year
          : a.period.preset === "previous_financial_year"
            ? year - 1
            : undefined);
      // The Reports form's three kinds of coverage: a financial year, one period, or a custom range.
      const selection =
        financialYear !== undefined
          ? `fy=${financialYear}`
          : when.periods.length === 1
            ? `period=${first.id}`
            : `from=${first.start}&to=${last.end}`;
      return {
        data: {
          opened: "the Reports page",
          org_unit: unit.name,
          period: when.label,
          note: "The page is open with this selection. Nothing was generated: the person presses Generate BRSR report there. Earlier reports are listed below the form.",
        },
        blocks: [
          {
            type: "link",
            label: `Reports · ${unit.name} · ${when.label}`,
            href: `/admin/reports?org=${unit.id}&${selection}`,
          },
          ...(when.note ? [note(when.note)] : []),
        ],
        orgUnitIds: [unit.id],
      };
    },
  }),

  explain_forecast: tool({
    description:
      "Explain the emissions forecast and chronological backtest results for an org unit. Projects future emissions for Scope 1, Scope 2, Scope 3, or Total emissions using validated statistical time-series models with 80% and 95% uncertainty intervals.",
    schema: z.strictObject({
      org_unit: orgUnit,
      scope: z
        .enum(["SCOPE_1", "SCOPE_2", "SCOPE_3", "TOTAL"])
        .optional()
        .describe("Scope to forecast: SCOPE_1, SCOPE_2, SCOPE_3, or TOTAL (default)"),
      periods_ahead: z
        .number()
        .int()
        .min(1)
        .max(4)
        .optional()
        .describe("Number of future periods ahead to forecast (1 to 4, default 2)"),
    }),
    async run(a, ctx) {
      const unit = resolveUnit(ctx, a.org_unit);
      const scopeCode = a.scope && a.scope !== "TOTAL" ? a.scope : undefined;
      const metrics = (await ctx.data.metrics({ scopeCode })).filter((m) => m.scopeCode);
      const periods = ctx.periods;
      const { lines } = await measureLines(ctx, [unit.id], periods, metrics, true);

      // Build HistoricalObservation[] for each period
      const targetCode = a.scope ?? "TOTAL";
      const historical: HistoricalObservation[] = periods.map((p) => {
        const line = lines.get(`${unit.id}|${p.id}`);
        const em = emissionsOf(line ?? [], scopeCode);
        return {
          periodId: p.id,
          periodLabel: p.label,
          startDate: p.start,
          endDate: p.end,
          valueTco2e: em?.approved ?? 0,
          approvedRecordCount:
            line?.reduce((sum, l) => sum + (l.result.figures[0]?.records ?? 0), 0) ?? 0,
          pendingRecordCount: 0,
          uncalculatedRecordCount: 0,
        };
      });

      const scopeName =
        targetCode === "SCOPE_1"
          ? "Scope 1 (Direct Emissions)"
          : targetCode === "SCOPE_2"
            ? "Scope 2 (Indirect Electricity & Steam)"
            : targetCode === "SCOPE_3"
              ? "Scope 3 (Value Chain)"
              : "Total Emissions (Scope 1 + 2 + 3)";

      const forecast = generateForecast({
        historical,
        scopeTarget: targetCode,
        scopeName,
        horizonPeriods: a.periods_ahead ?? 2,
        totalConfiguredPeriods: periods.length,
      });

      const blocks: Block[] = [];
      const unitLabel = "tCO2e";

      if (!forecast.canForecast) {
        blocks.push(
          note(
            forecast.insufficientDataReason ?? "Insufficient historical data for forecasting.",
            "warning",
          ),
        );
        blocks.push(sourceBlock(unit, "All configured periods"));
        return {
          data: {
            org_unit: unit.name,
            scope: scopeName,
            can_forecast: false,
            reason: forecast.insufficientDataReason,
            recommendations: forecast.recommendations,
          },
          blocks,
          orgUnitIds: [unit.id],
        };
      }

      // Stats block
      const lastObs = forecast.historical[forecast.historical.length - 1];
      const nextPred = forecast.predictions[0];
      blocks.push({
        type: "stats",
        items: [
          {
            label: "Latest observed",
            value: formatNumber(lastObs.valueTco2e),
            unit: unitLabel,
            sub: lastObs.periodLabel,
          },
          {
            label: `Forecast (${nextPred.periodLabel})`,
            value: formatNumber(nextPred.predictedTco2e),
            unit: unitLabel,
            sub: "Statistical estimate",
          },
          {
            label: "Backtest error (MAPE)",
            value: `${forecast.validationMetrics?.mape ?? 0}%`,
            unit: "",
            sub: forecast.modelName,
          },
          {
            label: "95% prediction interval",
            value: `${nextPred.confidenceInterval95.lower.toFixed(1)}–${nextPred.confidenceInterval95.upper.toFixed(1)}`,
            unit: unitLabel,
            sub: "Expected range",
          },
        ],
      });

      // Chart block
      const chartPoints = [
        ...forecast.historical.map((h) => ({ label: h.periodLabel, value: h.valueTco2e })),
        ...forecast.predictions.map((p) => ({ label: p.periodLabel, value: p.predictedTco2e })),
      ];
      blocks.push({
        type: "chart",
        kind: "line",
        title: `${scopeName} forecast · ${unit.name}`,
        unit: unitLabel,
        points: chartPoints.slice(-36),
      });

      // Table block
      blocks.push({
        type: "table",
        title: `${scopeName} observations and predictions`,
        columns: ["Period", "Classification", "Value", "95% Interval"],
        rows: [
          ...forecast.historical
            .slice(-6)
            .map((h) => [
              h.periodLabel,
              "Approved actual",
              `${formatNumber(h.valueTco2e)} ${unitLabel}`,
              "—",
            ]),
          ...forecast.predictions.map((p) => [
            p.periodLabel,
            "Forecast estimate",
            `${formatNumber(p.predictedTco2e)} ${unitLabel}`,
            `${p.confidenceInterval95.lower.toFixed(1)} – ${p.confidenceInterval95.upper.toFixed(1)} ${unitLabel}`,
          ]),
        ],
      });

      blocks.push(
        note(
          "Statistical projection for scenario planning. Not an official BRSR filing. Explore reduction scenarios in the Carbon Reduction Simulator.",
          "info",
        ),
      );
      blocks.push(
        sourceBlock(
          unit,
          `${forecast.trainingWindow?.startPeriod} to ${forecast.predictions[forecast.predictions.length - 1]?.periodLabel}`,
        ),
      );

      return {
        data: {
          org_unit: unit.name,
          scope: scopeName,
          selected_model: forecast.modelName,
          cadence: forecast.assessment.detectedFrequency,
          validation_mape: forecast.validationMetrics?.mape,
          validation_mae: forecast.validationMetrics?.mae,
          baseline_mae: forecast.validationMetrics?.baselineMae,
          training_window: forecast.trainingWindow,
          backtest_window: forecast.backtestWindow,
          latest_observed: {
            period: lastObs.periodLabel,
            value: lastObs.valueTco2e,
            unit: unitLabel,
          },
          predictions: forecast.predictions.map((p) => ({
            period: p.periodLabel,
            predicted_value: p.predictedTco2e,
            ci80: p.confidenceInterval80,
            ci95: p.confidenceInterval95,
          })),
          disclaimer: "Statistical estimates only — not official BRSR figures.",
        },
        blocks,
        orgUnitIds: [unit.id],
      };
    },
  }),
};

export type ToolName = keyof typeof TOOLS;

/** Tools whose answers only an Admin may read, now or later in a saved conversation. */
export const ADMIN_TOOLS: ReadonlySet<string> = new Set(
  Object.entries(TOOLS as Record<string, Tool<z.ZodType>>)
    .filter(([, t]) => t.adminOnly)
    .map(([name]) => name),
);

/** The tool list in the provider's (OpenAI-style) format. */
export const toolSpecs = (isAdmin = false) =>
  Object.entries(TOOLS as Record<string, Tool<z.ZodType>>)
    .filter(([, t]) => isAdmin || !t.adminOnly)
    .map(([name, t]) => ({
      type: "function" as const,
      function: { name, description: t.description, parameters: z.toJSONSchema(t.schema) },
    }));

/** Models often send `null` for an argument they mean to leave out. */
const withoutNulls = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(withoutNulls)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([, v]) => v !== null)
            .map(([k, v]) => [k, withoutNulls(v)]),
        )
      : value;

export type ToolOutcome =
  | { ok: true; name: ToolName; args: unknown; result: ToolResult }
  | { ok: false; error: string; outOfScope?: boolean };

/**
 * Runs one tool call a model asked for. The name must be on the list and the arguments must pass the
 * tool's schema; anything else is refused with a message the model can read. Nothing a model sends is
 * ever executed or passed to the database as text.
 */
export async function runTool(
  name: string,
  rawArguments: string,
  ctx: ToolContext,
  onUnexpected: (error: unknown) => void = () => {},
): Promise<ToolOutcome> {
  // An Admin-only tool does not exist for anyone else, whatever a model asks for.
  if (!Object.hasOwn(TOOLS, name) || (ADMIN_TOOLS.has(name) && !ctx.admin))
    return { ok: false, error: `There is no tool called "${name.slice(0, 60)}".` };
  const t = TOOLS[name as ToolName] as Tool<z.ZodType>;
  let json: unknown;
  try {
    json = rawArguments.trim() ? JSON.parse(rawArguments) : {};
  } catch {
    return { ok: false, error: "The arguments were not valid JSON." };
  }
  const parsed = t.schema.safeParse(withoutNulls(json));
  if (!parsed.success) {
    const problems = parsed.error.issues
      .slice(0, 4)
      .map((i) => `${i.path.join(".") || "arguments"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Invalid arguments. ${problems}` };
  }
  try {
    return {
      ok: true,
      name: name as ToolName,
      args: parsed.data,
      result: await t.run(parsed.data, ctx),
    };
  } catch (error) {
    if (error instanceof ToolError)
      return { ok: false, error: error.message, outOfScope: error.kind === "out_of_scope" };
    onUnexpected(error);
    return { ok: false, error: "That lookup failed. Tell the person it could not be completed." };
  }
}
