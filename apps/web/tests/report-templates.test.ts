import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { renderReportHtml } from "../lib/reports/html.ts";
import { EMPTY_INPUTS } from "../lib/reports/inputs.ts";
import type { ReportedIndicator, Snapshot } from "../lib/reports/snapshot.ts";
import {
  renderCoreHtml,
  renderGhgHtml,
  renderSummaryHtml,
  renderTemplateHtml,
} from "../lib/reports/template-html.ts";
import {
  BRSR_CORE,
  isTemplate,
  REPORT_TEMPLATES,
  TEMPLATE_INFO,
} from "../lib/reports/templates.ts";
import { ghgWorkbook } from "../lib/reports/workbook.ts";

// feature_enhancement.md 8.1 (requirement 31): the BRSR Core, GHG inventory and executive summary templates
// print the same frozen snapshot as the full BRSR report.

const indicator = (code: string, extra: Partial<ReportedIndicator> = {}): ReportedIndicator => ({
  id: code,
  code,
  questionText: `Question ${code}`,
  indicatorType: "essential",
  required: true,
  kind: "data",
  metrics: [],
  ...extra,
});

const record = (id: string, unit: string, value: number) => ({
  recordId: id,
  calculationId: `c-${id}`,
  orgUnitName: unit,
  fileName: '=HYPERLINK("x") bill.pdf',
  documentId: `d-${id}`,
  mimeType: "application/pdf",
  value,
  unit: "kgCO2e",
});

const snapshot = (overrides: Partial<Snapshot> = {}): Snapshot => ({
  version: 4,
  generatedAt: "2026-11-09T06:30:00.000Z",
  org: { id: "o", name: "MEIL <Group>", path: ["MEIL <Group>"] },
  orgUnitCount: 3,
  coverage: { label: "FY 2026-27", periodIds: ["p"], financialYear: 2026, days: 365 },
  excludedAwaitingApproval: 4,
  scopes: [
    { code: "SCOPE_1", name: "Scope 1", figures: [{ unit: "kgCO2e", value: 12000 }] },
    { code: "SCOPE_2", name: "Scope 2", figures: [{ unit: "kgCO2e", value: 30000 }] },
    { code: "SCOPE_3", name: "Scope 3", figures: [{ unit: "kgCO2e", value: 5000 }] },
  ],
  sections: [
    {
      code: "C",
      name: "Principle-wise performance",
      indicators: [
        indicator("P6-E7", {
          metrics: [
            {
              metricId: "m1",
              name: "Diesel Consumption",
              notes: null,
              method: "sum",
              reportedValue: "result",
              figures: [{ unit: "kgCO2e", value: 12000 }],
              basis: null,
              records: [record("r1", "Project X", 12000)],
            },
          ],
        }),
        indicator("P6-E3", {
          metrics: [
            {
              metricId: "m2",
              name: "Water withdrawn",
              notes: null,
              method: "sum",
              reportedValue: "result",
              figures: [{ unit: "KL", value: 820 }],
              basis: null,
              records: [],
            },
          ],
        }),
        indicator("P1-E8", { kind: "statement", answer: "42 days" }),
        indicator("P5-E7", { kind: "statement", answer: null }),
      ],
    },
  ],
  previous: {
    label: "FY 2025-26",
    scopes: [
      { code: "SCOPE_1", name: "Scope 1", figures: [{ unit: "kgCO2e", value: 10000 }] },
      { code: "SCOPE_2", name: "Scope 2", figures: [{ unit: "kgCO2e", value: 30000 }] },
      { code: "SCOPE_3", name: "Scope 3", figures: [] },
    ],
    sections: [],
  },
  inputs: { current: EMPTY_INPUTS, previous: EMPTY_INPUTS },
  factors: [
    {
      name: "Diesel",
      version: 2,
      value: 2.68,
      inputUnit: "L",
      outputUnit: "kgCO2e",
      source: "IPCC 2006",
      geography: "IN",
      effectiveFrom: "2026-04-01",
      effectiveTo: null,
      records: 1,
    },
  ],
  indicators: [],
  ...overrides,
});

test("there are four templates, each with a title, a description and a file name", () => {
  assert.deepEqual([...REPORT_TEMPLATES], ["brsr", "brsr_core", "ghg", "summary"]);
  for (const t of REPORT_TEMPLATES)
    assert.ok(TEMPLATE_INFO[t].title && TEMPLATE_INFO[t].description);
  assert.equal(isTemplate("ghg"), true);
  assert.equal(isTemplate("anything"), false);
  // Only the GHG inventory has a workbook.
  assert.deepEqual(
    REPORT_TEMPLATES.filter((t) => TEMPLATE_INFO[t].workbook),
    ["ghg"],
  );
});

test("the full BRSR template is today's report, unchanged", () => {
  const s = snapshot();
  assert.equal(renderTemplateHtml(s, "brsr"), renderReportHtml(s));
  assert.equal(renderTemplateHtml(s), renderReportHtml(s));
});

test("every template states the boundary, the records left out, and escapes what it prints", () => {
  for (const t of REPORT_TEMPLATES) {
    const html = renderTemplateHtml(snapshot(), t);
    assert.match(html, new RegExp(`<h1>${TEMPLATE_INFO[t].title}</h1>`), t);
    assert.match(html, /MEIL &lt;Group&gt;/, t);
    assert.doesNotMatch(html, /MEIL <Group>/, t);
    assert.match(html, /4 record\(s\) still awaiting approval are not included/, t);
  }
});

