// The BRSR report as a self-contained HTML document (TRD §17: server-rendered HTML → PDF). Pure — renders a
// frozen snapshot, escapes every value, loads nothing from the network — so what the PDF says is exactly
// what the snapshot holds. The greenhouse gas, waste and Scope 3 indicators are laid out as SEBI's July-2023
// BRSR format prints them (current and previous financial year, metric tonnes, intensity rows, the assurance
// note); every other indicator gets the same two year columns (.grill/audit-p0-decisions.md).
import { formatQuantity } from "../calculation/trace.ts";
import { intensity, pppRevenueMnUsd, type FyInputs } from "./inputs.ts";
import type {
  ReportedIndicator,
  ReportedMetric,
  ReportedSection,
  ScopeTotal,
  Snapshot,
} from "./snapshot.ts";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

type Figures = { unit: string; value: number | null }[];

/** One column of a SEBI table: the reported year, or the year before it. */
type Year = {
  label: string;
  scopes: ScopeTotal[];
  sections: ReportedSection[];
  /** Null for a single-period report: turnover is annual, so intensity is not shown for part of a year. */
  inputs: FyInputs | null;
};

const NONE = '<span class="none">No approved data</span>';
const NOT_PROVIDED = '<span class="none">Not provided</span>';
const FULL_YEAR_ONLY = '<span class="none">Financial-year reports only</span>';

const num = (value: number, maximumFractionDigits = 2) =>
  value.toLocaleString("en-IN", { maximumFractionDigits });
const significant = (value: number) =>
  value.toLocaleString("en-IN", { maximumSignificantDigits: 3 });

/**
 * A value in the unit BRSR asks for: kilograms and kgCO2e are shown as metric tonnes. 1 t = 1000 kg is
 * arithmetic, not an emission factor, so the stored result is untouched and only the reading changes.
 */
export function figure(value: number, unit: string) {
  const u = unit.trim();
  return /^kg(co2e)?$/i.test(u) ? `${num(value / 1000, 3)} t${u.slice(2)}` : `${num(value)} ${u}`;
}

const figureText = (figures: Figures | undefined) =>
  !figures?.length
    ? NONE
    : figures
        .map((f) => (f.value === null ? "—" : escapeHtml(figure(f.value, f.unit))))
        .join("<br>");

/** The figures in kg<suffix> or t<suffix> as one total in metric tonnes; null when there are none. */
function tonnes(figures: Figures | undefined, suffix: "" | "co2e"): number | null {
  let total: number | null = null;
  for (const f of figures ?? []) {
    const unit = f.unit.trim().toLowerCase();
    const perTonne = unit === `kg${suffix}` ? 1000 : unit === `t${suffix}` ? 1 : null;
    if (f.value !== null && perTonne) total = (total ?? 0) + f.value / perTonne;
  }
  return total;
}

const add = (a: number | null, b: number | null) =>
  a === null && b === null ? null : (a ?? 0) + (b ?? 0);

const yearsOf = (s: Snapshot): Year[] => [
  {
    label: s.coverage.label,
    scopes: s.scopes,
    sections: s.sections,
    inputs: s.inputs?.current ?? null,
  },
  ...(s.previous
    ? [
        {
          label: s.previous.label,
          scopes: s.previous.scopes,
          sections: s.previous.sections,
          inputs: s.inputs?.previous ?? null,
        },
      ]
    : []),
];

const scopeTonnes = (y: Year, code: string) =>
  tonnes(y.scopes.find((sc) => sc.code === code)?.figures, "co2e");
const indicatorOf = (y: Year, code: string) =>
  y.sections.flatMap((x) => x.indicators).find((i) => i.code === code);

const yearHeads = (years: Year[]) =>
  years.map((y) => `<th class="num">${escapeHtml(y.label)}</th>`).join("");
const row = (parameter: string, unit: string, cells: string[]) =>
  `<tr><td>${escapeHtml(parameter)}</td><td>${escapeHtml(unit)}</td>${cells
    .map((c) => `<td class="num">${c}</td>`)
    .join("")}</tr>`;
const quantityCell = (value: number | null) => (value === null ? NONE : escapeHtml(num(value, 3)));

function intensityCell(quantity: number | null, y: Year, per: (i: FyInputs) => number | null) {
  if (!y.inputs) return FULL_YEAR_ONLY;
  if (quantity === null) return NONE;
  const value = intensity(quantity, per(y.inputs));
  return value === null ? NOT_PROVIDED : escapeHtml(significant(value));
}

