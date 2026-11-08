// Policy and action suggestions from observed emission patterns (feature_enhancement.md 7.2, requirement 33;
// A47). Pure and deterministic: a reviewed list of rules picks the advice and states the figures that triggered
// it; the same data always gives the same suggestions. The AI service may reword a suggestion on request
// (lib/analytics/wording.ts), never choose it. Suggestions are decision support: nothing here changes a policy,
// a target or a record.
import { fyLabel } from "../factors/source-text.ts";
import {
  compare,
  fyMonth,
  monthsLabel,
  seriesByYear,
  type Comparison,
  type EmissionRow,
  type PeriodInfo,
  type ScopeCode,
} from "./trends.ts";

/** A family of activities that shares a remedy. */
export type ActivityGroup = {
  key: string;
  label: string;
  scopeCode: ScopeCode;
  matches: (metricCode: string) => boolean;
  /** Why this source matters, one sentence. */
  why: string;
  /** Practical actions, most direct first. */
  actions: string[];
  /** The policy a company usually adopts for it. */
  policy: string;
};

const starts =
  (...prefixes: string[]) =>
  (code: string) =>
    prefixes.some((p) => code.startsWith(p));
const oneOf =
  (...codes: string[]) =>
  (code: string) =>
    codes.includes(code);

export const GROUPS: ActivityGroup[] = [
  {
    key: "business_travel",
    label: "Business travel",
    scopeCode: "SCOPE_3",
    matches: starts("BUSINESS_TRAVEL_"),
    why: "Air travel has the highest emissions per passenger-kilometre of any mode recorded here.",
    actions: [
      "Review who travelled and why in the periods named; check whether meetings could have been held online.",
      "Require approval for flights on routes that rail covers in under eight hours.",
      "Book economy class and direct flights by default.",
    ],
    policy:
      "A travel policy that sets when travel is allowed, the preferred mode by distance and who approves it.",
  },
  {
    key: "grid_electricity",
    label: "Grid electricity",
    scopeCode: "SCOPE_2",
    matches: oneOf("GRID_ELECTRICITY"),
    why: "India's grid factor is high, so every kWh drawn from the grid carries a large emission.",
    actions: [
      "Commission an energy audit of the sites with the largest consumption.",
      "Replace old lighting, motors and pumps with efficient ones; check air-conditioning set points.",
      "Assess rooftop solar, a green open-access power purchase, or renewable energy certificates.",
    ],
    policy:
      "An energy management policy with a yearly consumption target per site (ISO 50001 is the usual frame).",
  },
  {
    key: "fuels",
    label: "Diesel, petrol and gas",
    scopeCode: "SCOPE_1",
    matches: oneOf(
      "DIESEL_CONSUMPTION",
      "PETROL_CONSUMPTION",
      "CNG_CONSUMPTION",
      "LPG_CONSUMPTION",
      "LNG_CONSUMPTION",
      "PNG_CONSUMPTION",
    ),
    why: "Fuel burnt in generators, vehicles and equipment is a direct emission the company controls.",
    actions: [
      "Check diesel generator run hours against grid outages; fix sites that run generators by habit.",
      "Service the vehicle fleet and equipment on schedule; track fuel used per kilometre or per hour.",
      "Plan electric or CNG replacements for vehicles at the end of their life.",
    ],
    policy: "A fleet and generator policy with fuel-efficiency targets and a replacement plan.",
  },
  {
    key: "coal",
    label: "Coal",
    scopeCode: "SCOPE_1",
    matches: starts("COAL_"),
    why: "Coal has the highest emission per unit of energy of the fuels recorded here.",
    actions: [
      "Review boiler and furnace efficiency and the coal grade bought.",
      "Assess part-replacement with biomass or a switch to gas or electricity for the process heat.",
    ],
    policy: "A fuel-switching plan with a date by which coal use falls by a set share.",
  },
  {
    key: "refrigerants",
    label: "Refrigerant and SF6 top-ups",
    scopeCode: "SCOPE_1",
    matches: (c) => c.startsWith("REFRIGERANT_") || c === "SF6_TOPUP",
    why: "A top-up replaces gas that leaked; these gases warm the climate hundreds to thousands of times more than CO2.",
    actions: [
      "Run a leak check on the equipment that was topped up in the periods named, and repair before refilling.",
      "Keep a log of each unit's charge and top-ups so repeat leakers are found.",
      "Choose lower-warming refrigerants when equipment is replaced.",
    ],
    policy: "A leak detection and repair programme with a log per unit.",
  },
  {
    key: "freight",
    label: "Freight and logistics",
    scopeCode: "SCOPE_3",
    matches: starts("FREIGHT_"),
    why: "Road freight emissions grow with distance and with part-empty trucks.",
    actions: [
      "Consolidate loads and review routes with the logistics providers.",
      "Move long-distance bulk loads to rail where a siding is available.",
      "Ask carriers for their fleet's fuel efficiency when renewing contracts.",
    ],
    policy:
      "A sustainable logistics clause in carrier contracts with a load-factor or emission target.",
  },
  {
    key: "commuting",
    label: "Employee commuting",
    scopeCode: "SCOPE_3",
    matches: starts("COMMUTING_"),
    why: "Commuting is spread over many people, so shared transport moves the figure most.",
    actions: [
      "Offer or extend shared buses for sites with many employees on the same routes.",
      "Allow remote or hybrid work where the role permits.",
    ],
    policy: "A commuting policy that favours shared and public transport.",
  },
  {
    key: "purchased_goods",
    label: "Cement and steel bought",
    scopeCode: "SCOPE_3",
    matches: oneOf("CEMENT_PURCHASED", "STEEL_PURCHASED"),
    why: "Cement and steel are among the most carbon-intensive materials a construction business buys.",
    actions: [
      "Specify blended cement (PPC or PSC) where the design allows.",
      "Ask steel suppliers for recycled content and their emission figures.",
      "Reduce over-ordering and wastage on site.",
    ],
    policy: "A low-carbon procurement policy that weighs a supplier's emissions in tenders.",
  },
  {
    key: "waste",
    label: "Waste disposed",
    scopeCode: "SCOPE_3",
    matches: oneOf("WASTE_DISPOSED"),
    why: "Waste sent to landfill or burnt adds emissions that recycling avoids.",
    actions: [
      "Segregate waste at source and send recyclables to authorised recyclers.",
      "Find the largest waste streams in the periods named and set a reduction target for each.",
    ],
    policy: "A waste management policy with a landfill-diversion target.",
  },
  {
    key: "process",
    label: "Process emissions",
    scopeCode: "SCOPE_1",
    matches: oneOf("PROCESS_CO2"),
    why: "Process emissions come from the chemistry of the process itself, not from fuel.",
    actions: [
      "Review the process with the plant engineers for yield, material and capture options.",
    ],
    policy: "A process-efficiency review once a year.",
  },
  {
    key: "steam_heat",
    label: "Purchased steam, heat and cooling",
    scopeCode: "SCOPE_2",
    matches: oneOf("PURCHASED_STEAM", "PURCHASED_HEAT_COOLING"),
    why: "Bought steam and heat carry the supplier's fuel emissions.",
    actions: [
      "Check for steam leaks and insulation losses.",
      "Ask the supplier for its emission factor and fuel mix.",
    ],
    policy: "An energy management policy covering purchased heat.",
  },
];

