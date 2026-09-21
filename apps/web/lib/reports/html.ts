// The BRSR report as a self-contained HTML document (TRD §17: server-rendered HTML → PDF). Pure — renders a
// frozen snapshot, escapes every value, loads nothing from the network — so what the PDF says is exactly
// what the snapshot holds.
import { formatQuantity } from "../calculation/trace.ts";
import { formatTotal } from "../scope/display.ts";
import type { ReportedMetric, Snapshot } from "./snapshot.ts";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

const figureText = (figures: { unit: string; value: number | null }[]) =>
  figures.length === 0
    ? '<span class="none">No approved data</span>'
    : figures
        .map((f) => (f.value === null ? "—" : escapeHtml(figure(f.value, f.unit))))
        .join("<br>");

/** Two decimals; kilogram units also show the tonne figure, as the scope dashboards do. */
export const figure = (value: number, unit: string) => formatTotal(value, unit);

function metricRow(m: ReportedMetric) {
  // The counts behind a percentage — only when there is a percentage to explain.
  const basis =
    m.basis && m.figures.length
      ? `<div class="basis">${escapeHtml(m.basis.partLabel)} ${escapeHtml(
          formatQuantity(m.basis.part, ""),
        ).trim()} of ${escapeHtml(m.basis.wholeLabel)} ${escapeHtml(
          formatQuantity(m.basis.whole, ""),
        ).trim()}</div>`
      : "";
  return `<tr>
    <td>${escapeHtml(m.name)}${m.notes ? `<div class="note">${escapeHtml(m.notes)}</div>` : ""}</td>
    <td class="num">${figureText(m.figures)}${basis}</td>
    <td class="num">${m.records.length}</td>
  </tr>`;
}

export function renderReportHtml(s: Snapshot): string {
  const generated = new Date(s.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const scopes = s.scopes
    .map(
      (sc) =>
        `<tr><td>${escapeHtml(sc.name)}</td><td class="num">${figureText(sc.figures)}</td></tr>`,
    )
    .join("");
  const sections = s.sections
    .map(
      (section) => `
      <h2>Section ${escapeHtml(section.code)} — ${escapeHtml(section.name)}</h2>
      ${section.indicators
        .map(
          (i) => `
        <div class="indicator">
          <h3><span class="code">${escapeHtml(i.code)}</span>${
            i.indicatorType ? `<span class="type">${escapeHtml(i.indicatorType)}</span>` : ""
          }</h3>
          <p class="question">${escapeHtml(i.questionText)}</p>
          ${
            i.metrics.length
              ? `<table><thead><tr><th>ESG metric</th><th class="num">Reported value</th><th class="num">Records</th></tr></thead>
                 <tbody>${i.metrics.map(metricRow).join("")}</tbody></table>`
              : '<p class="none">No metric is mapped to this indicator.</p>'
          }
        </div>`,
        )
        .join("")}`,
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
  .code { border: 1px solid #ff6766; padding: 0 4pt; font-family: Consolas, monospace; }
  .type { margin-left: 6pt; font-weight: normal; color: #666; text-transform: capitalize; }
  .question { margin: 0 0 4pt; color: #444; }
  .meta { color: #555; margin: 0 0 2pt; }
  table { width: 100%; border-collapse: collapse; margin: 4pt 0; }
  th, td { border: 1px solid #ddd; padding: 3pt 5pt; text-align: left; vertical-align: top; }
  th { background: #f6f6f6; font-weight: 600; }
  .num { text-align: right; font-family: Consolas, monospace; white-space: nowrap; }
  .note, .basis { color: #666; font-size: 8.5pt; font-family: "Segoe UI", Arial, sans-serif; white-space: normal; }
  .none { color: #888; font-style: italic; }
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
  <table><thead><tr><th>Scope</th><th class="num">Approved total</th></tr></thead><tbody>${scopes}</tbody></table>
  ${sections}
  <p class="footer">Every value is consolidated from verified, validated and approved source documents and
  calculated with the conversion factors configured in TraceESG (see each calculation's factor and source).
  Percentages are derived from summed counts. Indicator wording follows SEBI's BRSR format (Annexure I).
  Each value can be traced to its original document from the report's page in TraceESG.</p>
</body></html>`;
}
