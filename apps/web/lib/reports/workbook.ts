// The GHG inventory as an Excel workbook (feature_enhancement.md 8.1; owner's choice: PDF, plus Excel for the
// GHG inventory; D52). Built from the same frozen snapshot as its PDF, so both say the same. Text typed by users
// (org unit, file and factor names) is written so a spreadsheet cannot run it as a formula; numbers are numbers.
import ExcelJS from "exceljs";
import { csvSafeText } from "../csv.ts";
import { scopeTonnes, tonnes, yearsOf } from "./html.ts";
import type { Snapshot } from "./snapshot.ts";

const SCOPES = [
  ["SCOPE_1", "Scope 1"],
  ["SCOPE_2", "Scope 2"],
  ["SCOPE_3", "Scope 3"],
] as const;
const text = (value: string | null | undefined) => csvSafeText(value ?? "");
const t3 = (value: number | null) => (value === null ? null : Math.round(value * 1000) / 1000);

export async function ghgWorkbook(s: Snapshot): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "EmeilSG";
  wb.created = new Date(s.generatedAt);
  const years = yearsOf(s);
  const head = (
    sheet: ExcelJS.Worksheet,
    columns: { header: string; key: string; width: number }[],
  ) => {
    sheet.columns = columns;
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  };

  const about = wb.addWorksheet("About");
  about.columns = [
    { header: "", key: "k", width: 28 },
    { header: "", key: "v", width: 90 },
  ];
  about.addRows([
    { k: "Report", v: "Greenhouse Gas Inventory" },
    { k: "Org unit", v: text(s.org.path.join(" › ")) },
    { k: "Covers", v: text(s.coverage.label) },
    {
      k: "Generated",
      v: new Date(s.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST",
    },
    { k: "Basis", v: "Approved records only, metric tonnes of CO2 equivalent (tCO2e)." },
    {
      k: "Left out",
      v: `${s.excludedAwaitingApproval} record(s) awaiting approval; records without a conversion factor.`,
    },
  ]);
  about.getColumn("k").font = { bold: true };

  const summary = wb.addWorksheet("By scope");
  head(summary, [
    { header: "Scope", key: "scope", width: 22 },
    ...years.map((y, i) => ({ header: `${y.label} (tCO2e)`, key: `y${i}`, width: 22 })),
  ]);
  for (const [code, name] of SCOPES)
    summary.addRow({
      scope: name,
      ...Object.fromEntries(years.map((y, i) => [`y${i}`, t3(scopeTonnes(y, code))])),
    });
  summary.addRow({
    scope: "Total",
    ...Object.fromEntries(
      years.map((y, i) => {
        const parts = SCOPES.map(([c]) => scopeTonnes(y, c));
        return [
          `y${i}`,
          parts.every((p) => p === null)
            ? null
            : t3(parts.reduce<number>((a, p) => a + (p ?? 0), 0)),
        ];
      }),
    ),
  }).font = { bold: true };

  const byActivity = wb.addWorksheet("By activity");
  head(byActivity, [
    { header: "Scope", key: "scope", width: 10 },
    { header: "Category", key: "category", width: 34 },
    { header: "Activity", key: "activity", width: 44 },
    { header: "Code", key: "code", width: 26 },
    { header: `${years[0].label} (tCO2e)`, key: "now", width: 20 },
    ...(years[1] ? [{ header: `${years[1].label} (tCO2e)`, key: "before", width: 20 }] : []),
    { header: "Records", key: "records", width: 10 },
  ]);
  const now = s.extras?.activities ?? [];
  const before = s.extras?.previousActivities ?? [];
  for (const a of [...new Map([...now, ...before].map((x) => [x.metricCode, x])).values()]) {
    const n = now.find((x) => x.metricCode === a.metricCode);
    const b = before.find((x) => x.metricCode === a.metricCode);
    byActivity.addRow({
      scope: SCOPES.find(([c]) => c === a.scopeCode)?.[1],
      category: text(a.categoryName),
      activity: text(a.metricName),
      code: a.metricCode,
      now: n ? t3(n.tco2e) : null,
      before: b ? t3(b.tco2e) : null,
      records: n?.records ?? 0,
    });
  }

  if (s.children?.length) {
    const units = wb.addWorksheet("By org unit");
    head(units, [
      { header: "Org unit", key: "unit", width: 40 },
      { header: "Level", key: "level", width: 16 },
      ...SCOPES.map(([c, name]) => ({ header: `${name} (tCO2e)`, key: c, width: 18 })),
    ]);
    for (const child of s.children)
      units.addRow({
        unit: text(child.name),
        level: text(child.level),
        ...Object.fromEntries(
          SCOPES.map(([c]) => [
            c,
            t3(tonnes(child.scopes.find((x) => x.code === c)?.figures, "co2e")),
          ]),
        ),
      });
  }

  const factors = wb.addWorksheet("Factors");
  head(factors, [
    { header: "Factor", key: "name", width: 40 },
    { header: "Version", key: "version", width: 9 },
    { header: "Value", key: "value", width: 14 },
    { header: "Unit", key: "unit", width: 18 },
    { header: "Source", key: "source", width: 60 },
    { header: "Geography", key: "geography", width: 14 },
    { header: "Effective from", key: "from", width: 14 },
    { header: "Effective to", key: "to", width: 14 },
    { header: "Records", key: "records", width: 10 },
  ]);
  for (const f of s.factors)
    factors.addRow({
      name: text(f.name),
      version: f.version,
      value: f.value,
      unit: `${f.outputUnit} / ${f.inputUnit}`,
      source: text(f.source),
      geography: text(f.geography),
      from: f.effectiveFrom,
      to: f.effectiveTo ?? "",
      records: f.records,
    });

  // Every approved record behind the Scope 1, 2 and 3 questions, with its own figure and document.
  const records = wb.addWorksheet("Records");
  head(records, [
    { header: "Question", key: "question", width: 10 },
    { header: "Activity", key: "activity", width: 40 },
    { header: "Org unit", key: "unit", width: 34 },
    { header: "Value", key: "value", width: 14 },
    { header: "Unit", key: "u", width: 10 },
    { header: "Document", key: "file", width: 44 },
    { header: "Record id", key: "id", width: 38 },
  ]);
  for (const section of s.sections)
    for (const i of section.indicators.filter((x) => x.code === "P6-E7" || x.code === "P6-L2"))
      for (const m of i.metrics)
        for (const r of m.records)
          records.addRow({
            question: i.code,
            activity: text(m.name),
            unit: text(r.orgUnitName),
            value: r.value,
            u: r.unit ?? "",
            file: text(r.fileName),
            id: r.recordId,
          });

  return new Uint8Array(await wb.xlsx.writeBuffer());
}
