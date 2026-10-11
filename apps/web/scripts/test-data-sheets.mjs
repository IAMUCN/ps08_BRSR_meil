// Turns each test-data set's sheets.json (written by apps/ocr-worker/scripts/make_test_data.py) into the two
// filled-in bulk-import sheets, with the same headings the app's templates use. The Email column is left
// empty on purpose: whoever runs the test types real addresses.
//
//   node apps/web/scripts/test-data-sheets.mjs "test data"
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const XLSX = createRequire(import.meta.url)("xlsx");
const root = process.argv[2] ?? "test data";

function write(file, sheetName, headers, rows, widths) {
  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  XLSX.writeFile(book, file);
}

for (const set of readdirSync(root)) {
  const source = join(root, set, "sheets.json");
  if (!existsSync(source)) continue;
  const { orgUnits, employees } = JSON.parse(readFileSync(source, "utf8"));
  write(
    join(root, set, "1 Org units - bulk import.xlsx"),
    "New org units",
    ["Code", "Name", "Level", "Parent code"],
    orgUnits,
    [18, 40, 18, 18],
  );
  write(
    join(root, set, "2 Employees - bulk import (add emails).xlsx"),
    "Employees",
    ["Employee ID", "Name", "Email", "Role", "Organization Scope"],
    employees,
    [14, 26, 34, 18, 20],
  );
  rmSync(source);
  console.log(`${set}: ${orgUnits.length} org units, ${employees.length} employees`);
}
