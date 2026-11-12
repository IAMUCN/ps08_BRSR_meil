// The employee register (.grill/role-dashboard-decisions.md, "Employee register: decided"): HR uploads an
// Excel register, the server turns it into totals once and keeps only the totals; the file itself stays as
// private evidence. Pure — no database, no server imports — so the rules are unit-tested.
//
// What the totals feed (SEBI BRSR / BRSR Core):
//   A-20  employees and workers by gender, permanent or other, and differently abled;
//   A-22  turnover rate of permanent employees and workers, by gender;
//   P5-E3(b)  gross wages paid to women as % of all wages (Core);
//   P8-E5     wages paid in smaller towns as % of total wage cost (Core).
// Percentages and rates are always recomputed from summed counts, never averaged.

export type Gender = "male" | "female" | "other";
export type Category = "employee" | "worker";
export type Employment = "permanent" | "other";
export type Place = "rural" | "semi_urban" | "urban" | "metro";

export const GENDERS: Gender[] = ["male", "female", "other"];
export const CATEGORIES: Category[] = ["employee", "worker"];
export const EMPLOYMENTS: Employment[] = ["permanent", "other"];

export type RegisterRow = {
  employeeId: string;
  /** Only for the account-status view, read from the file each time; never saved with the totals. */
  name: string | null;
  gender: Gender;
  category: Category;
  employment: Employment;
  differentlyAbled: boolean;
  /** ISO dates (YYYY-MM-DD); null when the register leaves them blank. */
  joined: string | null;
  left: string | null;
  /** Gross wages for the financial year, in ₹; null when blank. */
  wage: number | null;
  place: Place | null;
};

/** A row the register cannot use, by sheet row number (the header is row 1). */
export type RowProblem = { row: number; reason: string };

type ColumnKey =
  | "employeeId"
  | "name"
  | "gender"
  | "category"
  | "employment"
  | "differentlyAbled"
  | "joined"
  | "left"
  | "wage"
  | "place";

/** The template's columns, in order, with the other spellings a register may use. */
export const REGISTER_COLUMNS: {
  key: ColumnKey;
  header: string;
  aliases: string[];
  required: boolean;
}[] = [
  {
    key: "employeeId",
    header: "Employee ID",
    aliases: ["emp id", "employee code", "emp code", "id"],
    required: true,
  },
  { key: "name", header: "Name", aliases: ["employee name"], required: false },
  { key: "gender", header: "Gender", aliases: ["sex"], required: true },
  {
    key: "category",
    header: "Category",
    aliases: ["employee category", "employee or worker", "worker or employee"],
    required: true,
  },
  {
    key: "employment",
    header: "Employment type",
    aliases: ["employment", "permanent or other", "contract type", "type of employment"],
    required: true,
  },
  {
    key: "differentlyAbled",
    header: "Differently abled",
    aliases: ["disability", "pwd", "differently-abled"],
    required: false,
  },
  {
    key: "joined",
    header: "Date of joining",
    aliases: ["joining date", "doj", "joined"],
    required: false,
  },
  {
    key: "left",
    header: "Date of leaving",
    aliases: ["leaving date", "dol", "date of exit", "exit date", "left"],
    required: false,
  },
  {
    key: "wage",
    header: "Gross wages for the year",
    aliases: ["gross wages", "annual wages", "wages", "annual salary", "salary"],
    required: false,
  },
  {
    key: "place",
    header: "Place of employment",
    aliases: ["location type", "place type", "place"],
    required: false,
  },
];

const fold = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Which sheet header holds each column; headers are matched ignoring case, punctuation and spacing. */
function matchHeaders(headers: string[]): Partial<Record<ColumnKey, string>> {
  const found: Partial<Record<ColumnKey, string>> = {};
  for (const column of REGISTER_COLUMNS) {
    const wanted = [column.header, ...column.aliases].map(fold);
    const hit = headers.find((h) => wanted.includes(fold(h)));
    if (hit !== undefined) found[column.key] = hit;
  }
  return found;
}

// --- Cell readers ------------------------------------------------------------------------------------------

export function readGender(value: string): Gender | null {
  const v = fold(value);
  if (["m", "male", "man"].includes(v)) return "male";
  if (["f", "female", "woman"].includes(v)) return "female";
  if (["o", "other", "others", "transgender", "third gender", "non binary"].includes(v))
    return "other";
  return null;
}

export function readCategory(value: string): Category | null {
  const v = fold(value);
  if (["employee", "employees", "staff", "executive"].includes(v)) return "employee";
  if (["worker", "workers", "workman", "labour", "labor"].includes(v)) return "worker";
  return null;
}

export function readEmployment(value: string): Employment | null {
  const v = fold(value);
  if (v === "") return null;
  if (["permanent", "regular", "permanent employee"].includes(v)) return "permanent";
  if (
    /(contract|temporary|temp|casual|fixed term|non permanent|other than permanent|other|trainee|apprentice|daily wage)/.test(
      v,
    )
  )
    return "other";
  return null;
}

