// SEBI's BRSR tables that no source document carries (owner's decision, 2026-11-13: typed tables with Excel
// import; .grill/brsr-gaps-decisions.md). Each is laid out as SEBI's format (July 2023) and L&T's report lay it
// out: rows, input columns, and derived cells (totals, percentages, days) the app works out. Pure: the editor,
// the Excel template, the server's checks and the report share it.

export type CellValue = number | string | null;
/** What was typed for one table and one financial year: row key -> column key -> value. */
export type Cells = Record<string, Record<string, CellValue>>;

export type Column = {
  key: string;
  label: string;
  /** number: a count or amount; percent: typed as a percentage; text: a word or short remark. */
  kind: "number" | "percent" | "text";
  /** Worked out from the row's other cells; never typed. */
  derive?: (row: (key: string) => number | null) => number | null;
};

export type Row = {
  key: string;
  label: string;
  /** A total row: each number column is the sum of these rows. Never typed. */
  sumOf?: string[];
  /** Typed only in the columns listed here (others are blank), e.g. a single-value row. */
  only?: string[];
};

export type Part = { key: string; title?: string; columns: Column[]; rows: Row[] };

export type TableDef = {
  code: string;
  title: string;
  parts: Part[];
  /** Financial years printed side by side in the report (SEBI asks for three for turnover rates). */
  years: 1 | 2 | 3;
};

const n = (key: string, label: string): Column => ({ key, label, kind: "number" });
const pct = (key: string, label: string): Column => ({ key, label, kind: "percent" });
const txt = (key: string, label: string): Column => ({ key, label, kind: "text" });
const share = (key: string, label: string, part: string, whole: string): Column => ({
  key,
  label,
  kind: "percent",
  derive: (row) => {
    const p = row(part);
    const w = row(whole);
    return p === null || w === null || w <= 0 ? null : (p / w) * 100;
  },
});
const total = (key: string, label: string, ...of: string[]): Column => ({
  key,
  label,
  kind: "number",
  derive: (row) => {
    const values = of.map(row);
    return values.every((v) => v === null)
      ? null
      : values.reduce<number>((a, v) => a + (v ?? 0), 0);
  },
});
const sum = (key: string, label: string, of: string[]): Row => ({ key, label, sumOf: of });
const r = (key: string, label: string, only?: string[]): Row => ({ key, label, only });

/** Permanent / other-than-permanent / total, for employees and for workers (A-20, P3-E1, P3-E8). */
const workforceRows = (prefix: "e" | "w", who: "employees" | "workers"): Row[] => [
  r(`${prefix}_perm`, `Permanent ${who}`),
  r(`${prefix}_other`, `Other than permanent ${who}`),
  sum(`${prefix}_total`, `Total ${who}`, [`${prefix}_perm`, `${prefix}_other`]),
];
const genderRows = (prefix: string, who: string): Row[] => [
  r(`${prefix}_m`, `${who} — male`),
  r(`${prefix}_f`, `${who} — female`),
  sum(`${prefix}_t`, `${who} — total`, [`${prefix}_m`, `${prefix}_f`]),
];
const genderColumns = [
  total("total", "Total (A)", "male", "female"),
  n("male", "Male No. (B)"),
  share("male_pct", "Male % (B / A)", "male", "total"),
  n("female", "Female No. (C)"),
  share("female_pct", "Female % (C / A)", "female", "total"),
];
const complaintColumns = [
  n("filed", "Filed during the year"),
  n("pending", "Pending resolution at the end of the year"),
  txt("remarks", "Remarks"),
];
const benefitColumns = [
  n("total", "Total (A)"),
  n("health", "Health insurance No. (B)"),
  share("health_pct", "% (B / A)", "health", "total"),
  n("accident", "Accident insurance No. (C)"),
  share("accident_pct", "% (C / A)", "accident", "total"),
  n("maternity", "Maternity benefits No. (D)"),
  share("maternity_pct", "% (D / A)", "maternity", "total"),
  n("paternity", "Paternity benefits No. (E)"),
  share("paternity_pct", "% (E / A)", "paternity", "total"),
  n("daycare", "Day care facilities No. (F)"),
  share("daycare_pct", "% (F / A)", "daycare", "total"),
];

