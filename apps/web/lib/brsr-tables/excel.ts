// Excel for SEBI's typed tables (owner's decision, 2026-11-13: "typed table with excel import"). One workbook per
// financial year, one sheet per table named by its code; each part has a header row starting "Row", then one line
// per row that is typed (total rows are worked out and left out), then a "Notes" line. The importer walks the same
// layout and checks every row label, so a sheet that was rearranged is refused, never misread.

import { BRSR_TABLES, tableOf, typedColumns, type Cells, type TableDef } from "./definitions.ts";

type Saved = { code: string; cells: Cells; notes: string | null };

/** The workbook, filled with what is saved for the year, as an .xlsx file. Runs in the browser. */
export async function buildWorkbook(tables: Saved[], yearLabel: string): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  for (const def of BRSR_TABLES) {
    const saved = tables.find((t) => t.code === def.code);
    if (!saved) continue; // only the tables this person may write
    const sheet = book.addWorksheet(def.code);
    sheet.addRow([`${def.code} — ${def.title} (${yearLabel})`]).font = { bold: true };
    sheet.addRow(["Type into the white cells. Totals and percentages are worked out by EmeilSG."]);
    for (const part of def.parts) {
      sheet.addRow([]);
      if (part.title) sheet.addRow([part.title]).font = { bold: true };
      const columns = typedColumns(part);
      const header = sheet.addRow(["Row", ...columns.map((c) => c.label)]);
      header.font = { bold: true };
      for (const row of part.rows) {
        if (row.sumOf) continue;
        const values = saved.cells[`${part.key}.${row.key}`] ?? {};
        sheet.addRow([
          row.label,
          ...columns.map((c) =>
            row.only && !row.only.includes(c.key) ? "—" : (values[c.key] ?? null),
          ),
        ]);
      }
    }
    sheet.addRow([]);
    sheet.addRow(["Notes", saved.notes ?? ""]);
    sheet.getColumn(1).width = 60;
    for (let i = 2; i <= 12; i++) sheet.getColumn(i).width = 22;
  }
  const buffer = await book.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const same = (a: unknown, b: string) =>
  String(a ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

/** Reads one sheet in the template's layout into a table's cells. Throws a message naming the sheet and row. */
function readSheet(def: TableDef, rows: unknown[][]): Saved {
  const cells: Cells = {};
  let at = 0;
  const next = () => rows[at++] ?? [];
  for (const part of def.parts) {
    const columns = typedColumns(part);
    // Find the part's header row ("Row", column labels...).
    while (at < rows.length && !same(rows[at]?.[0], "Row")) at++;
    const header = next();
    if (!same(header[0], "Row")) {
      throw new Error(
        `Sheet ${def.code}: the header row for "${part.title ?? def.title}" is missing.`,
      );
    }
    columns.forEach((c, i) => {
      if (!same(header[i + 1], c.label)) {
        throw new Error(
          `Sheet ${def.code}: column ${i + 2} should be "${c.label}" but says "${String(header[i + 1] ?? "")}".`,
        );
      }
    });
    for (const row of part.rows) {
      if (row.sumOf) continue;
      const line = next();
      if (!same(line[0], row.label)) {
        throw new Error(
          `Sheet ${def.code}, row ${at}: expected "${row.label}" but found "${String(line[0] ?? "")}".`,
        );
      }
      columns.forEach((c, i) => {
        const value = line[i + 1];
        if (value === undefined || value === null || value === "" || value === "—") return;
        (cells[`${part.key}.${row.key}`] ??= {})[c.key] = value as number | string;
      });
    }
  }
  const notesRow = rows.slice(at).find((r) => same(r?.[0], "Notes"));
  const notes = notesRow?.[1] ? String(notesRow[1]).trim() : null;
  return { code: def.code, cells, notes: notes || null };
}

/** Every table sheet in an uploaded workbook. Sheets that are not a table's code are ignored. */
export async function readWorkbook(data: ArrayBuffer): Promise<Saved[]> {
  const XLSX = await import("xlsx");
  const book = XLSX.read(data, { type: "array" });
  const out: Saved[] = [];
  for (const name of book.SheetNames) {
    const def = tableOf(name.trim());
    if (!def) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], {
      header: 1,
      blankrows: true,
      defval: null,
    });
    out.push(readSheet(def, rows));
  }
  if (!out.length)
    throw new Error("No sheet in that file is named after a BRSR table (e.g. A-20).");
  return out;
}
