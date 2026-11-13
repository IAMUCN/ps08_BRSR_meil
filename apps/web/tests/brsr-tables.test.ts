// SEBI's typed tables (migration 0087) and the yearly notes (2026-11-13; .grill/brsr-gaps-decisions.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanCells, computePart, tableOf, type Cells } from "../lib/brsr-tables/definitions.ts";
import { buildWorkbook, readWorkbook } from "../lib/brsr-tables/excel.ts";
import { indicatorBlock, type Year } from "../lib/reports/html.ts";

test("workforce totals and gender shares are worked out", () => {
  const def = tableOf("A-20")!;
  const part = def.parts[0];
  const grid = computePart(part, {
    "all.e_perm": { male: 800, female: 200 },
    "all.e_other": { male: 100, female: 50 },
  });
  assert.equal(grid.e_perm.total, 1000);
  assert.equal(grid.e_perm.female_pct, 20);
  assert.equal(grid.e_total.male, 900);
  assert.equal(grid.e_total.female, 250);
  assert.equal(grid.e_total.total, 1150);
  assert.ok(Math.abs((grid.e_total.female_pct as number) - 21.739) < 0.001);
  assert.equal(grid.w_total.total, null); // nothing typed for workers
});

test("accounts payable days come from payables and cost", () => {
  const part = tableOf("P1-E8")!.parts[0];
  const grid = computePart(part, { "main.main": { payables: 100, cost: 365 } });
  assert.equal(grid.main.days, 100);
});

test("what is typed is checked and cleaned", () => {
  const def = tableOf("A-21")!;
  assert.deepEqual(cleanCells(def, { "main.board": { total: "12", female: 3, female_pct: 99 } }), {
    ok: true,
    cells: { "main.board": { total: 12, female: 3 } }, // the derived % is never stored
  });
  const negative = cleanCells(def, { "main.board": { total: -1 } });
  assert.equal(negative.ok, false);
  const turnover = cleanCells(tableOf("A-22")!, { "main.employees": { male: 120 } });
  assert.equal(turnover.ok, false);
  assert.match(!turnover.ok ? turnover.reason : "", /more than 100/);
  const text = cleanCells(tableOf("A-25")!, { "main.customers": { mechanism: "Yes", filed: "4" } });
  assert.deepEqual(text, { ok: true, cells: { "main.customers": { mechanism: "Yes", filed: 4 } } });
});

test("an Excel workbook goes out and comes back the same", async () => {
  const saved: { code: string; cells: Cells; notes: string | null }[] = [
    {
      code: "A-20",
      cells: { "all.e_perm": { male: 800, female: 200 }, "disabled.w_other": { female: 3 } },
      notes: "Permanent: on the rolls; other than permanent: contract.",
    },
    { code: "P1-E8", cells: { "main.main": { payables: 10, cost: 40 } }, notes: null },
  ];
  const blob = await buildWorkbook(saved, "FY 2026-27");
  const read = await readWorkbook(await blob.arrayBuffer());
  assert.deepEqual(read, saved);
});

test("a rearranged sheet is refused, naming where", async () => {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("A-21");
  sheet.addRow(["A-21 title"]);
  sheet.addRow(["Row", "Total (A)", "No. of females (B)"]);
  sheet.addRow(["Key Management Personnel", 5, 1]); // Board of Directors should come first
  const buffer = await book.xlsx.writeBuffer();
  await assert.rejects(() => readWorkbook(buffer as ArrayBuffer), /expected "Board of Directors"/);
});

test("the report prints a typed table with its year, and the yearly notes", () => {
  const indicator = {
    code: "A-21",
    questionText: "Participation/Inclusion/Representation of women.",
    indicatorType: null,
    kind: "statement",
    metrics: [],
    answer: null,
  } as never;
  const year: Year = {
    label: "FY 2026-27",
    scopes: [],
    sections: [],
    inputs: null,
    typedTables: {
      financialYear: 2026,
      byYear: {
        "2026": { "A-21": { cells: { "main.board": { total: 12, female: 3 } }, notes: null } },
      },
    },
  };
  const html = indicatorBlock(indicator, [year]);
  assert.match(html, /FY 2026-27/);
  assert.match(html, /Board of Directors/);
  assert.match(html, /25%/); // 3 of 12
  assert.doesNotMatch(html, /Not reported/);

  const energy = {
    code: "P6-E1",
    questionText: "Energy",
    indicatorType: "essential",
    kind: "statement",
    metrics: [],
    answer: null,
  } as never;
  const withNotes: Year = {
    label: "FY 2026-27",
    scopes: [],
    sections: [],
    inputs: {
      turnoverCr: null,
      pppRate: null,
      netWorthCr: null,
      physicalOutput: null,
      physicalOutputUnit: null,
      assurance: null,
      methodologyNote: null,
      assurer: "An assurance firm",
      assuranceLevel: "reasonable",
      changeNotes: { "P6-E1": "Energy intensity fell 4.5% after the solar plant." },
    },
  };
  const printed = indicatorBlock(energy, [withNotes]);
  assert.match(
    printed,
    /Reason for the change from the previous year:<\/strong> Energy intensity fell 4\.5%/,
  );
  assert.match(printed, /An assurance firm, reasonable assurance \(BRSR Core\)/);
});