export const BRSR_TABLES: TableDef[] = [
  {
    code: "A-18",
    title: "Number of locations where plants and/or operations/offices are situated",
    years: 1,
    parts: [
      {
        key: "main",
        columns: [
          n("plants", "Number of plants"),
          n("offices", "Number of offices"),
          total("total", "Total", "plants", "offices"),
        ],
        rows: [r("national", "National"), r("international", "International")],
      },
    ],
  },
  {
    code: "A-19",
    title: "Markets served by the entity",
    years: 1,
    parts: [
      {
        key: "main",
        columns: [n("value", "Number / %")],
        rows: [
          r("national", "National (No. of States)"),
          r("international", "International (No. of Countries)"),
          r("exports", "Contribution of exports as a percentage of total turnover (%)"),
        ],
      },
    ],
  },
  {
    code: "A-20",
    title:
      "Employees and workers (including differently abled), as at the end of the financial year",
    years: 1,
    parts: [
      {
        key: "all",
        title: "a. Employees and workers (including differently abled)",
        columns: genderColumns,
        rows: [...workforceRows("e", "employees"), ...workforceRows("w", "workers")],
      },
      {
        key: "disabled",
        title: "b. Differently abled employees and workers",
        columns: genderColumns,
        rows: [...workforceRows("e", "employees"), ...workforceRows("w", "workers")],
      },
    ],
  },
  {
    code: "A-21",
    title: "Participation / inclusion / representation of women",
    years: 1,
    parts: [
      {
        key: "main",
        columns: [
          n("total", "Total (A)"),
          n("female", "No. of females (B)"),
          share("female_pct", "% (B / A)", "female", "total"),
        ],
        rows: [r("board", "Board of Directors"), r("kmp", "Key Management Personnel")],
      },
    ],
  },
  {
    code: "A-22",
    title: "Turnover rate for permanent employees and workers",
    years: 3,
    parts: [
      {
        key: "main",
        columns: [pct("male", "Male (%)"), pct("female", "Female (%)"), pct("total", "Total (%)")],
        rows: [r("employees", "Permanent employees"), r("workers", "Permanent workers")],
      },
    ],
  },
  {
    code: "A-25",
    title: "Complaints / grievances on any of the principles (Principles 1 to 9)",
    years: 2,
    parts: [
      {
        key: "main",
        columns: [
          txt("mechanism", "Grievance redressal mechanism in place (Yes / No)"),
          ...complaintColumns,
        ],
        rows: [
          r("communities", "Communities"),
          r("investors", "Investors (other than shareholders)"),
          r("shareholders", "Shareholders"),
          r("employees", "Employees and workers"),
          r("customers", "Customers"),
          r("value_chain", "Value chain partners"),
          r("other", "Other (please specify)"),
        ],
      },
    ],
  },
  {
    code: "P1-E8",
    title: "Number of days of accounts payable",
    years: 2,
    parts: [
      {
        key: "main",
        columns: [
          n("payables", "Accounts payable (₹ crore)"),
          n("cost", "Cost of goods / services procured (₹ crore)"),
          {
            key: "days",
            label: "Number of days of accounts payable",
            kind: "number",
            derive: (row) => {
              const ap = row("payables");
              const cost = row("cost");
              return ap === null || cost === null || cost <= 0 ? null : (ap * 365) / cost;
            },
          },
        ],
        rows: [r("main", "(Accounts payable × 365) / Cost of goods / services procured")],
      },
    ],
  },
  {
    code: "P1-E9",
    title:
      "Open-ness of business: concentration of purchases, sales and related-party transactions",
    years: 2,
    parts: [
      {
        key: "main",
        columns: [n("value", "Value")],
        rows: [
          r("p_trading_pct", "Purchases from trading houses as % of total purchases"),
          r("p_trading_count", "Number of trading houses where purchases are made from"),
          r(
            "p_top10_pct",
            "Purchases from top 10 trading houses as % of total purchases from trading houses",
          ),
          r("s_dealers_pct", "Sales to dealers / distributors as % of total sales"),
          r("s_dealers_count", "Number of dealers / distributors to whom sales are made"),
          r(
            "s_top10_pct",
            "Sales to top 10 dealers / distributors as % of total sales to dealers / distributors",
          ),
          r("rpt_purchases", "Share of related-party transactions in purchases (%)"),
          r("rpt_sales", "Share of related-party transactions in sales (%)"),
          r("rpt_loans", "Share of related-party transactions in loans and advances (%)"),
          r("rpt_investments", "Share of related-party transactions in investments (%)"),
        ],
      },
    ],
  },
  {
    code: "P3-E1",
    title: "Measures for the well-being of employees and workers",
    years: 1,
    parts: [
      {
        key: "employees",
        title: "a. Well-being of employees",
        columns: benefitColumns,
        rows: [
          ...genderRows("ep", "Permanent employees"),
          ...genderRows("eo", "Other than permanent employees"),
        ],
      },
      {
        key: "workers",
        title: "b. Well-being of workers",
        columns: benefitColumns,
        rows: [
          ...genderRows("wp", "Permanent workers"),
          ...genderRows("wo", "Other than permanent workers"),
        ],
      },
      {
        key: "spending",
        title: "c. Spending on measures towards well-being of employees and workers",
        columns: [pct("value", "% of total revenue of the company")],
        rows: [r("main", "Cost incurred on well-being measures as a % of total revenue")],
      },
    ],
  },
  {
    code: "P3-E2",
    title: "Retirement benefits",
    years: 2,
    parts: [
      {
        key: "main",
        columns: [
          pct("employees", "No. of employees covered as a % of total employees"),
          pct("workers", "No. of workers covered as a % of total workers"),
          txt("deposited", "Deducted and deposited with the authority (Y / N / N.A.)"),
        ],
        rows: [
          r("pf", "PF"),
          r("gratuity", "Gratuity"),
          r("esi", "ESI"),
          r("others", "Others (please specify)"),
        ],
      },
    ],
  },
  {
    code: "P3-E5",
    title:
      "Return to work and retention rates of permanent employees and workers that took parental leave",
    years: 1,
    parts: [
      {
        key: "main",
        columns: [
          pct("e_return", "Permanent employees — return to work rate (%)"),
          pct("e_retention", "Permanent employees — retention rate (%)"),
          pct("w_return", "Permanent workers — return to work rate (%)"),
          pct("w_retention", "Permanent workers — retention rate (%)"),
        ],
        rows: [r("male", "Male"), r("female", "Female"), r("total", "Total")],
      },
    ],
  },
  {
    code: "P3-E8",
    title: "Training given to employees and workers",
    years: 2,
    parts: [
      {
        key: "main",
        columns: [
          n("total", "Total (A)"),
          n("safety", "On health and safety measures No. (B)"),
          share("safety_pct", "% (B / A)", "safety", "total"),
          n("skill", "On skill upgradation No. (C)"),
          share("skill_pct", "% (C / A)", "skill", "total"),
        ],
        rows: [...genderRows("e", "Employees"), ...genderRows("w", "Workers")],
      },
    ],
  },
  {
    code: "P3-E13",
    title: "Complaints made by employees and workers on working conditions and health and safety",
    years: 2,
    parts: [
      {
        key: "main",
        columns: complaintColumns,
        rows: [
          r("working_conditions", "Working conditions"),
          r("health_safety", "Health and safety"),
        ],
      },
    ],
  },
  {
    code: "P5-E3",
    title: "Remuneration / salary / wages",
    years: 2,
    parts: [
      {
        key: "median",
        title: "a. Median remuneration / wages",
        columns: [
          n("male_count", "Male — number"),
          n("male_median", "Male — median remuneration (₹)"),
          n("female_count", "Female — number"),
          n("female_median", "Female — median remuneration (₹)"),
        ],
        rows: [
          r("board", "Board of Directors"),
          r("kmp", "Key Managerial Personnel"),
          r("employees", "Employees other than BoD and KMP"),
          r("workers", "Workers"),
        ],
      },
      {
        key: "female_wages",
        title: "b. Gross wages paid to females",
        columns: [pct("value", "% of total wages")],
        rows: [r("main", "Gross wages paid to females as % of total wages")],
      },
    ],
  },
  {
    code: "P5-E6",
    title: "Complaints made by employees and workers on human rights",
    years: 2,
    parts: [
      {
        key: "main",
        columns: complaintColumns,
        rows: [
          r("harassment", "Sexual harassment"),
          r("discrimination", "Discrimination at workplace"),
          r("child", "Child labour"),
          r("forced", "Forced labour / involuntary labour"),
          r("wages", "Wages"),
          r("other", "Other human rights related issues"),
        ],
      },
    ],
  },
  {
    code: "P5-E7",
    title:
      "Complaints filed under the Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013",
    years: 2,
    parts: [
      {
        key: "main",
        columns: [n("value", "Number / %")],
        rows: [
          r("total", "Total complaints reported under the POSH Act"),
          r("pct", "Complaints on POSH as a % of female employees / workers"),
          r("upheld", "Complaints on POSH upheld"),
        ],
      },
    ],
  },
  {
    code: "P8-E5",
    title: "Job creation in smaller towns — wages paid, as % of total wage cost",
    years: 2,
    parts: [
      {
        key: "main",
        columns: [pct("value", "% of total wage cost")],
        rows: [
          r("rural", "Rural"),
          r("semi_urban", "Semi-urban"),
          r("urban", "Urban"),
          r("metro", "Metropolitan"),
        ],
      },
    ],
  },
];

