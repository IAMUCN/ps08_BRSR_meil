// Reporting period lifecycle rules (.grill/phase-4-admin-foundation-decisions.md). Pure — unit-testable.

export type PeriodStatus = "draft" | "open" | "closed";

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

/**
 * draft → open, open → closed, closed → open (reopen, reason required). Never draft → closed.
 * Several periods may be open at once (migration 0056): a month's bills arrive after it ends.
 */
export function checkTransition(input: {
  from: PeriodStatus;
  to: PeriodStatus;
  reason?: string | null;
}): TransitionCheck {
  const { from, to, reason } = input;
  if (from === to) return { ok: false, reason: `The period is already ${to}.` };
  if (from === "draft" && to === "closed") {
    return { ok: false, reason: "A period must be opened before it can be closed." };
  }
  if (to === "draft") return { ok: false, reason: "A period cannot return to draft." };
  if (from === "closed" && to === "open" && !reason?.trim()) {
    return { ok: false, reason: "A reason is required to reopen a closed period." };
  }
  return { ok: true };
}

/**
 * Opening a period whose last upload day has passed (late uploads until, else the due date, else the end date)
 * needs a new due date of today or later: otherwise the job (migrations 0053, 0056) closes it again within
 * minutes. ISO dates.
 */
export function checkOpenDeadline(input: {
  closesOn: string | null;
  lateUntil?: string | null;
  endDate: string;
  opensOn: string | null;
  today: string;
  newClosesOn?: string | null;
}): TransitionCheck {
  const { closesOn, lateUntil, endDate, opensOn, today, newClosesOn } = input;
  if (newClosesOn) {
    if (newClosesOn < today) {
      return { ok: false, reason: "The new submissions close date must be today or later." };
    }
    if (opensOn && newClosesOn < opensOn) {
      return { ok: false, reason: "Submission window must close on or after it opens." };
    }
    return { ok: true };
  }
  if ((lateUntil ?? closesOn ?? endDate) < today) {
    return {
      ok: false,
      reason: "This period's deadline has passed. Choose a new submissions close date.",
    };
  }
  return { ok: true };
}

export type PeriodDates = {
  startDate: string;
  endDate: string;
  submissionOpensOn?: string | null;
  submissionClosesOn?: string | null;
  lateUploadsUntil?: string | null;
};

/** ISO date `days` after `iso` (calendar arithmetic in UTC, so no time zone can shift the day). */
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Owner's defaults (2026-11-07): due 15 days after the period ends, late uploads until 45 days after. */
export const DUE_AFTER_DAYS = 15;
export const LATE_AFTER_DAYS = 45;

export function defaultWindow(endDate: string): { closesOn: string; lateUntil: string } {
  return {
    closesOn: addDays(endDate, DUE_AFTER_DAYS),
    lateUntil: addDays(endDate, LATE_AFTER_DAYS),
  };
}

/** Where an upload made `today` stands in the period's window. ISO dates. */
export function uploadTiming(
  period: { endDate: string; submissionClosesOn: string | null; lateUploadsUntil: string | null },
  today: string,
): "on_time" | "late" | "closed" {
  const due = period.submissionClosesOn ?? period.endDate;
  if (today <= due) return "on_time";
  return today <= (period.lateUploadsUntil ?? due) ? "late" : "closed";
}

/** ISO dates (YYYY-MM-DD) compare correctly as strings. */
export function checkPeriodDates(dates: PeriodDates): TransitionCheck {
  if (!(dates.endDate > dates.startDate)) {
    return { ok: false, reason: "End date must be after start date." };
  }
  const { submissionOpensOn: opens, submissionClosesOn: closes, lateUploadsUntil: late } = dates;
  if (opens && closes && closes < opens) {
    return { ok: false, reason: "Submission window must close on or after it opens." };
  }
  if (late && late < (closes ?? dates.endDate)) {
    return {
      ok: false,
      reason: "Late uploads must be allowed until the due date or later.",
    };
  }
  return { ok: true };
}
