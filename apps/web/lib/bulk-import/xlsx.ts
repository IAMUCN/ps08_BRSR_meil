// Client-side .xlsx template/parse helpers for bulk import (bulk-import-decisions.md). Browser-only —
// no file ever needs to reach the server as bytes; parsed rows go to the tRPC mutation as JSON, which
// re-validates everything server-side (never trust client-parsed input).
import type { Worksheet } from "exceljs";
import * as XLSX from "xlsx";
import { csvSafeText } from "../csv.ts";
import {
  BUSINESS_UNIT_LEVEL,
  PROJECT_LEVEL,
  SUBSIDIARY_LEVEL,
  singleParent,
  tidy,
} from "../org/rules.ts";

function triggerDownload(bytes: BlobPart, filename: string) {
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Matches the server's bulk-import row cap (the bulkImport inputs in lib/trpc/routers).
const MAX_IMPORT_ROWS = 500;

/** A table's heading row: bold on a tint, so it reads as a heading in any spreadsheet program. */
function heading(sheet: Worksheet, rowNumber: number, columns: number) {
  for (let column = 1; column <= columns; column++) {
    const cell = sheet.getCell(rowNumber, column);
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4E6F1" } };
    cell.alignment = { vertical: "middle" };
  }
}

/** The sheet people type into: styled headings, kept in view while scrolling, and nothing else in it. */
function dataSheet(sheet: Worksheet, columns: { header: string; width: number }[]) {
  sheet.columns = columns;
  heading(sheet, 1, columns.length);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

/** A list where the hierarchy shows: each level is indented under its parent. */
const indented = (name: string, depth: number) => `${"    ".repeat(depth)}${name}`;

function dropdown(sheet: Worksheet, column: number, range: string, title: string, error: string) {
  for (let row = 2; row <= MAX_IMPORT_ROWS + 1; row++) {
    sheet.getCell(row, column).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [range],
      showErrorMessage: true,
      errorTitle: title,
      error,
    };
  }
}

// --- Employees ---------------------------------------------------------------------------------------------

export const EMPLOYEE_HEADERS = [
  "Employee ID",
  "Name",
  "Email",
  "Role",
  "Organization Scope",
] as const;

/**
 * The org unit an Organization Scope cell names: its code, or its name for a unit that has no code; the
 * server resolves either. A sheet from an earlier template may still say "Name — id:…", read as "id:…".
 */
export function scopeRefOf(cell: string): string {
  const id = /id:([0-9a-f-]{36}) *$/i.exec(cell)?.[1];
  return id ? `id:${id}` : cell;
}

export type ScopeOption = {
  code: string;
  name: string;
  /** The level's name, the parent's code and the depth in the tree, when the server supplied them. */
  level?: string;
  parentCode?: string | null;
  depth?: number;
};

/**
 * The plain "xlsx" package (SheetJS Community Edition) can read data validation but has no
 * write support for it, so the dropdowns need "exceljs" instead — the only already-reasonable
 * way to ship a real in-cell dropdown that keeps the Admin role (never assignable by bulk import)
 * off the list.
 *
 * `orgUnits` arrives in tree order, so the reference sheet reads as the organization hierarchy does today.
 * The first sheet holds headings only: an example row left in by mistake would become a real account.
 */
export async function downloadEmployeeTemplate(
  roles: { code: string; name: string }[],
  orgUnits: ScopeOption[],
  withoutCode: string[] = [],
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();

  const sheet = wb.addWorksheet("Employees");
  dataSheet(
    sheet,
    EMPLOYEE_HEADERS.map((header) => ({
      header,
      width: header === "Email" ? 34 : header === "Organization Scope" ? 48 : 24,
    })),
  );

  const help = wb.addWorksheet("How to fill in");
  help.columns = [{ width: 24 }, { width: 24 }, { width: 34 }, { width: 24 }, { width: 24 }];
  for (const line of [
    'Fill the "Employees" sheet, one person per row, starting on row 2. Keep the headings as they are.',
    "Role and Organization Scope are dropdowns. They take the values listed on the next two sheets.",
    "An org unit that has no code is listed by its name; pick it from the list as it is.",
    "Organization Scope is the org unit the person works at; they see that unit and everything beneath it.",
    "Employee ID, Name and Email are all required. An employee ID and an email can each be used only once.",
    `At most ${MAX_IMPORT_ROWS} rows per sheet. Each row is created by itself: one bad row does not stop the others.`,
    "",
    "Example (do not copy the values):",
  ]) {
    help.addRow([line]);
  }
  help.addRow([...EMPLOYEE_HEADERS]);
  heading(help, help.rowCount, EMPLOYEE_HEADERS.length);
  help.addRow([
    "EMP1001",
    "Jane Doe",
    "jane.doe@example.com",
    roles[0]?.code ?? "",
    orgUnits[0]?.code ?? "",
  ]);

  const roleSheet = wb.addWorksheet("Roles");
  roleSheet.columns = [{ width: 28 }, { width: 40 }];
  roleSheet.addRow(["Role code", "Role name"]);
  heading(roleSheet, 1, 2);
  roles.forEach((r) => roleSheet.addRow([r.code, r.name]));

  const orgSheet = wb.addWorksheet("Organization");
  orgSheet.columns = [{ width: 52 }, { width: 48 }, { width: 22 }, { width: 24 }];
  orgSheet.addRow([
    "Organization Scope (use this value)",
    "Org unit (indented under its parent)",
    "Level",
    "Under",
  ]);
  heading(orgSheet, 1, 4);
  orgUnits.forEach((o) =>
    orgSheet.addRow([o.code, indented(o.name, o.depth ?? 0), o.level ?? "", o.parentCode ?? ""]),
  );
  const lastOrgRow = orgSheet.rowCount;
  if (withoutCode.length > 0) {
    orgSheet.addRow([]);
    orgSheet.addRow([
      "Not listed: these org units have no code, so a sheet cannot name them. Give them a code on the Organization page first.",
    ]);
    withoutCode.forEach((name) => orgSheet.addRow(["", name]));
  }

  dropdown(
    sheet,
    EMPLOYEE_HEADERS.indexOf("Role") + 1,
    `'Roles'!$A$2:$A$${Math.max(2, roleSheet.rowCount)}`,
    "Invalid role",
    'Pick a role code from the dropdown list (see the "Roles" sheet).',
  );
  if (orgUnits.length > 0) {
    dropdown(
      sheet,
      EMPLOYEE_HEADERS.indexOf("Organization Scope") + 1,
      `'Organization'!$A$2:$A$${lastOrgRow}`,
      "Invalid organization scope",
      'Pick an organization scope code from the dropdown list (see the "Organization" sheet).',
    );
  }

  triggerDownload(await wb.xlsx.writeBuffer(), "employee-bulk-import-template.xlsx");
}

// --- Org units ---------------------------------------------------------------------------------------------

export const ORG_UNIT_HEADERS = ["Code", "Name", "Level", "Parent code"] as const;
/**
 * A Parent code picked from the template's list reads "CODE — Name" so a person can recognise the unit; only
 * the part before this separator is the code. A code cannot contain it (letters, digits, - and _ only).
 */
export const PARENT_SEPARATOR = " — ";
/**
 * The parent a cell names. Picked from the list it is "CODE — Name", or just the name for an org unit that
 * has no code (the server matches it by name); typed by hand it is a bare code. A sheet from an earlier
 * template may still say "Name — id:…".
 */
export function parentOf(cell: string): { parentCode: string; parentId?: string } {
  const id = /id:([0-9a-f-]{36}) *$/i.exec(cell)?.[1];
  return id
    ? { parentCode: "", parentId: id }
    : { parentCode: tidy(cell.split(PARENT_SEPARATOR)[0]) };
}
/**
 * Every parent a Parent code cell names (owner's page feedback, 2026-10-11): any number of them in the one
 * cell, separated by commas (a semicolon or a line break is read too). Spaces around a name do not matter.
 * The first is where the unit is created; the rest are the parents it also sits under.
 *
 * A unit with no code is named by its name, and a name may itself hold a comma ("Seetharampur plant,
 * Telangana"). So the pieces between commas are put back together wherever they spell an existing unit's
 * name — the longest such name first.
 */
export function parentsOf(
  cell: string,
  /** Names of the org units that exist, to recognise a name that holds a comma. */
  knownNames: readonly string[] = [],
): {
  parentCode: string;
  parentId?: string;
  alsoUnder: string[];
} {
  // Commas compared without the spaces around them, so "plant , Telangana" is "plant, Telangana".
  const key = (value: string) => tidy(value).toLowerCase().replace(/ ?, ?/g, ",");
  const known = new Set(knownNames.map(key));
  const pieces = cell.split(/[,;\n]/).map(tidy);
  const parents: { parentCode: string; parentId?: string }[] = [];
  for (let at = 0; at < pieces.length;) {
    let end = at + 1;
    for (let last = pieces.length; last > at + 1; last--) {
      if (known.has(key(pieces.slice(at, last).join(",")))) {
        end = last;
        break;
      }
    }
    // A value picked from the list reads "CODE — Name": whatever follows the code is its name, commas too.
    const text = pieces.slice(at, end).join(", ");
    if (end === at + 1 && text.includes(PARENT_SEPARATOR)) {
      const next = pieces.findIndex((piece, i) => i > at && piece.includes(PARENT_SEPARATOR));
      const stop = next < 0 ? pieces.length : next;
      // Only when the pieces up to the next picked value are not themselves known codes or names.
      if (
        !pieces.slice(at + 1, stop).some((piece) => known.has(key(piece)) || /^[\w-]+$/.test(piece))
      ) {
        end = stop;
      }
    }
    const one = parentOf(pieces.slice(at, end).join(", "));
    if (one.parentCode || one.parentId) parents.push(one);
    at = end;
  }
  const [first = { parentCode: "" }, ...others] = parents;
  return {
    ...first,
    // Naming the same parent twice is one parent.
    alsoUnder: [
      ...new Set(others.map((p) => p.parentCode).filter((p) => p && p !== first.parentCode)),
    ],
  };
}
/**
 * Two columns the template had for an hour on 2026-10-11, one further parent in each; still read.
 */
export const MORE_PARENT_HEADERS = ["Parent code 2", "Parent code 3"] as const;
/** A column one day's template had for the further parents (2026-10-11); still read, as a list of codes. */
export const LEGACY_ALSO_UNDER_HEADER = "Also under";
/** The heading the Level column had before the sheet could hold a whole tree; still read. */
export const LEGACY_LEVEL_HEADER = "Type";

export type ExistingUnit = {
  id: string;
  code: string | null;
  name: string;
  level: string;
  parentCode: string | null;
  depth: number;
};

/**
 * One sheet for a whole branch of the organization: a row names its parent by code — an org unit that
 * exists already, or another row of the same sheet — and a row with no parent goes directly under the unit
 * chosen on screen. Levels and existing units are written as they are configured at the moment of download.
 */
export async function downloadOrgUnitTemplate(
  parent: { name: string; code: string | null; level: string },
  /** The levels that can sit beneath the chosen unit, in hierarchy order. */
  levels: { code: string; label: string }[],
  /** Org units the person may add under, in tree order. */
  existing: ExistingUnit[],
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();

  const sheet = wb.addWorksheet("New org units");
  dataSheet(sheet, [
    { header: ORG_UNIT_HEADERS[0], width: 20 },
    { header: ORG_UNIT_HEADERS[1], width: 40 },
    { header: ORG_UNIT_HEADERS[2], width: 24 },
    { header: ORG_UNIT_HEADERS[3], width: 44 },
  ]);

  const help = wb.addWorksheet("How to fill in");
  help.columns = [{ width: 20 }, { width: 40 }, { width: 24 }, { width: 22 }, { width: 60 }];
  for (const line of [
    'Fill the "New org units" sheet, one org unit per row, starting on row 2. Keep the headings as they are.',
    "The structure: Group → Subsidiary → Business Unit → Project (then Site, Department). Each business unit belongs to exactly one subsidiary; each project sits under a business unit (a project two business units run lists both). The Hierarchy sheet says which parent each level takes.",
    `Parent code left empty: the row is created directly under "${parent.name}" (${parent.level}), the unit chosen on screen.`,
    "Parent code filled in: pick an org unit that exists already from the cell's dropdown list, or type the Code of another row in this sheet (the list is only a suggestion, so typing is allowed). An org unit that has no code can be picked from the list too; it is listed by its name. That is how one sheet builds several levels at once; the order of the rows does not matter.",
    "A unit with more than one parent, such as a project two business units run: write every parent in the one Parent code cell, separated by commas, for example BU-A, BU-B. As many as it has. Spaces before or after a name do not matter. (The dropdown fills in one value; type a comma and the next code after it.) The unit then sits under each of them, and its figures count in full in every parent and once in the group above them. Moving or deactivating it later is done from the first parent listed.",
    "Level is a dropdown of the levels configured today. A unit's level must come after its parent's level; levels may be skipped, except that a business unit sits directly under a subsidiary (one subsidiary only, never shared) and a project sits under a business unit.",
    "Code is letters, numbers, hyphens and underscores, and must be new. It is required for a row that other rows name as their parent.",
    `At most ${MAX_IMPORT_ROWS} rows per sheet. A row whose parent could not be created is not created either; the results say which.`,
    "",
    "Example (do not copy the values):",
  ]) {
    help.addRow([line]);
  }
  help.addRow([...ORG_UNIT_HEADERS, "What it does"]);
  heading(help, help.rowCount, ORG_UNIT_HEADERS.length + 1);
  const has = (code: string) => levels.some((l) => l.code === code);
  const label = (code: string) => levels.find((l) => l.code === code)?.label ?? code;
  if (has(BUSINESS_UNIT_LEVEL) && has(PROJECT_LEVEL)) {
    // Subsidiary → business units → projects (owner's structure, 2026-11-12).
    const withSubsidiary = has(SUBSIDIARY_LEVEL);
    const bu = label(BUSINESS_UNIT_LEVEL);
    const project = label(PROJECT_LEVEL);
    if (withSubsidiary) {
      help.addRow([
        "EX-SUB",
        `Example ${label(SUBSIDIARY_LEVEL)}`,
        SUBSIDIARY_LEVEL,
        "",
        `A ${label(SUBSIDIARY_LEVEL)} directly under ${parent.name}`,
      ]);
    }
    const buParent = withSubsidiary ? "EX-SUB" : "";
    const buWhere = withSubsidiary ? "the subsidiary above" : parent.name;
    help.addRow([
      "EX-BU-1",
      `Example ${bu}`,
      BUSINESS_UNIT_LEVEL,
      buParent,
      `A ${bu} under ${buWhere}: one parent only`,
    ]);
    help.addRow([
      "EX-BU-2",
      `Second ${bu}`,
      BUSINESS_UNIT_LEVEL,
      buParent,
      `Another ${bu} under ${buWhere}`,
    ]);
    help.addRow([
      "EX-PRJ-1",
      `Example ${project}`,
      PROJECT_LEVEL,
      "EX-BU-1",
      `A ${project} under the first ${bu}`,
    ]);
    help.addRow([
      "EX-PRJ-2",
      `Shared ${project}`,
      PROJECT_LEVEL,
      "EX-BU-1, EX-BU-2",
      `A ${project} under both rows above: it counts in each`,
    ]);
  } else if (levels[0]) {
    const [first, second] = levels;
    help.addRow([
      "EX-A",
      `Example ${first.label}`,
      first.code,
      "",
      `A ${first.label} directly under ${parent.name}`,
    ]);
    const below = second ?? first;
    if (second) {
      help.addRow([
        "EX-A-1",
        `Example ${below.label}`,
        below.code,
        "EX-A",
        `A ${below.label} under the row above`,
      ]);
      help.addRow(["EX-C", `Second ${first.label}`, first.code, "", "Another row of the sheet"]);
      if (!singleParent(below.code))
        help.addRow([
          "EX-A-2",
          `Shared ${below.label}`,
          below.code,
          "EX-A, EX-C",
          `A ${below.label} with two parents: EX-A and EX-C`,
        ]);
    }
    const deeper = existing.find((u) => u.code && u.code !== parent.code);
    if (deeper?.code && second) {
      help.addRow([
        "EX-B",
        `Another ${below.label}`,
        below.code,
        deeper.code,
        `Under the existing org unit ${deeper.name.trim()}, if its level comes before ${below.label}`,
      ]);
    }
  }

  const ref = wb.addWorksheet("Hierarchy");
  ref.columns = [{ width: 24 }, { width: 48 }, { width: 22 }, { width: 24 }];
  ref.addRow([`Levels that can be added beneath ${parent.name}, in order`]);
  ref.addRow(["Level (use this value)", "Level name", "Its parent"]);
  heading(ref, 2, 3);
  levels.forEach((l) =>
    ref.addRow([
      l.code,
      l.label,
      l.code === BUSINESS_UNIT_LEVEL && has(SUBSIDIARY_LEVEL)
        ? `One ${label(SUBSIDIARY_LEVEL)} only`
        : l.code === PROJECT_LEVEL && has(BUSINESS_UNIT_LEVEL)
          ? `${label(BUSINESS_UNIT_LEVEL)} (one or more), or a later level such as ${label("region")}`
          : "Any unit at an earlier level",
    ]),
  );
  const lastLevelRow = Math.max(3, ref.rowCount);
  ref.addRow([]);
  ref.addRow(["Org units that exist today (use the code as a Parent code)"]);
  ref.addRow(["Code", "Org unit (indented under its parent)", "Level", "Under"]);
  heading(ref, ref.rowCount, 4);
  existing.forEach((u) =>
    ref.addRow([u.code ?? "(no code)", indented(u.name, u.depth), u.level, u.parentCode ?? ""]),
  );

  dropdown(
    sheet,
    ORG_UNIT_HEADERS.indexOf("Level") + 1,
    `'Hierarchy'!$A$3:$A$${lastLevelRow}`,
    "Invalid level",
    'Pick a level from the dropdown list (see the "Hierarchy" sheet).',
  );

  // Parent code: a list of the org units that exist today to pick from. It only suggests — no error on
  // another value — because a parent may also be a row of this sheet that does not exist yet.
  // Every existing unit can be picked, with or without a code.
  const parents = existing;
  ref.getColumn(6).width = 52;
  ref.getCell(1, 6).value = "Parent code choices (the list in the Parent code column)";
  ref.getCell(1, 6).font = { bold: true };
  parents.forEach((u, index) => {
    ref.getCell(index + 2, 6).value = u.code ? `${u.code}${PARENT_SEPARATOR}${u.name}` : u.name;
  });
  if (parents.length > 0) {
    const parentColumn = ORG_UNIT_HEADERS.indexOf("Parent code") + 1;
    for (let row = 2; row <= MAX_IMPORT_ROWS + 1; row++) {
      sheet.getCell(row, parentColumn).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`'Hierarchy'!$F$2:$F$${parents.length + 1}`],
        showErrorMessage: false,
        showInputMessage: true,
        promptTitle: "Parent",
        prompt:
          `Pick an existing org unit, or type the Code of another row. Several parents: write them all here with commas between. Empty = under ${parent.name}.`.slice(
            0,
            250,
          ),
      };
    }
  }

  triggerDownload(await wb.xlsx.writeBuffer(), "org-unit-bulk-import-template.xlsx");
}

