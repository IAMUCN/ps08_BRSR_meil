// The BRSR Core, GHG inventory and executive summary layouts (feature_enhancement.md 8.1; D52, A48). Pure, like
// html.ts: they render the frozen snapshot, escape every value and load nothing. The tables they share with the
// full BRSR report are the same functions, so a figure reads the same in every template.
import {
  childrenTable,
  escapeHtml,
  ghgTable,
  indicatorBlock,
  indicatorOf,
  methodology,
  NONE,
  num,
  quantityCell,
  renderReportHtml,
  reportPage,
  row,
  scope3Table,
  scopeTonnes,
  sebiTable,
  tonnes,
  yearsOf,
  type Year,
} from "./html.ts";
import type { ReportedIndicator, Snapshot } from "./snapshot.ts";
import {
  BRSR_CORE,
  TEMPLATE_INFO,
  type ActivityEmission,
  type ReportTemplate,
} from "./templates.ts";

const SCOPES = [
  ["SCOPE_1", "Scope 1"],
  ["SCOPE_2", "Scope 2"],
  ["SCOPE_3", "Scope 3"],
] as const;

const TEMPLATE_STYLE = `
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6pt; margin: 6pt 0; }
  .tile { border: 1px solid #ddd; padding: 6pt; break-inside: avoid; }
  .tile .label { color: #555; font-size: 8.5pt; }
  .tile .value { font-family: Consolas, monospace; font-size: 14pt; margin: 2pt 0; }
  .tile .change { font-size: 8.5pt; color: #444; }
  .badge { display: inline-block; white-space: nowrap; border: 1px solid #bbb; padding: 0 4pt; font-size: 8pt; border-radius: 2pt; }
  .badge.evidence { border-color: #2e7d32; color: #2e7d32; }
  .badge.typed { border-color: #8a6d00; color: #8a6d00; }
  ul.compact { margin: 2pt 0 6pt 14pt; padding: 0; }
  ul.compact li { margin: 0 0 3pt; }
`;

/** A template body inside the shared frame, with the template's own few styles. */
function page(s: Snapshot, template: ReportTemplate, body: string, footer: string) {
  return reportPage(s, {
    title: TEMPLATE_INFO[template].title,
    body: `<style>${TEMPLATE_STYLE}</style>${body}`,
    footer,
  });
}

const FOOTER =
  "Every value is consolidated from verified, validated and approved source documents, and can be traced to " +
  "its original document from the report's page in EmeilSG.";

/** The year table every template starts from: Scope 1, 2, 3 and their total, in tCO2e. */
function scopeSummary(years: Year[]) {
  const total = (y: Year) => {
    const parts = SCOPES.map(([c]) => scopeTonnes(y, c));
    return parts.every((p) => p === null) ? null : parts.reduce<number>((a, p) => a + (p ?? 0), 0);
  };
  return sebiTable(
    years,
    SCOPES.map(([code, name]) =>
      row(
        name,
        "Metric tonnes of CO2 equivalent",
        years.map((y) => quantityCell(scopeTonnes(y, code))),
      ),
    ).join("") +
      row(
        "Total (Scope 1 + 2 + 3)",
        "Metric tonnes of CO2 equivalent",
        years.map((y) => quantityCell(total(y))),
      ),
  );
}

// --- BRSR Core ---------------------------------------------------------------------------------------------

/** Whether a question has something to print: an approved figure, or a written answer. */
function reported(i: ReportedIndicator | undefined) {
  if (!i) return false;
  if (i.kind === "statement") return !!i.answer?.trim();
  return i.metrics.some((m) => m.figures.some((f) => f.value !== null));
}

export function renderCoreHtml(s: Snapshot): string {
  const years = yearsOf(s);
  const current = years[0];
  const overview = `<table><thead><tr><th>BRSR Core attribute</th><th>KPI</th><th>Question</th><th>Source</th>
    <th>${escapeHtml(current.label)}</th></tr></thead><tbody>${BRSR_CORE.map((k) => {
      const i = indicatorOf(current, k.code);
      return `<tr><td>${escapeHtml(k.attribute)}</td><td>${escapeHtml(k.kpi)}</td>
        <td><span class="code">${escapeHtml(k.code)}</span></td>
        <td><span class="badge ${k.source}">${k.source === "evidence" ? "Evidence-backed" : "Typed by the entity"}</span></td>
        <td>${reported(i) ? "Reported" : '<span class="none">Not reported</span>'}</td></tr>`;
    }).join("")}</tbody></table>`;
  const codes = [...new Set(BRSR_CORE.map((k) => k.code))];
  const blocks = codes
    .map((code) => {
      const i = indicatorOf(current, code);
      return i
        ? indicatorBlock(i, years)
        : `<p class="none">${escapeHtml(code)} is not in this report's question set.</p>`;
    })
    .join("");
  const evidence = BRSR_CORE.filter((k) => k.source === "evidence").length;
  return page(
    s,
    "brsr_core",
    `
  <h2>BRSR Core KPIs at a glance</h2>
  <p class="note">SEBI's BRSR Core is the set of KPIs that listed entities have assured. ${evidence} of the
  ${BRSR_CORE.length} KPIs below are calculated from approved, evidence-backed records; the others are written by
  the entity on BRSR Disclosures and carry no document trail.</p>
  ${overview}
  <h2>Greenhouse gas emissions summary</h2>
  ${scopeSummary(years)}
  <h2>The BRSR Core questions</h2>
  ${blocks}
  ${methodology(s, years)}`,
    `${FOOTER} Question numbering and wording follow SEBI's BRSR format.`,
  );
}