const perTurnover = (i: FyInputs) => i.turnoverCr;
const perPpp = (i: FyInputs) =>
  i.turnoverCr !== null && i.pppRate ? pppRevenueMnUsd(i.turnoverCr, i.pppRate) : null;
const perOutput = (i: FyInputs) => i.physicalOutput;

/** SEBI's three intensity rows for a quantity: per rupee of turnover, PPP-adjusted, per physical output. */
function intensityRows(what: string, unit: string, years: Year[], of: (y: Year) => number | null) {
  const output = years[0].inputs?.physicalOutputUnit ?? "unit of physical output";
  return [
    row(
      `${what} per rupee of turnover (${what} / Revenue from operations)`,
      `${unit} / ₹ crore`,
      years.map((y) => intensityCell(of(y), y, perTurnover)),
    ),
    row(
      `${what} intensity per rupee of turnover adjusted for Purchasing Power Parity (PPP) (${what} / Revenue from operations adjusted for PPP)`,
      `${unit} / PPP million USD`,
      years.map((y) => intensityCell(of(y), y, perPpp)),
    ),
    row(
      `${what} intensity in terms of physical output`,
      `${unit} / ${output}`,
      years.map((y) => intensityCell(of(y), y, perOutput)),
    ),
  ].join("");
}

const sebiTable = (years: Year[], rows: string) =>
  `<table><thead><tr><th>Parameter</th><th>Unit</th>${yearHeads(years)}</tr></thead><tbody>${rows}</tbody></table>`;

// Principle 6, Essential Indicator 7.
function ghgTable(years: Year[]) {
  const scope12 = (y: Year) => add(scopeTonnes(y, "SCOPE_1"), scopeTonnes(y, "SCOPE_2"));
  return sebiTable(
    years,
    row(
      "Total Scope 1 emissions (Break-up of the GHG into CO2, CH4, N2O, HFCs, PFCs, SF6, NF3, if available)",
      "Metric tonnes of CO2 equivalent",
      years.map((y) => quantityCell(scopeTonnes(y, "SCOPE_1"))),
    ) +
      row(
        "Total Scope 2 emissions (Break-up of the GHG into CO2, CH4, N2O, HFCs, PFCs, SF6, NF3, if available)",
        "Metric tonnes of CO2 equivalent",
        years.map((y) => quantityCell(scopeTonnes(y, "SCOPE_2"))),
      ) +
      intensityRows("Total Scope 1 and Scope 2 emissions", "tCO2e", years, scope12),
  );
}

// Principle 6, Leadership Indicator 2.
function scope3Table(years: Year[]) {
  const scope3 = (y: Year) => scopeTonnes(y, "SCOPE_3");
  return sebiTable(
    years,
    row(
      "Total Scope 3 emissions (Break-up of the GHG into CO2, CH4, N2O, HFCs, PFCs, SF6, NF3, if available)",
      "Metric tonnes of CO2 equivalent",
      years.map((y) => quantityCell(scope3(y))),
    ) +
      row(
        "Total Scope 3 emissions per rupee of turnover",
        "tCO2e / ₹ crore",
        years.map((y) => intensityCell(scope3(y), y, perTurnover)),
      ),
  );
}

// Principle 6, Essential Indicator 9. TraceESG holds the quantity on each disposal certificate; the break-up
// by waste category and the recovered quantities are not captured, and the table says so rather than
// leaving a blank that reads as zero.
function wasteTable(years: Year[], code: string) {
  const disposed = (y: Year) =>
    tonnes(
      indicatorOf(y, code)?.metrics.flatMap((m) => m.figures),
      "",
    );
  const notCaptured = years.map(() => '<span class="none">Not captured</span>');
  return sebiTable(
    years,
    row("Total waste generated, by category (A to H)", "Metric tonnes", notCaptured) +
      row(
        "Total waste disposed, from disposal certificates (incineration, landfilling and other disposal operations)",
        "Metric tonnes",
        years.map((y) => quantityCell(disposed(y))),
      ) +
      intensityRows("Total waste disposed", "t", years, disposed) +
      row(
        "Total waste recovered through recycling, re-using or other recovery operations",
        "Metric tonnes",
        notCaptured,
      ),
  );
}

const SEBI_TABLES: Partial<Record<string, (years: Year[], code: string) => string>> = {
  "P6-E7": ghgTable,
  "P6-E9": wasteTable,
  "P6-L2": scope3Table,
};