export const tableOf = (code: string) => BRSR_TABLES.find((t) => t.code === code);

const isTyped = (row: Row, column: Column) =>
  !row.sumOf && !column.derive && (!row.only || row.only.includes(column.key));

/** The cells a person types in one part, in order (row, column) — the Excel template has the same layout. */
export const typedColumns = (part: Part) => part.columns.filter((c) => !c.derive);

/** A part's full grid, typed cells and derived ones, as numbers or text (null = empty). */
export function computePart(part: Part, cells: Cells): Record<string, Record<string, CellValue>> {
  const at = (rowKey: string) => cells[`${part.key}.${rowKey}`] ?? {};
  const numberOf = (v: CellValue | undefined) => (typeof v === "number" ? v : null);
  const out: Record<string, Record<string, CellValue>> = {};
  // Typed rows first, then total rows (sums of typed rows), then derived columns on every row.
  for (const row of part.rows) {
    if (row.sumOf) continue;
    out[row.key] = {};
    for (const column of part.columns) {
      if (isTyped(row, column)) out[row.key][column.key] = at(row.key)[column.key] ?? null;
    }
  }
  for (const row of part.rows) {
    if (!row.sumOf) continue;
    out[row.key] = {};
    for (const column of part.columns) {
      if (column.derive || column.kind === "text") continue;
      const values = row.sumOf.map((k) => numberOf(out[k]?.[column.key]));
      out[row.key][column.key] = values.every((v) => v === null)
        ? null
        : values.reduce<number>((a, v) => a + (v ?? 0), 0);
    }
  }
  for (const row of part.rows) {
    for (const column of part.columns) {
      if (!column.derive) continue;
      out[row.key][column.key] = column.derive((k) => numberOf(out[row.key][k]));
    }
  }
  return out;
}

