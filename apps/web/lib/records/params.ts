import { ISSUES, STATUSES, type Issue, type Status } from "./search";

// URL search params → a validated records query (unknown values are dropped, never passed through).

type Params = Record<string, string | string[] | undefined>;

const one = (params: Params, key: string) => {
  const value = params[key];
  return typeof value === "string" && value ? value : undefined;
};
const uuid = (v: string | undefined) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
const SCOPES = ["SCOPE_1", "SCOPE_2", "SCOPE_3"];

export function readParams(params: Params) {
  const issue = one(params, "issue");
  const status = one(params, "status");
  const scope = one(params, "scope");
  const fy = Number(one(params, "fy"));
  return {
    orgUnitId: uuid(one(params, "org")),
    periodId: uuid(one(params, "period")),
    financialYear: Number.isInteger(fy) && fy > 2000 ? fy : undefined,
    scopeCode: scope && SCOPES.includes(scope) ? scope : undefined,
    metricCode: one(params, "metric"),
    roleCode: one(params, "role"),
    status: STATUSES.includes(status as Status) ? (status as Status) : undefined,
    issue: ISSUES.includes(issue as Issue) ? (issue as Issue) : undefined,
    missingSubmissions: issue === "missing_submissions",
  };
}

/** The raw string params, for the filter bar to rebuild the URL from. */
export function stringParams(params: Params): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, typeof v === "string" ? v : undefined]),
  );
}
