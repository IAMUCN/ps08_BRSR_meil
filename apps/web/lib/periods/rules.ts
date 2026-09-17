// Reporting period lifecycle rules (.grill/phase-4-admin-foundation-decisions.md). Pure — unit-testable.

export type PeriodStatus = "draft" | "open" | "closed";

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

/**
 * draft → open, open → closed, closed → open (reopen, reason required). Never draft → closed.
 * Only one period may be open at a time (also enforced by a DB unique index).
 */
export function checkTransition(input: {
  from: PeriodStatus;
  to: PeriodStatus;
  anotherPeriodOpen: boolean;
  reason?: string | null;
}): TransitionCheck {
  const { from, to, anotherPeriodOpen, reason } = input;
  if (from === to) return { ok: false, reason: `The period is already ${to}.` };
  if (from === "draft" && to === "closed") {
    return { ok: false, reason: "A period must be opened before it can be closed." };
  }
  if (to === "draft") return { ok: false, reason: "A period cannot return to draft." };
  if (to === "open" && anotherPeriodOpen) {
    return { ok: false, reason: "Another reporting period is already open. Close it first." };
  }
  if (from === "closed" && to === "open" && !reason?.trim()) {
    return { ok: false, reason: "A reason is required to reopen a closed period." };
  }
  return { ok: true };
}

export type PeriodDates = {
  startDate: string;
  endDate: string;
  submissionOpensOn?: string | null;
  submissionClosesOn?: string | null;
};

/** ISO dates (YYYY-MM-DD) compare correctly as strings. */
export function checkPeriodDates(dates: PeriodDates): TransitionCheck {
  if (!(dates.endDate > dates.startDate)) {
    return { ok: false, reason: "End date must be after start date." };
  }
  const { submissionOpensOn: opens, submissionClosesOn: closes } = dates;
  if (opens && closes && closes < opens) {
    return { ok: false, reason: "Submission window must close on or after it opens." };
  }
  return { ok: true };
}
