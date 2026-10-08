import assert from "node:assert/strict";
import { test } from "node:test";
import { normalize } from "../lib/calculation/units.ts";
import { combustionUse, wasteCategory, wasteRoute } from "../lib/reports/classify.ts";
import { renderReportHtml } from "../lib/reports/html.ts";
import type { ReportedIndicator, Snapshot } from "../lib/reports/snapshot.ts";

// Second audit (.grill/audit-2-decisions.md): the break-ups SEBI's Principle 6 tables ask for.

test("free text is read into SEBI's groups, and never guessed", () => {
  assert.equal(combustionUse("DG set, 250 kVA"), "stationary");
  assert.equal(combustionUse("Site vehicle - tipper"), "mobile");
  assert.equal(combustionUse("Project X"), null);
  assert.equal(combustionUse(""), null);

  assert.equal(wasteCategory("E-waste"), "B");
  assert.equal(wasteCategory("Construction & demolition debris"), "D");
  assert.equal(wasteCategory("Non-hazardous scrap"), "H", "not read as hazardous");
  assert.equal(wasteCategory("Other hazardous waste"), "G");
  assert.equal(wasteCategory("g"), "G", "the letter itself");
  assert.equal(wasteCategory("mixed"), null);

  assert.equal(wasteRoute("Landfill"), "landfilling");
  assert.equal(wasteRoute("Sent for recycling"), "recycled");
  assert.equal(wasteRoute("Re-used on site"), "reused");
  assert.equal(wasteRoute("Co-processing in cement kiln"), "other_recovery");
  assert.equal(wasteRoute("TSDF"), "other_disposal");
  assert.equal(wasteRoute(null), null);
});

test("a normal cubic metre of gas is 288.15 / 273.15 standard cubic metres", () => {
  const n = normalize(100, "Nm3", "SCM");
  assert.ok(n.ok);
  assert.ok(Math.abs(n.normalized.value - 105.4915) < 0.001);
  assert.equal(normalize(100, "Nm3", "L").ok, false, "a gas volume is not litres of water");
});

const indicator = (
  code: string,
  figures: { unit: string; value: number }[],
): ReportedIndicator => ({
  id: code,
  code,
  questionText: code,
  indicatorType: "essential",
  required: true,
  metrics: [
    {
      metricId: `m-${code}`,
      name: code,
      notes: null,
      method: "sum",
      reportedValue: "activity",
      figures,
      basis: null,
      records: [],
    },
  ],
});

const snapshot = (overrides: Partial<Snapshot> = {}): Snapshot => ({
  version: 3,
  generatedAt: "2026-10-08T06:30:00.000Z",
  org: { id: "o", name: "MEIL", path: ["MEIL"] },
  orgUnitCount: 6,
  previous: null,
  inputs: null,
  factors: [],
  coverage: {
    label: "FY 2026-27",
    periodIds: ["p"],
    financialYear: 2026,
    from: "2026-08-01",
    to: "2026-08-31",
    days: 31,
  },
  excludedAwaitingApproval: 0,
  scopes: [
    { code: "SCOPE_1", name: "Scope 1", figures: [{ unit: "kgCO2e", value: 10000 }] },
    { code: "SCOPE_2", name: "Scope 2", figures: [{ unit: "kgCO2e", value: 4000 }] },
    { code: "SCOPE_3", name: "Scope 3", figures: [] },
  ],
  sections: [
    {
      code: "C",
      name: "Principle-wise Performance",
      indicators: [indicator("P6-E7", []), indicator("P6-E9", [{ unit: "kg", value: 9000 }])],
    },
  ],
  indicators: [],
  breakups: {
    gases: [
      { scopeCode: "SCOPE_1", gases: "CO2", tCo2e: 7.5 },
      { scopeCode: "SCOPE_1", gases: "HFCs", tCo2e: 2 },
      { scopeCode: "SCOPE_1", gases: null, tCo2e: 0.5 },
      { scopeCode: "SCOPE_2", gases: "CO2", tCo2e: 4 },
    ],
    scope1Sources: [
      { source: "stationary", tCo2e: 5 },
      { source: "mobile", tCo2e: 2.5 },
      { source: "fugitive", tCo2e: 2 },
      { source: "combustion_unstated", tCo2e: 0.5 },
    ],
    wasteByCategory: [
      { category: "B", tonnes: 1.5 },
      { category: "D", tonnes: 6 },
      { category: null, tonnes: 1.5 },
    ],
    wasteByRoute: [
      { route: "recycled", tonnes: 1.5 },
      { route: "landfilling", tonnes: 6 },
      { route: null, tonnes: 1.5 },
    ],
  },
  children: [
    {
      name: "Company A",
      level: "Subsidiary / Entity",
      scopes: [
        { code: "SCOPE_1", name: "Scope 1", figures: [{ unit: "kgCO2e", value: 6000 }] },
        { code: "SCOPE_2", name: "Scope 2", figures: [{ unit: "kgCO2e", value: 4000 }] },
        { code: "SCOPE_3", name: "Scope 3", figures: [] },
      ],
    },
    {
      name: "Company B",
      level: "Subsidiary / Entity",
      scopes: [
        { code: "SCOPE_1", name: "Scope 1", figures: [{ unit: "kgCO2e", value: 3000 }] },
        { code: "SCOPE_2", name: "Scope 2", figures: [] },
        { code: "SCOPE_3", name: "Scope 3", figures: [] },
      ],
    },
  ],
  ...overrides,
});