/**
 * Checks and cleans what was typed for one table: only typed cells of known rows and columns are kept, numbers
 * must be numbers (not negative; a percentage at most 100), text at most 200 characters. Returns the cleaned
 * cells or the first problem, naming the row and column.
 */
export function cleanCells(
  def: TableDef,
  input: Record<string, Record<string, unknown>>,
): { ok: true; cells: Cells } | { ok: false; reason: string } {
  const cells: Cells = {};
  for (const part of def.parts) {
    for (const row of part.rows) {
      const given = input[`${part.key}.${row.key}`] ?? {};
      for (const column of part.columns) {
        if (!isTyped(row, column)) continue;
        const raw = given[column.key];
        if (raw === undefined || raw === null || raw === "") continue;
        const where = `${def.code}, ${row.label}, ${column.label}`;
        let value: CellValue;
        if (column.kind === "text") {
          value = String(raw).trim().slice(0, 200);
          if (!value) continue;
        } else {
          const number = typeof raw === "number" ? raw : Number(String(raw).replace(/[\s,%]/g, ""));
          if (!Number.isFinite(number)) return { ok: false, reason: `${where}: enter a number.` };
          if (number < 0) return { ok: false, reason: `${where}: a value can't be negative.` };
          if (column.kind === "percent" && number > 100) {
            return { ok: false, reason: `${where}: a percentage can't be more than 100.` };
          }
          value = number;
        }
        (cells[`${part.key}.${row.key}`] ??= {})[column.key] = value;
      }
    }
  }
  return { ok: true, cells };
}
