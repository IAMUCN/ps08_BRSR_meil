// Report templates (feature_enhancement.md 8.1, requirement 31; D52, A48). Every template prints the same frozen
// snapshot of approved figures (lib/reports/snapshot.ts) with the same permissions and the same drill-down; only
// the layout and what is selected differ. No server imports: the Reports form reads the list too.

export const REPORT_TEMPLATES = ["brsr", "brsr_core", "ghg", "summary"] as const;
export type ReportTemplate = (typeof REPORT_TEMPLATES)[number];

export const TEMPLATE_INFO: Record<
  ReportTemplate,
  { title: string; label: string; description: string; workbook: boolean; fileStem: string }
> = {
  brsr: {
    title: "BRSR Report",
    label: "Full SEBI BRSR",
    description:
      "Every question of SEBI's BRSR format in its order, with the previous year beside it.",
    workbook: false,
    fileStem: "BRSR report",
  },
  brsr_core: {
    title: "BRSR Core Report",
    label: "BRSR Core KPIs",
    description:
      "Only the BRSR Core KPIs an assurer checks, each marked as evidence-backed or typed, with the records behind it.",
    workbook: false,
    fileStem: "BRSR Core report",
  },
  ghg: {
    title: "Greenhouse Gas Inventory",
    label: "GHG inventory",
    description:
      "Scope 1, 2 and 3 by activity, gas, emission source and org unit, with every factor and its source. Also as an Excel workbook.",
    workbook: true,
    fileStem: "GHG inventory",
  },
  summary: {
    title: "Executive Summary",
    label: "Executive summary",
    description:
      "Two to three pages: headline figures against the year before, emissions by year, open alerts and suggested actions.",
    workbook: false,
    fileStem: "Executive summary",
  },
};

export const isTemplate = (value: unknown): value is ReportTemplate =>
  typeof value === "string" && (REPORT_TEMPLATES as readonly string[]).includes(value);

/**
 * The BRSR Core KPIs and the questions that carry them (ASSURANCE.md section 3; SEBI's BRSR Core, July 2023).
 * "evidence": the figure comes from approved records; "typed": an Admin writes it on BRSR Disclosures.
 */
export const BRSR_CORE: {
  attribute: string;
  kpi: string;
  code: string;
  source: "evidence" | "typed";
}[] = [
  {
    attribute: "Greenhouse gas footprint",
    kpi: "Total Scope 1 and Scope 2 emissions, and intensity",
    code: "P6-E7",
    source: "evidence",
  },
  {
    attribute: "Water footprint",
    kpi: "Total water consumption and intensity",
    code: "P6-E3",
    source: "evidence",
  },
  {
    attribute: "Water footprint",
    kpi: "Water discharge by destination and treatment",
    code: "P6-E4",
    source: "evidence",
  },
  {
    attribute: "Energy footprint",
    kpi: "Total energy consumed, share from renewables, intensity",
    code: "P6-E1",
    source: "typed",
  },
  {
    attribute: "Embracing circularity",
    kpi: "Waste generated, recovered and disposed",
    code: "P6-E9",
    source: "evidence",
  },
  {
    attribute: "Employee well-being and safety",
    kpi: "Spending on well-being as a share of revenue",
    code: "P3-E1",
    source: "typed",
  },
  {
    attribute: "Employee well-being and safety",
    kpi: "Safety incidents: LTIFR, recordable injuries, fatalities",
    code: "P3-E11",
    source: "evidence",
  },
  {
    attribute: "Enabling gender diversity in business",
    kpi: "Wages paid to females as a share of total wages",
    code: "P5-E3",
    source: "typed",
  },
  {
    attribute: "Enabling gender diversity in business",
    kpi: "Complaints on sexual harassment (POSH)",
    code: "P5-E7",
    source: "typed",
  },
  {
    attribute: "Enabling inclusive development",
    kpi: "Input material sourced from MSMEs and small producers",
    code: "P8-E4",
    source: "evidence",
  },
  {
    attribute: "Enabling inclusive development",
    kpi: "Job creation in smaller towns (wages by location)",
    code: "P8-E5",
    source: "typed",
  },
  {
    attribute: "Fairness in engaging with customers and suppliers",
    kpi: "Data breaches, and those involving customer data",
    code: "P9-E7",
    source: "typed",
  },
  {
    attribute: "Fairness in engaging with customers and suppliers",
    kpi: "Days of accounts payable",
    code: "P1-E8",
    source: "typed",
  },
  {
    attribute: "Open-ness of business",
    kpi: "Concentration of purchases, sales, loans and investments",
    code: "P1-E9",
    source: "typed",
  },
];

/** Approved emissions of one activity for the report's periods, in tCO2e. */
export type ActivityEmission = {
  metricCode: string;
  metricName: string;
  scopeCode: "SCOPE_1" | "SCOPE_2" | "SCOPE_3";
  /** The Scope 3 category (or the scope's own name). */
  categoryName: string;
  tco2e: number;
  records: number;
};

/** What a template adds to the snapshot, read at generation and frozen with it. */
export type TemplateExtras = {
  activities?: ActivityEmission[];
  previousActivities?: ActivityEmission[];
  /** Executive summary: the org unit's year-wise emissions, suggestions and open alerts at generation. */
  analytics?: {
    years: {
      label: string;
      total: number;
      byScope: Record<"SCOPE_1" | "SCOPE_2" | "SCOPE_3", number>;
      complete: boolean;
      notes: string[];
    }[];
    recommendations: { title: string; reason: string; priority: string; policy: string }[];
    alerts: {
      orgUnitName: string;
      periodLabel: string;
      scopeCode: string;
      measuredT: number;
      baselineT: number;
      thresholdPct: number;
    }[];
  };
};
