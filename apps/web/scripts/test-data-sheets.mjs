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
  try {
    XLSX.writeFile(book, file);
  } catch (error) {
    // Open in Excel: leave that copy alone and write the new one beside it.
    if (error.code !== "EBUSY") throw error;
    const beside = file.replace(/\.xlsx$/, " - NEW.xlsx");
    XLSX.writeFile(book, beside);
    console.log(`${file} is open in another program; wrote ${beside} instead`);
  }
}

for (const set of readdirSync(root)) {
  const source = join(root, set, "sheets.json");
  if (!existsSync(source)) continue;
  const { orgUnits, employees, orgUnitsExist } = JSON.parse(readFileSync(source, "utf8"));
  // A set whose org units are already in the app gets the hierarchy for reference, under a name that says
  // so: importing it would create second copies of the units that have no code.
  const importFile = join(root, set, "1 Org units - bulk import.xlsx");
  const referenceFile = join(root, set, "1 Org units - already in the app (do not import).xlsx");
  rmSync(orgUnitsExist ? importFile : referenceFile, { force: true });
  write(
    orgUnitsExist ? referenceFile : importFile,
    orgUnitsExist ? "Org units in the app" : "New org units",
    ["Code", "Name", "Level", "Parent code"],
    orgUnits,
    [18, 40, 18, 22],
  );
  write(
    join(root, set, "2 Employees - bulk import (add emails).xlsx"),
    "Employees",
    ["Employee ID", "Name", "Email", "Role", "Organization Scope"],
    employees,
    [14, 26, 34, 18, 32],
  );
  rmSync(source);
  console.log(`${set}: ${orgUnits.length} org units, ${employees.length} employees`);
}
