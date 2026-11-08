// The top-bar search (feature_enhancement.md 8.3, requirement 19; A48): what a query means, which sections are
// searched for whom, and which section comes first on which page. Pure, so the rules are unit-tested; the
// queries are in lib/search/global.ts.

export type SectionKey = "pages" | "records" | "people" | "units" | "reports" | "audit";

export const SECTION_LABELS: Record<SectionKey, string> = {
  pages: "Pages",
  records: "Records",
  people: "People",
  units: "Org units",
  reports: "Reports",
  audit: "Audit trail",
};

export type SearchHit = { title: string; detail: string; href: string };
export type SearchSection = { key: SectionKey; label: string; hits: SearchHit[] };
export type SearchResult = {
  query: string;
  sections: SearchSection[];
  /** What was searched, in words, for the empty state ("records in your units, people, …"). */
  searched: string[];
};

export const MIN_QUERY = 2;
export const MAX_QUERY = 100;
const MAX_WORDS = 6;

/** The words of a query, or null when it is too short to search. Every word must match (AND). */
export function searchTerms(raw: string): string[] | null {
  const text = raw.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
  if (text.length < MIN_QUERY) return null;
  return [...new Set(text.toLowerCase().split(" ").filter(Boolean))].slice(0, MAX_WORDS);
}

/** A word as an ILIKE pattern that matches it anywhere; %, _ and \ in the word are literal. */
export const likePattern = (word: string) => `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Who may see which section: each is searched only when the caller may open the page it links to. */
export function sectionsFor(caller: {
  isAdmin: boolean;
  isOrgAdmin: boolean;
  permissions: string[];
}): SectionKey[] {
  const adminArea = caller.isAdmin || caller.isOrgAdmin;
  const keys: SectionKey[] = ["pages", "records"];
  if (adminArea) keys.push("people", "units");
  if (adminArea && caller.permissions.includes("report.generate")) keys.push("reports");
  keys.push("audit");
  return keys;
}

/** What each section covers for this caller, said plainly. */
export function scopeWords(key: SectionKey, adminArea: boolean, superAdmin: boolean): string {
  const where = superAdmin ? "in every org unit" : "in the units you administer";
  switch (key) {
    case "pages":
      return "page names";
    case "records":
      return adminArea ? `records ${where}` : "records you submitted";
    case "people":
      return `people ${where}`;
    case "units":
      return `org units ${superAdmin ? "" : "you administer"}`.trim();
    case "reports":
      return `reports ${where}`;
    case "audit":
      return adminArea ? "the audit trail" : "your own activity";
  }
}

/** The section of the page the person is on comes first; the rest keep their usual order. */
export function orderFor(pathname: string, keys: SectionKey[]): SectionKey[] {
  const p = pathname.toLowerCase();
  const first: SectionKey | null = /^\/admin\/users/.test(p)
    ? "people"
    : /^\/admin\/organization/.test(p)
      ? "units"
      : /^\/admin\/reports/.test(p)
        ? "reports"
        : /^\/(admin\/audit-trail|app\/activity)/.test(p)
          ? "audit"
          : /^\/(admin\/(submissions|data-explorer|validation-queue|approval-queue|scope-\d)|app\/(submissions|approvals|verify))/.test(
                p,
              )
            ? "records"
            : null;
  return first && keys.includes(first) ? [first, ...keys.filter((k) => k !== first)] : keys;
}

/** Pages whose name contains every word, from the caller's own navigation. */
export function matchPages(items: { href: string; label: string }[], terms: string[]): SearchHit[] {
  return items
    .filter((item) => terms.every((t) => item.label.toLowerCase().includes(t)))
    .map((item) => ({ title: item.label, detail: "Page", href: item.href }));
}