function metricRow(m: ReportedMetric, code: string, years: Year[]) {
  // The counts behind a percentage — only when there is a percentage to explain.
  const basis =
    m.basis && m.figures.length
      ? `<div class="basis">${escapeHtml(m.basis.partLabel)} ${escapeHtml(
          formatQuantity(m.basis.part, ""),
        ).trim()} of ${escapeHtml(m.basis.wholeLabel)} ${escapeHtml(
          formatQuantity(m.basis.whole, ""),
        ).trim()}</div>`
      : "";
  const before = years
    .slice(1)
    .map(
      (y) =>
        `<td class="num">${figureText(
          indicatorOf(y, code)?.metrics.find((x) => x.metricId === m.metricId)?.figures,
        )}</td>`,
    )
    .join("");
  return `<tr>
    <td>${escapeHtml(m.name)}${m.notes ? `<div class="note">${escapeHtml(m.notes)}</div>` : ""}</td>
    <td class="num">${figureText(m.figures)}${basis}</td>${before}
    <td class="num">${m.records.length}</td>
  </tr>`;
}

function indicatorBlock(i: ReportedIndicator, years: Year[]) {
  const sebi = SEBI_TABLES[i.code];
  const assurance = years[0].inputs
    ? `<p class="note">Note: independent assessment / evaluation / assurance by an external agency — ${
        years[0].inputs.assurance ? escapeHtml(years[0].inputs.assurance) : "Not provided"
      }</p>`
    : "";
  const metrics = i.metrics.length
    ? `<table><thead><tr><th>${sebi ? "Contributing ESG metric" : "ESG metric"}</th>${yearHeads(
        years,
      )}<th class="num">Records</th></tr></thead>
       <tbody>${i.metrics.map((m) => metricRow(m, i.code, years)).join("")}</tbody></table>`
    : '<p class="none">No metric is mapped to this indicator.</p>';
  return `
    <div class="indicator">
      <h3><span class="code">${escapeHtml(i.code)}</span>${
        i.indicatorType ? `<span class="type">${escapeHtml(i.indicatorType)}</span>` : ""
      }</h3>
      <p class="question">${escapeHtml(i.questionText)}</p>
      ${sebi ? sebi(years, i.code) + assurance : ""}
      ${metrics}
    </div>`;
}

function methodology(s: Snapshot, years: Year[]) {
  const factors = s.factors.length
    ? `<table><thead><tr><th>Factor</th><th class="num">Value</th><th>Source</th><th>Geography</th><th>Effective</th><th class="num">Records</th></tr></thead><tbody>${s.factors
        .map(
          (f) => `<tr>
            <td>${escapeHtml(f.name)} <span class="note">v${f.version}</span></td>
            <td class="num">${
              f.value === null ? "—" : escapeHtml(num(f.value, 6))
            } ${escapeHtml(f.outputUnit)} / ${escapeHtml(f.inputUnit)}</td>
            <td class="wrap">${escapeHtml(f.source)}</td>
            <td>${f.geography ? escapeHtml(f.geography) : '<span class="none">Not stated</span>'}</td>
            <td>${escapeHtml(f.effectiveFrom)} to ${escapeHtml(f.effectiveTo ?? "date")}</td>
            <td class="num">${f.records}</td>
          </tr>`,
        )
        .join("")}</tbody></table>`
    : '<p class="none">No conversion factor was used by the reported records.</p>';
  const input = (value: number | null | undefined, digits: number) =>
    value === null || value === undefined ? NOT_PROVIDED : escapeHtml(num(value, digits));
  const inputs = s.inputs
    ? sebiTable(
        years,
        row(
          "Revenue from operations",
          "₹ crore",
          years.map((y) => input(y.inputs?.turnoverCr, 2)),
        ) +
          row(
            "Purchasing Power Parity conversion rate",
            "₹ per international dollar",
            years.map((y) => input(y.inputs?.pppRate, 3)),
          ) +
          row(
            "Physical output",
            years[0].inputs?.physicalOutputUnit ?? "—",
            years.map((y) => input(y.inputs?.physicalOutput, 2)),
          ),
      )
    : '<p class="none">Intensity is reported for a full financial year only; this report covers one period.</p>';
  const note = s.inputs?.current.methodologyNote;
  return `
    <h2>Methodology, boundary and assurance</h2>
    <p><strong>Reporting boundary.</strong> ${escapeHtml(s.org.path.join(" › "))} and every org unit beneath
    it recorded in TraceESG (${s.orgUnitCount} org unit${s.orgUnitCount === 1 ? "" : "s"}), for
    ${escapeHtml(s.coverage.label)}. Only records that were verified, validated and approved are included.</p>
    <p><strong>Method.</strong> Emissions = verified activity data × emission factor, calculated record by
    record with the conversion factor version in force for the record's reporting period. Kilograms are shown
    as metric tonnes (÷ 1,000). Percentages are derived from summed counts, never averaged.</p>
    <p><strong>Emission factors and global warming potentials.</strong> These are the factors the reported
    calculations used. Gases other than CO2 are included only as far as each factor's source includes them,
    with the global warming potentials that source applies.</p>
    ${factors}
    <p><strong>Intensity.</strong> Per rupee of turnover = quantity ÷ revenue from operations. Adjusted for
    PPP = quantity ÷ (revenue from operations ÷ PPP conversion rate), in million international dollars. The
    figures used:</p>
    ${inputs}
    <p><strong>Assurance.</strong> ${
      s.inputs?.current.assurance ? escapeHtml(s.inputs.current.assurance) : "Not provided."
    }</p>
    ${note ? `<p><strong>Entity's note.</strong> ${escapeHtml(note)}</p>` : ""}`;
}