export const groupOf = (metricCode: string) => GROUPS.find((g) => g.matches(metricCode)) ?? null;

export type Trigger = "rising" | "spike" | "largest";

export type Recommendation = {
  /** The activity group's key: one suggestion per group, stable for the same data. */
  id: string;
  groupKey: string;
  groupLabel: string;
  scopeCode: ScopeCode;
  /** The leading finding. */
  trigger: Trigger;
  /** Every finding, in the order the reason states them. */
  triggers: Trigger[];
  priority: "high" | "medium" | "low";
  title: string;
  /** The finding, with its figures. */
  reason: string;
  why: string;
  actions: string[];
  policy: string;
  /** Things that make the finding less certain. */
  caveats: string[];
  evidence: {
    financialYear: number;
    metricCodes: string[];
    /** The periods behind the figures, oldest first, with tCO2e. */
    periods: { periodId: string; label: string; tco2e: number }[];
    current: number;
    previous: number | null;
    changePct: number | null;
    sharePct: number | null;
  };
};

/** An increase of at least this much, and of at least this many tonnes, is "rising". */
export const RISING_PCT = 20;
export const MIN_TONNES = 0.5;
/** A period at least this many times its usual level is a spike. */
export const SPIKE_RATIO = 1.5;
/** How many earlier months make up a month's usual level. */
export const SPIKE_WINDOW = 12;
/** A group at least this share of the year's total is the largest source worth acting on. */
export const LARGEST_SHARE_PCT = 40;

