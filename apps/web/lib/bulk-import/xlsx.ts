// Client-side .xlsx template/parse helpers for bulk import (bulk-import-decisions.md). Browser-only —
// no file ever needs to reach the server as bytes; parsed rows go to the tRPC mutation as JSON, which
// re-validates everything server-side (never trust client-parsed input).
import * as XLSX from "xlsx";

function triggerDownload(bytes: BlobPart, filename: string) {
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  const data = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  triggerDownload(data, filename);
}

function sheetWithReference(
  sheetName: string,
  headers: string[],
  exampleRow: (string | number)[],
  reference: (string | number)[][],
) {
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
  sheet["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 4, 18) }));
  XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  if (reference.length > 0) {
    const refSheet = XLSX.utils.aoa_to_sheet(reference);
    refSheet["!cols"] = [{ wch: 24 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, refSheet, "Valid codes");
  }
  return wb;
}

export const EMPLOYEE_HEADERS = [
  "Employee ID",
  "Name",
  "Email",
  "Role",
  "Organization Scope",
] as const;

// Matches the server's bulk-import row cap (lib/trpc/routers/users.ts bulkImport input).
const MAX_IMPORT_ROWS = 500;

/**
 * The plain "xlsx" package (SheetJS Community Edition) can read data validation but has no
 * write support for it, so the Role column needs "exceljs" instead — the only already-reasonable
 * way to ship a real in-cell dropdown that keeps the Admin role (never assignable by bulk import)
 * off the list.
 */
export async function downloadEmployeeTemplate(
  roles: { code: string; name: string }[],
  orgUnits: { code: string; name: string }[],
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();

  const sheet = wb.addWorksheet("Employees");
  sheet.columns = EMPLOYEE_HEADERS.map((header) => ({
    header,
    width: Math.max(header.length + 4, 18),
  }));
  sheet.addRow([
    "EMP1001",
    "Jane Doe",
    "jane.doe@example.com",
    roles[0]?.code ?? "",
    orgUnits[0]?.code ?? "",
  ]);

  const refSheet = wb.addWorksheet("Valid codes");
  refSheet.columns = [{ width: 24 }, { width: 40 }];
  refSheet.addRow(["Role code", "Role name"]);
  roles.forEach((r) => refSheet.addRow([r.code, r.name]));
  const lastRoleRow = refSheet.rowCount;
  refSheet.addRow(["", ""]);
  refSheet.addRow(["Organization Scope code", "Name"]);
  orgUnits.forEach((o) => refSheet.addRow([o.code, o.name]));

  const roleColumnIndex = EMPLOYEE_HEADERS.indexOf("Role") + 1;
  for (let row = 2; row <= MAX_IMPORT_ROWS + 1; row++) {
    sheet.getCell(row, roleColumnIndex).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`'Valid codes'!$A$2:$A$${lastRoleRow}`],
      showErrorMessage: true,
      errorTitle: "Invalid role",
      error: "Pick a role from the dropdown list.",
    };
  }

  triggerDownload(await wb.xlsx.writeBuffer(), "employee-bulk-import-template.xlsx");
}

export const ORG_UNIT_HEADERS = ["Code", "Name", "Type"] as const;

export function downloadOrgUnitTemplate(
  parentName: string,
  childTypes: { value: string; label: string }[],
) {
  const wb = sheetWithReference(
    "New org units",
    [...ORG_UNIT_HEADERS],
    ["PRJ-NEW", "New Project", childTypes[0]?.value ?? ""],
    [
      [`Direct children of "${parentName}" only`, ""],
      ["Type value", "Label"],
      ...childTypes.map((t) => [t.value, t.label]),
    ],
  );
  downloadWorkbook(wb, "org-unit-bulk-import-template.xlsx");
}

/** Same download-link trick as the audit trail's CSV export (app/admin/audit-trail/audit-view.tsx). */
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const cell = (v: unknown) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map((r) => r.map(cell).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Reads the first sheet's rows, keyed by trimmed header text. Blank trailing rows are dropped. */
export async function parseSheetRows(file: File): Promise<Record<string, string>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return rows
    .map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key.trim(), String(value).trim()]),
      ),
    )
    .filter((row) => Object.values(row).some((v) => v !== ""));
}
