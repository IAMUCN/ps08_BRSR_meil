import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { REGISTER_COLUMNS } from "@/lib/register/register";

// The register template: the headings the reader expects, with pick-lists where a cell has a fixed set of
// answers. No data of any person. Open to anyone who may upload a register.

const LISTS: Partial<Record<(typeof REGISTER_COLUMNS)[number]["key"], string>> = {
  gender: "Male,Female,Other",
  category: "Employee,Worker",
  employment: "Permanent,Other than permanent",
  differentlyAbled: "Yes,No",
  place: "Rural,Semi-urban,Urban,Metropolitan",
};

export async function GET() {
  const session = await getSessionContext();
  if (session.status !== "active") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const who = session.session;
  if (!who.isAdmin && !who.permissions.includes("employee_register.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Register");
  sheet.addRow(REGISTER_COLUMNS.map((c) => c.header));
  sheet.getRow(1).font = { bold: true };
  REGISTER_COLUMNS.forEach((c, index) => {
    sheet.getColumn(index + 1).width = Math.max(16, c.header.length + 4);
    const list = LISTS[c.key];
    if (!list) return;
    for (let row = 2; row <= 5000; row++) {
      sheet.getCell(row, index + 1).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${list}"`],
      };
    }
  });
  sheet.addRow([]);
  const notes = book.addWorksheet("How to fill");
  [
    "One row per person. Employee ID, Gender, Category and Employment type are required.",
    "Dates as dd-mm-yyyy. Leave Date of leaving empty for people still employed.",
    "Gross wages for the year in rupees. Place of employment follows the RBI classification.",
    "Headcount is counted as at 31 March of the financial year you upload for.",
    "Delete this sheet's example text before uploading; only the first sheet is read.",
  ].forEach((line) => notes.addRow([line]));
  notes.getColumn(1).width = 100;
  const bytes = await book.xlsx.writeBuffer();
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="employee-register-template.xlsx"',
      "Cache-Control": "private, no-store",
    },
  });
}