export function renderReportHtml(s: Snapshot): string {
  const generated = new Date(s.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const years = yearsOf(s);
  const scopes = s.scopes
    .map((sc) =>
      row(
        sc.name,
        "Metric tonnes of CO2 equivalent",
        years.map((y) => quantityCell(scopeTonnes(y, sc.code))),
      ),
    )
    .join("");
  const sections = s.sections
    .map(
      (section) => `
      <h2>Section ${escapeHtml(section.code)} — ${escapeHtml(section.name)}</h2>
      ${section.indicators.map((i) => indicatorBlock(i, years)).join("")}`,
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>BRSR Report — ${escapeHtml(s.org.name)} — ${escapeHtml(s.coverage.label)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10pt; color: #1f1f1f; }
  h1 { font-size: 18pt; color: #ca2851; margin: 0 0 4pt; }
  h2 { font-size: 12pt; color: #ca2851; border-bottom: 1px solid #ca2851; padding-bottom: 2pt; margin-top: 18pt; }
  h3 { font-size: 10pt; margin: 10pt 0 2pt; }
  h2, h3 { break-after: avoid; }
  .code { border: 1px solid #ff6766; padding: 0 4pt; font-family: Consolas, monospace; }
  .type { margin-left: 6pt; font-weight: normal; color: #666; text-transform: capitalize; }
  .question { margin: 0 0 4pt; color: #444; }
  .meta { color: #555; margin: 0 0 2pt; }
  table { width: 100%; border-collapse: collapse; margin: 4pt 0; }
  th, td { border: 1px solid #ddd; padding: 3pt 5pt; text-align: left; vertical-align: top; }
  th { background: #f6f6f6; font-weight: 600; }
  .num { text-align: right; font-family: Consolas, monospace; white-space: nowrap; }
  .wrap { overflow-wrap: anywhere; }
  .note, .basis { color: #666; font-size: 8.5pt; font-family: "Segoe UI", Arial, sans-serif; white-space: normal; }
  .none { color: #888; font-style: italic; font-family: "Segoe UI", Arial, sans-serif; }
  .indicator { break-inside: avoid; }
  .footer { margin-top: 20pt; color: #666; font-size: 8.5pt; }
</style></head>
<body>
  <h1>BRSR Report</h1>
  <p class="meta"><strong>${escapeHtml(s.org.path.join(" › "))}</strong> · ${escapeHtml(s.coverage.label)}</p>
  <p class="meta">Generated ${escapeHtml(generated)} IST by TraceESG. Approved records only${
    s.excludedAwaitingApproval
      ? ` — ${s.excludedAwaitingApproval} record(s) still awaiting approval are not included`
      : ""
  }.</p>
  <h2>Greenhouse gas emissions summary</h2>
  ${sebiTable(years, scopes)}
  ${sections}
  ${methodology(s, years)}
  <p class="footer">Every value is consolidated from verified, validated and approved source documents.
  Indicator numbering and wording follow SEBI's BRSR format as updated in July 2023. Each value can be
  traced to its original document from the report's page in TraceESG.</p>
</body></html>`;
}
