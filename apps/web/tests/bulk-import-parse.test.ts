import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { parseSheetRows } from "../lib/bulk-import/xlsx.ts";

// The sheet reader behind both bulk imports. Written when the spreadsheet library was moved to the vendor's
// patched release (DEPENDENCY_AUDIT_2026-10-12.md): a filled template must still read the same way.

async function workbook(rows: (string | number | null)[][], extraSheet = true): Promise<File> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Employees");
  for (const row of rows) sheet.addRow(row);
  // The templates carry a second sheet of pick-list values; only the first sheet is read.
  if (extraSheet) book.addWorksheet("Lists").addRow(["hr", "ehs", "finance_csr"]);
  const bytes = await book.xlsx.writeBuffer();
  return new File([bytes], "filled-template.xlsx");
}

test("a filled bulk-import sheet reads as trimmed text, keyed by header, without blank rows", async () => {
  const rows = await parseSheetRows(
    await workbook([
      ["Employee ID ", " Name", "Email", "Role", "Organization Scope"],
      ["E-1001", "  Asha Rao ", "asha.rao@example.test", "hr", "PRJ-X"],
      [1002, "Ravi Kumar", "ravi@example.test", "project_manager", null],
      [null, null, null, null, null],
      ["", "   ", "", "", ""],
      ["E-1003", "Meena", "meena@example.test", "ehs", "Project X Site 1"],
    ]),
  );
  assert.deepEqual(rows, [
    {
      "Employee ID": "E-1001",
      Name: "Asha Rao",
      Email: "asha.rao@example.test",
      Role: "hr",
      "Organization Scope": "PRJ-X",
    },
    {
      "Employee ID": "1002",
      Name: "Ravi Kumar",
      Email: "ravi@example.test",
      Role: "project_manager",
      "Organization Scope": "",
    },
    {
      "Employee ID": "E-1003",
      Name: "Meena",
      Email: "meena@example.test",
      Role: "ehs",
      "Organization Scope": "Project X Site 1",
    },
  ]);
});

test("a sheet with only its header row, or nothing at all, gives no rows", async () => {
  assert.deepEqual(
    await parseSheetRows(await workbook([["Code", "Name", "Level", "Parent code"]])),
    [],
  );
  assert.deepEqual(await parseSheetRows(await workbook([], false)), []);
});

test("text that looks like markup or a formula is read as plain text, never evaluated", async () => {
  const [row] = await parseSheetRows(
    await workbook([
      ["Code", "Name"],
      ["=1+1", "<img src=x onerror=alert(1)>"],
    ]),
  );
  assert.deepEqual(row, { Code: "=1+1", Name: "<img src=x onerror=alert(1)>" });
});