export type HierarchyUnit = {
  code: string | null;
  name: string;
  /** The level's code, as the Level column takes it. */
  level: string;
  /** How a sheet names each of its parents (code, or name when it has none), first the one it is managed from. */
  parents: string[];
};

/**
 * The organization as it stands, in the bulk-import sheet's own columns (owner's page feedback, 2026-10-11):
 * edit it — new codes, names, parents — and upload it under Add from a spreadsheet. Groups are not rows (a
 * sheet cannot create one); a unit directly under a group names that group as its parent. `units` arrives in
 * the order of the tree on screen, a shared unit once under each parent.
 */
export async function downloadOrgHierarchy(
  units: HierarchyUnit[],
  levels: { code: string; label: string }[],
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("New org units");
  dataSheet(sheet, [
    { header: ORG_UNIT_HEADERS[0], width: 20 },
    { header: ORG_UNIT_HEADERS[1], width: 44 },
    { header: ORG_UNIT_HEADERS[2], width: 24 },
    { header: ORG_UNIT_HEADERS[3], width: 44 },
  ]);
  // A shared unit is listed under each parent, every such row naming all its parents.
  units.forEach((u) => sheet.addRow([u.code ?? "", u.name, u.level, u.parents.join(", ")]));

  const help = wb.addWorksheet("How to use");
  help.columns = [{ width: 28 }, { width: 90 }];
  for (const line of [
    'The "New org units" sheet lists every org unit below group level as it stood when this file was exported, parents before their children.',
    "To use it as a template: change the codes and names, add or remove rows, then upload it on Organization, Add from a spreadsheet.",
    "A row whose Code already exists is refused (codes are unique), so uploading the sheet unchanged creates nothing. Rows without a code are created again.",
    "Parent code names the parent: a Code of an existing org unit or of another row; a unit with no code is named by its name. Empty means directly under the unit chosen on screen.",
    "A unit with more than one parent (a project two subsidiaries run) is listed under each of its parents, and each of those rows names every parent in Parent code, separated by commas, for example SUB-A, SUB-B. On upload, rows with the same Code, Name and Level are read as one unit; so are rows with no Code that have the same Name, Level and list of parents. What sits under a shared unit is listed once, under its first parent.",
    `At most ${MAX_IMPORT_ROWS} rows per upload.`,
    "",
  ]) {
    help.addRow([line]);
  }
  help.addRow(["Level (use this value)", "Level name"]);
  heading(help, help.rowCount, 2);
  levels.forEach((l) => help.addRow([l.code, l.label]));

  triggerDownload(await wb.xlsx.writeBuffer(), "organization-hierarchy.xlsx");
}

/** Same download-link trick as the audit trail's CSV export (app/admin/audit-trail/audit-view.tsx). */
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const cell = (v: unknown) => {
    const s = typeof v === "string" ? csvSafeText(v) : String(v);
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
