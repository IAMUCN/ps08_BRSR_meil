// Plain words for audit actions, and word-form matching for the Audit Trail search (owner's page feedback,
// 2026-11-11, .grill/page-feedback-2026-11-11-decisions.md). Rule-based on purpose: no AI service reads the
// audit log. Pure, so the server's search and the browser's suggestions agree.

const OVERRIDES: Record<string, string> = {
  "approval.approved": "Approved a record",
  "approval.returned": "Returned a record",
  "approval.decided": "Approved or returned a record",
  "approval.submitted": "Record sent for approval",
  "document.uploaded": "Uploaded a document",
  "verification.confirmed": "Confirmed extracted values",
  "verification.field_edited": "Edited an extracted value",
  "verification.rejected": "Rejected a document",
  "ocr.document_processed": "OCR read a document",
  "ocr.field_extracted": "OCR read a field",
  "calculation.completed": "Calculated emissions",
  "calculation.blocked": "Calculation blocked",
  "validation.completed": "Validated a record",
  "period.closed": "Closed a reporting period",
  "auth.session_replaced": "Signed in on another device",
  "user.provisioned": "Created an account",
};

/** "document.bundle_confirmed" → "Document bundle confirmed", unless a plainer wording is known. */
export function actionLabel(code: string): string {
  if (OVERRIDES[code]) return OVERRIDES[code];
  const words = code.replace(/[._]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The part of a word that its forms share: the first five letters ("approve", "approved", "approval" →
 * "appro"; "verified", "verification" → "verif"), or the whole word when shorter.
 */
export function stemKey(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 5);
}

/** Does a typed word match this text by word form, or as the start of one of its words? */
export function wordMatches(word: string, text: string): boolean {
  const w = word.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (w.length < 2) return false;
  const key = stemKey(w);
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .some((t) => t.startsWith(w) || (key.length >= 4 && stemKey(t) === key));
}

/** The action codes a typed word refers to, through the code itself or its plain wording. */
export function actionsForWord(word: string, codes: readonly string[]): string[] {
  return codes.filter((c) => wordMatches(word, `${c} ${actionLabel(c)}`));
}

export type Suggestion = {
  group: "People" | "Roles" | "Actions" | "Activities" | "Org units" | "Periods";
  label: string;
  /** What choosing it sets: a filter, or the search words. */
  set: { key: "user" | "role" | "event" | "q"; value: string };
};

/**
 * Suggestions for what has been typed: every word must match the candidate (in any order, any case, by word
 * form). At most `limit` per group.
 */
export function suggest(
  typed: string,
  sources: {
    users: { id: string; name: string }[];
    roles: { code: string; name: string }[];
    eventTypes: string[];
    activities: string[];
    orgUnits: string[];
    periods: string[];
  },
  limit = 5,
): Suggestion[] {
  const words = typed.split(/\s+/).filter((w) => w.replace(/[^a-z0-9]/gi, "").length >= 2);
  if (!words.length) return [];
  const hit = (text: string) => words.every((w) => wordMatches(w, text));
  const take = <T>(list: T[], text: (t: T) => string, make: (t: T) => Suggestion) =>
    list
      .filter((t) => hit(text(t)))
      .slice(0, limit)
      .map(make);
  return [
    ...take(
      sources.users,
      (u) => u.name,
      (u) => ({ group: "People", label: u.name, set: { key: "user", value: u.id } }),
    ),
    ...take(
      sources.roles,
      (r) => r.name,
      (r) => ({ group: "Roles", label: r.name, set: { key: "role", value: r.code } }),
    ),
    ...take(
      sources.eventTypes,
      (e) => `${e} ${actionLabel(e)}`,
      (e) => ({ group: "Actions", label: actionLabel(e), set: { key: "event", value: e } }),
    ),
    ...take(
      sources.activities,
      (a) => a,
      (a) => ({ group: "Activities", label: a, set: { key: "q", value: a } }),
    ),
    ...take(
      sources.orgUnits,
      (o) => o,
      (o) => ({ group: "Org units", label: o, set: { key: "q", value: o } }),
    ),
    ...take(
      sources.periods,
      (p) => p,
      (p) => ({ group: "Periods", label: p, set: { key: "q", value: p } }),
    ),
  ];
}
