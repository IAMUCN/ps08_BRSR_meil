import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeHtml, figure, renderReportHtml } from "../lib/reports/html.ts";
import { EMPTY_INPUTS } from "../lib/reports/inputs.ts";
import type { Snapshot } from "../lib/reports/snapshot.ts";

const snapshot = (overrides: Partial<Snapshot> = {}): Snapshot => ({
  version: 2,
  generatedAt: "2026-09-22T06:30:00.000Z",
  org: { id: "o", name: "MEIL", path: ["MEIL"] },
  orgUnitCount: 4,
  previous: null,
  inputs: null,
  factors: [],
  coverage: { label: "FY 2026-27", periodIds: ["p"], financialYear: 2026 },
  excludedAwaitingApproval: 0,
  scopes: [
    { code: "SCOPE_1", name: "Scope 1", figures: [{ unit: "kgCO2e", value: 93750 }] },
    { code: "SCOPE_2", name: "Scope 2", figures: [] },
    { code: "SCOPE_3", name: "Scope 3", figures: [] },
  ],
  sections: [
    {
      code: "A",
      name: "General Disclosures",
      indicators: [
        {
          id: "i1",
          code: "A-20",
          questionText: "Employees and workers",
          indicatorType: null,
          required: true,
          metrics: [
            {
              metricId: "m1",
              name: "Employees by gender",
              notes: null,
              method: "ratio",
              reportedValue: "result",
              figures: [{ unit: "%", value: (42 / 180) * 100 }],
              basis: { partLabel: "Women", wholeLabel: "Total employees", part: 42, whole: 180 },
              records: [],
            },
          ],
        },
      ],
    },
  ],
  indicators: [],
  ...overrides,
});

test("the report renders every value from the snapshot", () => {
  const html = renderReportHtml(snapshot());
  assert.match(
    html,
    /Scope 1<\/td><td>Metric tonnes of CO2 equivalent<\/td><td class="num">93\.75</,
    "tCO2e, not kg",
  );
  assert.match(html, /23\.33 %/, "percentages to two decimals");
  assert.match(html, /Women 42 of Total employees 180/, "the counts a percentage came from");
  assert.match(html, /No approved data/, "an empty scope says so rather than showing 0");
  assert.match(html, /Approved records only\./);
});

test("records left out for awaiting approval are stated", () => {
  assert.match(
    renderReportHtml(snapshot({ excludedAwaitingApproval: 3 })),
    /3 record\(s\) still awaiting approval are not included/,
  );
});

test("everything from the database is escaped", () => {
  assert.equal(
    escapeHtml(`<script>"x" & 'y'</script>`),
    "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;",
  );
  const html = renderReportHtml(
    snapshot({ org: { id: "o", name: "<b>X</b>", path: ["<b>X</b>"] } }),
  );
  assert.ok(!html.includes("<b>X</b>"));
  assert.ok(html.includes("&lt;b&gt;X&lt;/b&gt;"));
});

test("kilograms are reported as metric tonnes; an empty percentage shows no counts", () => {
  assert.equal(figure(2500, "kg"), "2.5 t");
  assert.equal(figure(1500, "kgCO2e"), "1.5 tCO2e");
  assert.equal(figure(23.333, "%"), "23.33 %");
  const s = snapshot();
  s.sections[0].indicators[0].metrics[0].figures = [];
  const html = renderReportHtml(s);
  assert.ok(!html.includes("Women 42 of"), "no 'x of y' line under 'No approved data'");
});

// The SEBI tables, checked against a published report: L&T's FY 2025-26 BRSR (ps_documents/provided_docs)
// states Scope 1 6,17,113 and Scope 2 2,89,920 tCO2e, turnover ₹1,53,680 crore and an IMF PPP rate of
// 20.343, and prints 5.9 tCO2e/₹ crore and 12.0 tCO2e/PPP million USD.
const ghg = (overrides: Partial<Snapshot> = {}) => {
  const indicator = (code: string) => ({
    id: code,
    code,
    questionText: "q",
    indicatorType: "essential",
    required: true,
    metrics: [],
  });
  const scopes = (s1: number, s2: number) => [
    { code: "SCOPE_1", name: "Scope 1", figures: [{ unit: "kgCO2e", value: s1 * 1000 }] },
    { code: "SCOPE_2", name: "Scope 2", figures: [{ unit: "kgCO2e", value: s2 * 1000 }] },
    { code: "SCOPE_3", name: "Scope 3", figures: [] },
  ];
  const sections = [{ code: "C", name: "Principle Wise", indicators: [indicator("P6-E7")] }];
  return snapshot({
    scopes: scopes(617113, 289920),
    sections,
    previous: { label: "FY 2025-26", scopes: scopes(603953, 282341), sections },
    inputs: {
      current: {
        ...EMPTY_INPUTS,
        turnoverCr: 153680,
        netWorthCr: 52340.5,
        pppRate: 20.343,
        assurance: "Yes, by <BDO>",
      },
      previous: EMPTY_INPUTS,
    },
    ...overrides,
  });
};

test("the GHG table is SEBI's: both years, tonnes, intensity per turnover and PPP", () => {
  const html = renderReportHtml(ghg());
  assert.match(html, /<th class="num">FY 2026-27<\/th><th class="num">FY 2025-26<\/th>/);
  assert.match(html, /Total Scope 1 emissions[^<]*<\/td><td>[^<]*<\/td><td class="num">6,17,113</);
  assert.match(html, /<td class="num">6,03,953</, "the previous year beside it");
  assert.match(html, /tCO2e \/ ₹ crore<\/td><td class="num">5\.9</);
  assert.match(html, /tCO2e \/ PPP million USD<\/td><td class="num">12</);
  assert.match(html, /assurance by an external agency — Yes, by &lt;BDO&gt;/);
});

test("an input nobody entered prints as not provided, never as a number", () => {
  const html = renderReportHtml(ghg());
  // The previous year has emissions but no turnover: no intensity can be stated for it.
  assert.match(html, /5\.9<\/td><td class="num"><span class="none">Not provided</);
  // No physical output for either year.
  assert.match(
    html,
    /physical output<\/td><td>[^<]*<\/td><td class="num"><span class="none">Not provided/,
  );
});

test("net worth is printed beside turnover, and an older year without it says not provided", () => {
  const html = renderReportHtml(ghg());
  assert.match(
    html,
    /Net worth<\/td><td>₹ crore<\/td><td class="num">52,340\.5<\/td><td class="num"><span class="none">Not provided/,
  );
});

test("a single-period report states no annual intensity", () => {
  const html = renderReportHtml(ghg({ previous: null, inputs: null }));
  assert.match(html, /Financial-year reports only/);
  assert.ok(!html.includes("FY 2025-26"), "and has no previous-year column");
});

test("the methodology section names the boundary and every factor's source", () => {
  const html = renderReportHtml(
    ghg({
      factors: [
        {
          name: "Grid electricity",
          version: 2,
          value: 0.71,
          inputUnit: "kWh",
          outputUnit: "kgCO2e",
          source: "CEA CO2 Baseline Database v21.0",
          geography: "India",
          effectiveFrom: "2024-04-01",
          effectiveTo: null,
          records: 3,
        },
      ],
    }),
  );
  assert.match(html, /every org unit beneath\s+it recorded in EmeilSG \(4 org units\)/);
  assert.match(html, /0\.71 kgCO2e \/ kWh/);
  assert.match(html, /CEA CO2 Baseline Database v21\.0/);
  assert.match(html, /2024-04-01 to date/);
});