test("BRSR Core lists every Core KPI, marks how each is sourced, and whether it is reported", () => {
  const html = renderCoreHtml(snapshot());
  for (const k of BRSR_CORE) assert.ok(html.includes(k.code), k.code);
  assert.equal(BRSR_CORE.length, 14);
  assert.match(html, /6 of the\s+14 KPIs below are calculated/);
  // P6-E7 has an approved figure; P1-E8 has a typed answer; P5-E7 has none.
  const rowOf = (code: string) => html.split("<tr>").find((r) => r.includes(`>${code}<`)) ?? "";
  assert.match(rowOf("P6-E7"), /Evidence-backed[\s\S]*Reported/);
  assert.match(rowOf("P1-E8"), /Typed by the entity[\s\S]*Reported/);
  assert.match(rowOf("P5-E7"), /Not reported/);
  // Questions outside BRSR Core are left out.
  assert.doesNotMatch(
    renderCoreHtml(
      snapshot({ sections: [{ code: "C", name: "x", indicators: [indicator("P2-E1")] }] }),
    ),
    /Question P2-E1/,
  );
});

test("the GHG inventory lists activities by scope against the year before", () => {
  const s = snapshot({
    extras: {
      activities: [
        {
          metricCode: "GRID_ELECTRICITY",
          metricName: "Grid Electricity",
          scopeCode: "SCOPE_2",
          categoryName: "Scope 2",
          tco2e: 30,
          records: 12,
        },
        {
          metricCode: "DIESEL_CONSUMPTION",
          metricName: "Diesel",
          scopeCode: "SCOPE_1",
          categoryName: "Scope 1",
          tco2e: 12,
          records: 3,
        },
      ],
      previousActivities: [
        {
          metricCode: "DIESEL_CONSUMPTION",
          metricName: "Diesel",
          scopeCode: "SCOPE_1",
          categoryName: "Scope 1",
          tco2e: 10,
          records: 3,
        },
      ],
    },
  });
  const html = renderGhgHtml(s);
  assert.ok(
    html.indexOf("Diesel") < html.indexOf("Grid Electricity"),
    "Scope 1 comes before Scope 2",
  );
  assert.match(html, /Total \(Scope 1 \+ 2 \+ 3\)[\s\S]*?47/);
  assert.match(html, /Emissions by activity/);
  assert.match(html, /IPCC 2006/, "every factor and its source");
  assert.match(renderGhgHtml(snapshot()), /No approved emission records for this report/);
});

test("the GHG workbook has the same figures, and a typed name cannot run as a formula", async () => {
  const s = snapshot({
    extras: {
      activities: [
        {
          metricCode: "DIESEL_CONSUMPTION",
          metricName: "Diesel",
          scopeCode: "SCOPE_1",
          categoryName: "Scope 1",
          tco2e: 12,
          records: 1,
        },
      ],
    },
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await ghgWorkbook(s)).buffer as ArrayBuffer);
  assert.deepEqual(
    wb.worksheets.map((w) => w.name),
    ["About", "By scope", "By activity", "Factors", "Records"],
  );
  const byScope = wb.getWorksheet("By scope")!;
  assert.equal(byScope.getCell("B2").value, 12);
  assert.equal(byScope.getCell("C2").value, 10);
  assert.equal(byScope.getCell("B5").value, 47);
  const rec = wb.getWorksheet("Records")!;
  assert.equal(rec.getCell("F2").value, '\'=HYPERLINK("x") bill.pdf');
  assert.equal(rec.getCell("D2").value, 12000);
});

test("the executive summary shows headline figures against the year before, alerts and actions", () => {
  const html = renderSummaryHtml(
    snapshot({
      extras: {
        analytics: {
          years: [
            {
              label: "FY 2025-26",
              total: 40,
              byScope: { SCOPE_1: 10, SCOPE_2: 30, SCOPE_3: 0 },
              complete: true,
              notes: [],
            },
            {
              label: "FY 2026-27",
              total: 47,
              byScope: { SCOPE_1: 12, SCOPE_2: 30, SCOPE_3: 5 },
              complete: false,
              notes: ["The year is not over yet."],
            },
          ],
          recommendations: [
            {
              title: "Diesel emissions are rising",
              reason: "Up 20%.",
              priority: "medium",
              policy: "A fleet policy.",
            },
          ],
          alerts: [
            {
              orgUnitName: "Project X",
              periodLabel: "Jul 2026",
              scopeCode: "SCOPE_1",
              measuredT: 3,
              baselineT: 2,
              thresholdPct: 20,
            },
          ],
        },
      },
    }),
  );
  assert.match(html, /Total emissions[\s\S]*?47[\s\S]*?▲ \+18% on FY 2025-26/);
  assert.match(html, /Scope 1[\s\S]*?12[\s\S]*?▲ \+20% on FY 2025-26/);
  assert.match(html, /Water consumed[\s\S]*?820/);
  assert.match(html, /Partial — The year is not over yet\./);
  assert.match(html, /Project X, Jul 2026, Scope 1:<\/strong>\s+3 tCO2e against an expected 2/);
  assert.match(html, /Diesel emissions are rising<\/strong> \(medium priority\)/);
  const empty = renderSummaryHtml(snapshot());
  assert.match(empty, /No open emission alerts/);
  assert.match(empty, /Nothing stands out/);
});
