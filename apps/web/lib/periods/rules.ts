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

/**
 * Opening a period whose deadline has passed (submissions close date, else the end date) needs a new close
 * date of today or later: otherwise the job in migration 0053 closes it again within minutes. ISO dates.
 */
export function checkOpenDeadline(input: {
  closesOn: string | null;
  endDate: string;
  opensOn: string | null;
  today: string;
  newClosesOn?: string | null;
}): TransitionCheck {
  const { closesOn, endDate, opensOn, today, newClosesOn } = input;
  if (newClosesOn) {
    if (newClosesOn < today) {
      return { ok: false, reason: "The new submissions close date must be today or later." };
    }
    if (opensOn && newClosesOn < opensOn) {
      return { ok: false, reason: "Submission window must close on or after it opens." };
    }
    return { ok: true };
  }
  if ((closesOn ?? endDate) < today) {
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