export function readYesNo(value: string): boolean | null {
  const v = fold(value);
  if (["", "no", "n", "false", "0", "na", "nil"].includes(v)) return false;
  if (["yes", "y", "true", "1"].includes(v)) return true;
  return null;
}

export function readPlace(value: string): Place | null | undefined {
  const v = fold(value);
  if (v === "") return null;
  if (v === "rural") return "rural";
  if (["semi urban", "semiurban"].includes(v)) return "semi_urban";
  if (v === "urban") return "urban";
  if (["metro", "metropolitan", "metropolitan city"].includes(v)) return "metro";
  return undefined; // not recognised
}

/** ISO date from an Excel serial number, dd-mm-yyyy, dd/mm/yyyy or yyyy-mm-dd; null for blank, undefined if bad. */
export function readDate(value: string): string | null | undefined {
  const v = value.trim();
  if (v === "") return null;
  const valid = (y: number, m: number, d: number) => {
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
      ? `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      : undefined;
  };
  if (/^\d{5}$/.test(v)) {
    // Excel's day count, from 1899-12-30 (the 1900 leap-year bug is already folded into that epoch).
    const date = new Date(Date.UTC(1899, 11, 30) + Number(v) * 86_400_000);
    return date.toISOString().slice(0, 10);
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(v);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(v);
  if (m) return valid(Number(m[3]), Number(m[2]), Number(m[1]));
  return undefined;
}

export function readAmount(value: string): number | null | undefined {
  const v = value.replace(/[₹,\s]|inr|rs\.?/gi, "");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

// --- Reading a sheet ---------------------------------------------------------------------------------------

export type ReadResult = {
  rows: RegisterRow[];
  problems: RowProblem[];
  /** Required columns the sheet does not have; nothing is read when any is missing. */
  missingColumns: string[];
};

/** Turns the sheet's rows (header text -> cell text, as lib/bulk-import/xlsx.ts parseSheetRows gives) into register rows. */
export function readRegisterRows(sheet: Record<string, string>[]): ReadResult {
  const headers = [...new Set(sheet.flatMap((r) => Object.keys(r)))];
  const at = matchHeaders(headers);
  const missingColumns = REGISTER_COLUMNS.filter((c) => c.required && !at[c.key]).map(
    (c) => c.header,
  );
  if (missingColumns.length > 0) return { rows: [], problems: [], missingColumns };

  const cell = (raw: Record<string, string>, key: ColumnKey) => {
    const header = at[key];
    return header === undefined ? "" : (raw[header] ?? "");
  };
  const rows: RegisterRow[] = [];
  const problems: RowProblem[] = [];
  const seen = new Set<string>();
  sheet.forEach((raw, index) => {
    const row = index + 2; // the header is sheet row 1
    const bad = (reason: string) => problems.push({ row, reason });
    const employeeId = cell(raw, "employeeId").trim();
    if (employeeId === "") return bad("Employee ID is empty.");
    if (seen.has(employeeId.toLowerCase())) return bad(`Employee ID ${employeeId} appears twice.`);
    seen.add(employeeId.toLowerCase());

    const gender = readGender(cell(raw, "gender"));
    if (!gender) return bad(`Gender "${cell(raw, "gender")}" is not Male, Female or Other.`);
    const category = readCategory(cell(raw, "category"));
    if (!category) return bad(`Category "${cell(raw, "category")}" is not Employee or Worker.`);
    const employment = readEmployment(cell(raw, "employment"));
    if (!employment)
      return bad(
        `Employment type "${cell(raw, "employment")}" is not Permanent or Other than permanent.`,
      );
    const differentlyAbled = readYesNo(cell(raw, "differentlyAbled"));
    if (differentlyAbled === null) return bad("Differently abled must be Yes or No.");
    const joined = readDate(cell(raw, "joined"));
    if (joined === undefined) return bad(`Date of joining "${cell(raw, "joined")}" is not a date.`);
    const left = readDate(cell(raw, "left"));
    if (left === undefined) return bad(`Date of leaving "${cell(raw, "left")}" is not a date.`);
    if (joined && left && left < joined)
      return bad("Date of leaving is before the date of joining.");
    const wage = readAmount(cell(raw, "wage"));
    if (wage === undefined) return bad(`Gross wages "${cell(raw, "wage")}" is not an amount.`);
    const place = readPlace(cell(raw, "place"));
    if (place === undefined)
      return bad(
        `Place of employment "${cell(raw, "place")}" is not Rural, Semi-urban, Urban or Metropolitan.`,
      );

    rows.push({
      employeeId,
      name: cell(raw, "name").trim() || null,
      gender,
      category,
      employment,
      differentlyAbled,
      joined,
      left,
      wage,
      place,
    });
  });
  return { rows, problems, missingColumns: [] };
}

// --- The totals --------------------------------------------------------------------------------------------

export type GenderCounts = { male: number; female: number; other: number; total: number };

export type RegisterTotals = {
  financialYear: number;
  /** Headcount is as at this date (31 March). */
  asAt: string;
  people: number;
  headcount: Record<
    Category,
    Record<Employment, GenderCounts & { differentlyAbled: GenderCounts }>
  >;
  /** Permanent employees and workers: at the start of the year, at the end, and who left during it. */
  permanent: Record<
    Category,
    { opening: GenderCounts; closing: GenderCounts; leavers: GenderCounts }
  >;
  wages: {
    total: number;
    female: number;
    /** Rural and semi-urban places (RBI classification). */
    smallerTowns: number;
    rowsWithWage: number;
    rowsWithoutWage: number;
    rowsWithPlace: number;
  };
};

const zero = (): GenderCounts => ({ male: 0, female: 0, other: 0, total: 0 });
const bump = (counts: GenderCounts, gender: Gender) => {
  counts[gender] += 1;
  counts.total += 1;
};
const addCounts = (a: GenderCounts, b: GenderCounts): GenderCounts => ({
  male: a.male + b.male,
  female: a.female + b.female,
  other: a.other + b.other,
  total: a.total + b.total,
});

export function emptyTotals(financialYear: number): RegisterTotals {
  const byEmployment = () => ({
    permanent: { ...zero(), differentlyAbled: zero() },
    other: { ...zero(), differentlyAbled: zero() },
  });
  const permanent = () => ({ opening: zero(), closing: zero(), leavers: zero() });
  return {
    financialYear,
    asAt: `${financialYear + 1}-03-31`,
    people: 0,
    headcount: { employee: byEmployment(), worker: byEmployment() },
    permanent: { employee: permanent(), worker: permanent() },
    wages: {
      total: 0,
      female: 0,
      smallerTowns: 0,
      rowsWithWage: 0,
      rowsWithoutWage: 0,
      rowsWithPlace: 0,
    },
  };
}

/**
 * The totals for one financial year (April to March; `financialYear` is the year it starts in). A person is
 * counted at a date when they had joined by it and had not left. A blank joining date reads as "joined
 * before"; a blank leaving date as "still employed".
 */
export function computeRegister(rows: RegisterRow[], financialYear: number): RegisterTotals {
  const start = `${financialYear}-04-01`;
  const before = `${financialYear}-03-31`;
  const end = `${financialYear + 1}-03-31`;
  const employedOn = (r: RegisterRow, day: string) =>
    (r.joined === null || r.joined <= day) && (r.left === null || r.left > day);
  const totals = emptyTotals(financialYear);
  totals.people = rows.length;

  for (const r of rows) {
    if (employedOn(r, end)) {
      const cell = totals.headcount[r.category][r.employment];
      bump(cell, r.gender);
      if (r.differentlyAbled) bump(cell.differentlyAbled, r.gender);
    }
    if (r.employment === "permanent") {
      const p = totals.permanent[r.category];
      if (employedOn(r, before)) bump(p.opening, r.gender);
      if (employedOn(r, end)) bump(p.closing, r.gender);
      if (
        r.left !== null &&
        r.left >= start &&
        r.left <= end &&
        (r.joined === null || r.joined <= r.left)
      )
        bump(p.leavers, r.gender);
    }
    // Wages are those of anyone employed at some time in the year.
    const during = (r.joined === null || r.joined <= end) && (r.left === null || r.left >= start);
    if (during) {
      if (r.wage === null) totals.wages.rowsWithoutWage += 1;
      else {
        totals.wages.rowsWithWage += 1;
        totals.wages.total += r.wage;
        if (r.gender === "female") totals.wages.female += r.wage;
        if (r.place === "rural" || r.place === "semi_urban") totals.wages.smallerTowns += r.wage;
        if (r.place !== null) totals.wages.rowsWithPlace += 1;
      }
    }
  }
  return totals;
}

/** Adds registers together: a unit's figure is the sum of its children's. Same financial year only. */
export function sumTotals(list: RegisterTotals[], financialYear: number): RegisterTotals {
  const out = emptyTotals(financialYear);
  for (const t of list) {
    if (t.financialYear !== financialYear) continue;
    out.people += t.people;
    for (const c of CATEGORIES) {
      for (const e of EMPLOYMENTS) {
        const a = out.headcount[c][e];
        const b = t.headcount[c][e];
        out.headcount[c][e] = {
          ...addCounts(a, b),
          differentlyAbled: addCounts(a.differentlyAbled, b.differentlyAbled),
        };
      }
      const a = out.permanent[c];
      const b = t.permanent[c];
      out.permanent[c] = {
        opening: addCounts(a.opening, b.opening),
        closing: addCounts(a.closing, b.closing),
        leavers: addCounts(a.leavers, b.leavers),
      };
    }
    for (const k of Object.keys(out.wages) as (keyof RegisterTotals["wages"])[]) {
      out.wages[k] += t.wages[k];
    }
  }
  return out;
}

/** Turnover rate, %: leavers over the average of opening and closing headcount; null when there is no one. */
export function turnoverRate(leavers: number, opening: number, closing: number): number | null {
  const average = (opening + closing) / 2;
  return average > 0 ? (leavers / average) * 100 : null;
}

/** A share, %: null when the whole is zero (never a 0 % that means "nothing to measure"). */
export function share(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}