test("Scope 1 and 2 are broken up by the gases the factors name; unstated stays unstated", () => {
  const html = renderReportHtml(snapshot());
  assert.match(html, /of which: CO2<\/td><td>[^<]*<\/td><td class="num">7\.5</);
  assert.match(html, /of which: HFCs<\/td><td>[^<]*<\/td><td class="num">2</);
  assert.match(
    html,
    /gases not stated by the factor used<\/td><td>[^<]*<\/td><td class="num">0\.5</,
  );
});

test("Scope 1 is told apart by emission source", () => {
  const html = renderReportHtml(snapshot());
  assert.match(html, /Stationary combustion[^<]*<\/td><td>[^<]*<\/td><td class="num">5</);
  assert.match(html, /Mobile combustion[^<]*<\/td><td>[^<]*<\/td><td class="num">2\.5</);
  assert.match(html, /Fugitive emissions[^<]*<\/td><td>[^<]*<\/td><td class="num">2</);
  assert.ok(!html.includes("Process emissions</td>"), "a source with no record has no row");
});

test("the waste table is SEBI's: categories A to H, recovered and disposed by operation", () => {
  const html = renderReportHtml(snapshot());
  assert.match(html, /E-waste \(B\)<\/td><td>Metric tonnes<\/td><td class="num">1\.5</);
  assert.match(
    html,
    /Construction and demolition waste \(D\)<\/td><td>[^<]*<\/td><td class="num">6</,
  );
  assert.match(
    html,
    /Plastic waste \(A\)<\/td><td>[^<]*<\/td><td class="num">—</,
    "none is a dash, not 0",
  );
  assert.match(
    html,
    /Category not stated on the certificate<\/td><td>[^<]*<\/td><td class="num">1\.5</,
  );
  assert.match(html, /Total \(A \+ B[^<]*<\/td><td>[^<]*<\/td><td class="num">9</);
  assert.match(html, /Total recovered<\/td><td>[^<]*<\/td><td class="num">1\.5</);
  assert.match(html, /Total disposed<\/td><td>[^<]*<\/td><td class="num">6</);
  assert.match(html, /Treatment route not stated on the certificate/);
});

test("the consolidation table shows each child and what is recorded on the node itself", () => {
  const html = renderReportHtml(snapshot());
  assert.match(html, /Company A<\/td><td>Subsidiary \/ Entity<\/td><td class="num">6</);
  assert.match(html, /Recorded directly on MEIL<\/td><td><\/td><td class="num">1</, "10 − 6 − 3");
  assert.match(html, /MEIL — total<\/th><th><\/th><th class="num">10</);
});

test("a financial-year report built from part of the year says so", () => {
  assert.match(
    renderReportHtml(snapshot()),
    /cover 31 of the year's 365 days \(2026-08-01 to 2026-08-31\)/,
  );
  const full = snapshot();
  full.coverage.days = 365;
  assert.ok(!renderReportHtml(full).includes("Part of the year"));
});

test("a snapshot made before version 3 still renders", () => {
  const old = snapshot({ breakups: undefined, children: undefined });
  old.coverage = { label: "FY 2026-27", periodIds: ["p"], financialYear: 2026 };
  const html = renderReportHtml(old);
  assert.match(html, /Total \(A \+ B[^<]*<\/td><td>[^<]*<\/td><td class="num">9</);
  assert.ok(!html.includes("of which:"));
  assert.ok(!html.includes("Consolidation by org unit"));
});