const t = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: n < 10 ? 2 : 1 });
const pctText = (n: number) => `${Math.round(Math.abs(n))}%`;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function recommend(input: {
  periods: PeriodInfo[];
  rows: EmissionRow[];
  /** Financial years whose data is complete (YearSummary.complete). */
  completeYears: Set<number>;
}): Recommendation[] {
  const { periods, rows, completeYears } = input;
  const byId = new Map(periods.map((p) => [p.id, p]));
  const grouped = rows.filter((r) => groupOf(r.metricCode));
  const series = seriesByYear(periods, grouped, (r) => ["TOTAL", groupOf(r.metricCode)!.key]);
  const years = [...series.keys()].sort((a, b) => a - b);
  if (years.length === 0) return [];
  const fy = years.at(-1)!;
  const prevFy = fy - 1;
  const both = completeYears.has(fy) && completeYears.has(prevFy);
  const totalNow = series.get(fy)?.get("TOTAL")?.total ?? 0;

  const out: Recommendation[] = [];
  for (const group of GROUPS) {
    const now = series.get(fy)?.get(group.key);
    if (!now || now.total <= 0) continue;
    const groupRows = grouped.filter((r) => group.matches(r.metricCode));
    const metricCodes = [...new Set(groupRows.map((r) => r.metricCode))].sort();
    const perPeriod = new Map<string, number>();
    for (const r of groupRows)
      if (r.approvedCount)
        perPeriod.set(r.periodId, (perPeriod.get(r.periodId) ?? 0) + r.approvedT);
    const periodList = [...perPeriod.entries()]
      .map(([id, v]) => ({ period: byId.get(id)!, tco2e: v }))
      .filter((p) => p.period)
      .sort((a, b) => a.period.startDate.localeCompare(b.period.startDate));
    const inYear = periodList.filter(
      (p) => p.period.startDate >= `${fy}-04-01` && p.period.startDate <= `${fy + 1}-03-31`,
    );
    const caveats: string[] = [];
    const inLatestYear = (periodId: string) => {
      const p = byId.get(periodId);
      return !!p && p.startDate >= `${fy}-04-01` && p.startDate <= `${fy + 1}-03-31`;
    };
    const pending = groupRows
      .filter((r) => inLatestYear(r.periodId))
      .reduce((a, r) => a + r.pendingCount + r.notCalculatedCount, 0);
    if (!completeYears.has(fy))
      caveats.push(`FY ${fyLabel(fy)} is not complete; the figures cover what is approved so far.`);
    if (pending)
      caveats.push(
        `${pending} ${group.label.toLowerCase()} record(s) awaiting approval or a factor are not counted.`,
      );
    const sharePct = totalNow > 0 ? (now.total / totalNow) * 100 : null;
    const base = {
      groupKey: group.key,
      groupLabel: group.label,
      scopeCode: group.scopeCode,
      why: group.why,
      actions: group.actions,
      policy: group.policy,
      caveats,
    };
    const evidencePeriods = (list: typeof periodList) =>
      list.map((p) => ({
        periodId: p.period.id,
        label: p.period.label,
        tco2e: Math.round(p.tco2e * 1000) / 1000,
      }));

    // One suggestion per group; its findings (rising, an unusually high month) are listed together.
    type Finding = {
      trigger: Trigger;
      priority: Recommendation["priority"];
      reason: string;
      periodIds: Set<string>;
      current: number;
      previous: number | null;
      changePct: number | null;
    };
    const findings: Finding[] = [];

    // Rising: the latest year against the one before, like for like.
    const c: Comparison = compare(now, series.get(prevFy)?.get(group.key), both);
    if (
      c.kind !== "none" &&
      c.previous > 0 &&
      c.changePct !== null &&
      c.changePct >= RISING_PCT &&
      c.current - c.previous >= MIN_TONNES
    ) {
      const span =
        c.kind === "full" ? "" : ` (${monthsLabel(c.months)}, the months both years have)`;
      findings.push({
        trigger: "rising",
        priority: c.changePct >= 50 ? "high" : "medium",
        reason:
          `${group.label} emissions were ${t(c.current)} tCO2e in FY ${fyLabel(fy)}${span}, ` +
          `up ${pctText(c.changePct)} from ${t(c.previous)} tCO2e in FY ${fyLabel(prevFy)}.`,
        // The periods of both years that the comparison used.
        periodIds: new Set(
          periodList
            .filter(
              (p) =>
                p.period.startDate >= `${prevFy}-04-01` &&
                p.period.startDate <= `${fy + 1}-03-31` &&
                (c.kind === "full" || c.months.includes(fyMonth(p.period.startDate))),
            )
            .map((p) => p.period.id),
        ),
        current: c.current,
        previous: c.previous,
        changePct: c.changePct,
      });
    }

    // Spike: a monthly period of the latest year far above the group's usual month, which is the median of the
    // (up to) 12 months with data just before it, so a lasting change a year ago does not read as a spike.
    const monthly = periodList.filter((p) => p.period.type === "monthly");
    let spike: { p: (typeof periodList)[number]; usual: number; before: typeof monthly } | null =
      null;
    for (const p of monthly.filter((m) => inYear.includes(m))) {
      const before = monthly
        .filter((o) => o.period.startDate < p.period.startDate)
        .slice(-SPIKE_WINDOW);
      if (before.length < 3) continue;
      const usual = median(before.map((o) => o.tco2e));
      // A lasting step up is "rising", not a spike: when the year has two or more months after it, the month
      // must stand out from those too.
      const after = monthly.filter(
        (o) => inYear.includes(o) && o.period.startDate > p.period.startDate,
      );
      if (after.length >= 2 && p.tco2e < median(after.map((o) => o.tco2e)) * SPIKE_RATIO) continue;
      if (
        usual > 0 &&
        p.tco2e >= usual * SPIKE_RATIO &&
        p.tco2e - usual >= MIN_TONNES &&
        (!spike || p.tco2e / usual > spike.p.tco2e / spike.usual)
      )
        spike = { p, usual, before };
    }
    if (spike) {
      const ratio = spike.p.tco2e / spike.usual;
      findings.push({
        trigger: "spike",
        priority: ratio >= 2 ? "high" : "medium",
        reason:
          `In ${spike.p.period.label} they were ${t(spike.p.tco2e)} tCO2e, ${ratio.toFixed(1)} times the usual ` +
          `month (median ${t(spike.usual)} tCO2e of the ${spike.before.length} months with data before it).`,
        periodIds: new Set([...spike.before, spike.p].map((p) => p.period.id)),
        current: spike.p.tco2e,
        previous: spike.usual,
        changePct: ((spike.p.tco2e - spike.usual) / spike.usual) * 100,
      });
    }

    // Largest source: worth a standing policy even when it is not growing.
    if (findings.length === 0 && sharePct !== null && sharePct >= LARGEST_SHARE_PCT) {
      findings.push({
        trigger: "largest",
        priority: "low",
        reason:
          `${group.label} made up ${pctText(sharePct)} of approved emissions in FY ${fyLabel(fy)} ` +
          `(${t(now.total)} of ${t(totalNow)} tCO2e).`,
        periodIds: new Set(inYear.map((p) => p.period.id)),
        current: now.total,
        previous: null,
        changePct: null,
      });
    }
    if (findings.length === 0) continue;

    const rising = findings.find((f) => f.trigger === "rising");
    const high = findings.find((f) => f.trigger === "spike");
    const lead = findings[0];
    const title = rising
      ? high
        ? `${group.label} emissions are rising, with an unusually high ${spike!.p.period.label}`
        : `${group.label} emissions are rising`
      : high
        ? `${group.label} emissions were unusually high in ${spike!.p.period.label}`
        : `${group.label} is the largest source`;
    const reason = findings
      .map((f, i) =>
        // A spike alone names the group itself; after a rising finding "they" reads on.
        i === 0 && f.trigger === "spike"
          ? f.reason.replace(/^In (.*?) they were/, `${group.label} emissions in $1 were`)
          : f.reason,
      )
      .join(" ");
    const ids = new Set(findings.flatMap((f) => [...f.periodIds]));
    const rank = { high: 0, medium: 1, low: 2 } as const;
    out.push({
      ...base,
      id: group.key,
      trigger: lead.trigger,
      triggers: findings.map((f) => f.trigger),
      priority: findings.reduce(
        (best, f) => (rank[f.priority] < rank[best] ? f.priority : best),
        lead.priority,
      ),
      title,
      reason,
      evidence: {
        financialYear: fy,
        metricCodes,
        periods: evidencePeriods(periodList.filter((p) => ids.has(p.period.id))),
        current: lead.current,
        previous: lead.previous,
        changePct: lead.changePct,
        sharePct,
      },
    });
  }
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return out.sort(
    (a, b) => rank[a.priority] - rank[b.priority] || b.evidence.current - a.evidence.current,
  );
}