// --- GHG inventory -----------------------------------------------------------------------------------------

function activityTable(s: Snapshot, years: Year[]) {
  const now = s.extras?.activities ?? [];
  const before = s.extras?.previousActivities ?? [];
  if (!now.length && !before.length)
    return '<p class="none">No approved emission records for this report.</p>';
  const keys = [...new Map([...now, ...before].map((a) => [a.metricCode, a])).values()];
  const of = (list: ActivityEmission[], code: string) => list.find((a) => a.metricCode === code);
  const order = (code: string) => SCOPES.findIndex(([c]) => c === code);
  keys.sort(
    (a, b) =>
      order(a.scopeCode) - order(b.scopeCode) ||
      a.categoryName.localeCompare(b.categoryName) ||
      (of(now, b.metricCode)?.tco2e ?? 0) - (of(now, a.metricCode)?.tco2e ?? 0),
  );
  const prev = years.length > 1;
  return `<table><thead><tr><th>Scope</th><th>Category</th><th>Activity</th>
    <th class="num">${escapeHtml(years[0].label)}</th>${prev ? `<th class="num">${escapeHtml(years[1].label)}</th>` : ""}
    <th class="num">Records</th></tr></thead><tbody>${keys
      .map((a) => {
        const n = of(now, a.metricCode);
        const b = of(before, a.metricCode);
        return `<tr><td>${escapeHtml(SCOPES.find(([c]) => c === a.scopeCode)?.[1] ?? a.scopeCode)}</td>
          <td>${escapeHtml(a.categoryName)}</td><td>${escapeHtml(a.metricName)}</td>
          <td class="num">${n ? escapeHtml(num(n.tco2e, 3)) : NONE}</td>
          ${prev ? `<td class="num">${b ? escapeHtml(num(b.tco2e, 3)) : NONE}</td>` : ""}
          <td class="num">${n?.records ?? 0}</td></tr>`;
      })
      .join("")}</tbody></table>`;
}

export function renderGhgHtml(s: Snapshot): string {
  const years = yearsOf(s);
  return page(
    s,
    "ghg",
    `
  <h2>Emissions by scope</h2>
  ${scopeSummary(years)}
  <h2>Scope 1 and Scope 2 (SEBI P6-E7)</h2>
  ${ghgTable(years)}
  <h2>Scope 3 (SEBI P6-L2)</h2>
  ${scope3Table(years)}
  <h2>Emissions by activity</h2>
  <p class="note">Metric tonnes of CO2 equivalent from approved, calculated records. Records awaiting approval or
  a conversion factor are not included.</p>
  ${activityTable(s, years)}
  ${childrenTable(s)}
  ${methodology(s, years)}`,
    `${FOOTER} Prepared on the GHG Protocol's scope definitions with India-specific factors where they exist; the
    factors table names each source.`,
  );
}

// --- Executive summary -------------------------------------------------------------------------------------

function tile(
  label: string,
  value: number | null,
  unit: string,
  before: number | null,
  beforeLabel?: string,
) {
  const change =
    value !== null && before !== null && before !== 0
      ? `${value >= before ? "▲ +" : "▼ "}${num(((value - before) / before) * 100, 0)}% on ${escapeHtml(beforeLabel ?? "")}`
      : before === null
        ? ""
        : `${escapeHtml(beforeLabel ?? "")}: ${escapeHtml(num(before, 2))}`;
  return `<div class="tile"><div class="label">${escapeHtml(label)}</div>
    <div class="value">${value === null ? "—" : escapeHtml(num(value, value < 100 ? 2 : 0))}</div>
    <div class="change">${escapeHtml(unit)}${change ? ` · ${change}` : ""}</div></div>`;
}

/** Water from P6-E3's metrics, in kilolitres (m³ and KL are the same volume). */
function waterKl(y: Year): number | null {
  const figures = indicatorOf(y, "P6-E3")?.metrics.flatMap((m) => m.figures) ?? [];
  let total: number | null = null;
  for (const f of figures) {
    if (f.value === null) continue;
    if (/^(kl|m3|m³)$/i.test(f.unit.trim())) total = (total ?? 0) + f.value;
  }
  return total;
}

