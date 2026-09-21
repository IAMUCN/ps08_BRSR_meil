import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeHtml, renderReportHtml } from "../lib/reports/html.ts";
import type { Snapshot } from "../lib/reports/snapshot.ts";

const snapshot = (overrides: Partial<Snapshot> = {}): Snapshot => ({
  version: 1,
  generatedAt: "2026-09-22T06:30:00.000Z",
  org: { id: "o", name: "MEIL", path: ["MEIL"] },
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
          code: "A-18",
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
  assert.match(html, /93,750 kgCO2e/);
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

test("a kilogram figure shows its tonne equivalent; an empty percentage shows no counts", () => {
  const s = snapshot();
  s.scopes[0].figures = [{ unit: "kg", value: 2500 }];
  s.sections[0].indicators[0].metrics[0].figures = [];
  const html = renderReportHtml(s);
  assert.match(html, /2,500 kg \(2\.5 t\)/);
  assert.ok(!html.includes("Women 42 of"), "no 'x of y' line under 'No approved data'");
});