function ltifr(y: Year): number | null {
  const rows = y.breakups?.safety ?? [];
  const hours = rows.reduce((a, r) => a + r.personHours, 0);
  if (!hours) return null;
  return (rows.reduce((a, r) => a + r.lostTimeInjuries, 0) / hours) * 1_000_000;
}

export function renderSummaryHtml(s: Snapshot): string {
  const years = yearsOf(s);
  const [now, before] = years;
  const total = (y: Year | undefined) => {
    if (!y) return null;
    const parts = SCOPES.map(([c]) => scopeTonnes(y, c));
    return parts.every((p) => p === null) ? null : parts.reduce<number>((a, p) => a + (p ?? 0), 0);
  };
  const waste = (y: Year | undefined) =>
    y
      ? tonnes(
          indicatorOf(y, "P6-E9")?.metrics.flatMap((m) => m.figures),
          "",
        )
      : null;
  const tiles = `<div class="tiles">
    ${tile("Total emissions", total(now), "tCO2e", total(before), before?.label)}
    ${SCOPES.map(([c, name]) => tile(name, scopeTonnes(now, c), "tCO2e", before ? scopeTonnes(before, c) : null, before?.label)).join("")}
    ${tile("Water consumed", waterKl(now), "KL", before ? waterKl(before) : null, before?.label)}
    ${tile("Waste generated", waste(now), "tonnes", waste(before), before?.label)}
    ${tile("Lost time injury frequency rate", ltifr(now), "per million hours", before ? ltifr(before) : null, before?.label)}
    ${tile("Records left out (awaiting approval)", s.excludedAwaitingApproval, "records", null)}
  </div>`;
  const a = s.extras?.analytics;
  const trend = a?.years.length
    ? `<table><thead><tr><th>Financial year</th>${SCOPES.map(([, n]) => `<th class="num">${n}</th>`).join("")}
        <th class="num">Total</th><th>Data</th></tr></thead><tbody>${a.years
          .map(
            (
              y,
            ) => `<tr><td>${escapeHtml(y.label)}</td>${SCOPES.map(([c]) => `<td class="num">${escapeHtml(num(y.byScope[c], 2))}</td>`).join("")}
              <td class="num">${escapeHtml(num(y.total, 2))}</td>
              <td>${y.complete ? "Complete" : `Partial — ${escapeHtml(y.notes[0] ?? "")}`}</td></tr>`,
          )
          .join("")}</tbody></table>`
    : '<p class="none">No approved emission records yet.</p>';
  const alerts = a?.alerts.length
    ? `<ul class="compact">${a.alerts
        .slice(0, 10)
        .map(
          (x) =>
            `<li><strong>${escapeHtml(x.orgUnitName)}, ${escapeHtml(x.periodLabel)}, ${escapeHtml(x.scopeCode.replace("SCOPE_", "Scope "))}:</strong>
             ${escapeHtml(num(x.measuredT, 2))} tCO2e against an expected ${escapeHtml(num(x.baselineT, 2))}
             (threshold +${escapeHtml(num(x.thresholdPct, 0))}%).</li>`,
        )
        .join(
          "",
        )}</ul>${a.alerts.length > 10 ? `<p class="note">and ${a.alerts.length - 10} more on Carbon Analytics.</p>` : ""}`
    : '<p class="none">No open emission alerts.</p>';
  const actions = a?.recommendations.length
    ? `<ul class="compact">${a.recommendations
        .slice(0, 5)
        .map(
          (r) =>
            `<li><strong>${escapeHtml(r.title)}</strong> (${escapeHtml(r.priority)} priority). ${escapeHtml(r.reason)}
             <br><span class="note">Policy to consider: ${escapeHtml(r.policy)}</span></li>`,
        )
        .join("")}</ul>`
    : '<p class="none">Nothing stands out in the approved data.</p>';
  return page(
    s,
    "summary",
    `
  <h2>Headline figures</h2>
  ${tiles}
  <h2>Emissions by financial year</h2>
  <p class="note">Approved records only, for this org unit and everything beneath it, as on the day the summary was
  generated.</p>
  ${trend}
  ${childrenTable(s)}
  <h2>Open emission alerts</h2>
  ${alerts}
  <h2>Suggested actions</h2>
  <p class="note">Decision support from fixed rules on the approved figures; nothing has been changed.</p>
  ${actions}`,
    `${FOOTER} The full figures, factors and methodology are in the BRSR and GHG inventory reports.`,
  );
}

/** The PDF's HTML for a run's template. */
export function renderTemplateHtml(s: Snapshot, template: ReportTemplate = "brsr"): string {
  switch (template) {
    case "brsr_core":
      return renderCoreHtml(s);
    case "ghg":
      return renderGhgHtml(s);
    case "summary":
      return renderSummaryHtml(s);
    default:
      return renderReportHtml(s);
  }
}
