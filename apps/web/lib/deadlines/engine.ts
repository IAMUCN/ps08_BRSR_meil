import type {
  DeadlineKPIs,
  DeadlineRuleConfig,
  DeadlineStatus,
  EscalationLevel,
  ReminderStage,
} from "./types";

export const DEFAULT_DEADLINE_CONFIG: DeadlineRuleConfig = {
  dueSoonThresholdDays: 7,
  escalationL1ThresholdDays: 3,
  escalationL2ThresholdDays: 7,
  timezone: "Asia/Kolkata",
};

/**
 * Converts a Date to a YYYY-MM-DD string in the specified timezone.
 * Uses "en-CA" locale which standardizes on ISO format.
 */
export function formatDateInTimezone(
  date: Date,
  timezone: string = DEFAULT_DEADLINE_CONFIG.timezone,
): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(date);
  } catch {
    // Fallback to UTC if timezone is invalid
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Calculates the calendar days difference between a reference date and a target due date string (YYYY-MM-DD).
 * Returns:
 *   > 0: Due in the future (e.g. +3 means 3 days remaining)
 *   0: Due today
 *   < 0: Past due / overdue (e.g. -2 means 2 days overdue)
 */
export function calculateDaysRemaining(
  dueDateStr: string,
  referenceDate: Date = new Date(),
  timezone: string = DEFAULT_DEADLINE_CONFIG.timezone,
): number {
  if (!dueDateStr) return 0;

  // Extract YYYY-MM-DD part safely
  const cleanDueStr = dueDateStr.slice(0, 10);
  const partsDue = cleanDueStr.split("-").map(Number);
  if (partsDue.length !== 3 || partsDue.some(isNaN)) {
    return 0;
  }
  const [dueY, dueM, dueD] = partsDue;

  const todayStr = formatDateInTimezone(referenceDate, timezone);
  const partsToday = todayStr.split("-").map(Number);
  if (partsToday.length !== 3 || partsToday.some(isNaN)) {
    return 0;
  }
  const [todayY, todayM, todayD] = partsToday;

  // Compare using UTC midnight timestamps to eliminate daylight-saving shifts
  const dueUtc = Date.UTC(dueY, dueM - 1, dueD);
  const todayUtc = Date.UTC(todayY, todayM - 1, todayD);

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((dueUtc - todayUtc) / msPerDay);
}

export interface EvaluationInput {
  dueDate: string;
  isCompleted: boolean;
  referenceDate?: Date;
  config?: Partial<DeadlineRuleConfig>;
}

export interface EvaluationResult {
  status: DeadlineStatus;
  daysRemaining: number;
  daysOverdue: number;
  escalationLevel: EscalationLevel;
  eligibleReminderStage: ReminderStage;
}

/**
 * Pure deterministic deadline and escalation evaluation.
 * Evaluates completion state, calendar distance, escalation tiers, and reminder eligibility.
 */
export function evaluateDeadlineStatus(input: EvaluationInput): EvaluationResult {
  const cfg: DeadlineRuleConfig = {
    ...DEFAULT_DEADLINE_CONFIG,
    ...(input.config ?? {}),
  };

  const refDate = input.referenceDate ?? new Date();
  const daysRemaining = calculateDaysRemaining(input.dueDate, refDate, cfg.timezone);
  const daysOverdue = daysRemaining < 0 ? Math.abs(daysRemaining) : 0;

  // Rule 1: Completed workflow takes highest precedence. Completed tasks are never overdue or escalated.
  if (input.isCompleted) {
    return {
      status: "completed",
      daysRemaining,
      daysOverdue: 0,
      escalationLevel: 0,
      eligibleReminderStage: "none",
    };
  }

  // Rule 2: Future tasks beyond due-soon threshold
  if (daysRemaining > cfg.dueSoonThresholdDays) {
    return {
      status: "upcoming",
      daysRemaining,
      daysOverdue: 0,
      escalationLevel: 0,
      eligibleReminderStage: "none",
    };
  }

  // Rule 3: Within due-soon window (1 to 7 days remaining by default)
  if (daysRemaining > 0) {
    let eligibleReminderStage: ReminderStage = "none";
    if (daysRemaining === 7 || (daysRemaining <= 7 && daysRemaining > 3)) {
      eligibleReminderStage = "7_days_before";
    } else if (daysRemaining === 3 || (daysRemaining <= 3 && daysRemaining > 1)) {
      eligibleReminderStage = "3_days_before";
    } else if (daysRemaining === 1) {
      eligibleReminderStage = "1_day_before";
    }

    return {
      status: "due_soon",
      daysRemaining,
      daysOverdue: 0,
      escalationLevel: 0,
      eligibleReminderStage,
    };
  }

  // Rule 4: Due today (0 days remaining)
  if (daysRemaining === 0) {
    return {
      status: "due_today",
      daysRemaining: 0,
      daysOverdue: 0,
      escalationLevel: 0,
      eligibleReminderStage: "due_today",
    };
  }

  // Rule 5: Overdue and Escalated tasks (past due date)
  if (daysOverdue >= cfg.escalationL2ThresholdDays) {
    return {
      status: "escalated",
      daysRemaining,
      daysOverdue,
      escalationLevel: 2,
      eligibleReminderStage: "overdue_l2",
    };
  }

  if (daysOverdue >= cfg.escalationL1ThresholdDays) {
    return {
      status: "escalated",
      daysRemaining,
      daysOverdue,
      escalationLevel: 1,
      eligibleReminderStage: "overdue_l1",
    };
  }

  // Overdue but below L1 threshold (e.g. 1-2 days overdue)
  return {
    status: "overdue",
    daysRemaining,
    daysOverdue,
    escalationLevel: 0,
    eligibleReminderStage: "none",
  };
}

/**
 * Aggregates summary KPIs from a list of evaluated deadline tasks.
 */
export function calculateDeadlineKPIs(tasks: Array<{ status: DeadlineStatus }>): DeadlineKPIs {
  const totalTasks = tasks.length;
  let upcoming = 0;
  let dueSoon = 0;
  let dueToday = 0;
  let overdue = 0;
  let escalated = 0;
  let completed = 0;

  for (const t of tasks) {
    switch (t.status) {
      case "upcoming":
        upcoming++;
        break;
      case "due_soon":
        dueSoon++;
        break;
      case "due_today":
        dueToday++;
        break;
      case "overdue":
        overdue++;
        break;
      case "escalated":
        escalated++;
        break;
      case "completed":
        completed++;
        break;
    }
  }

  const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

  return {
    totalTasks,
    upcoming,
    dueSoon,
    dueToday,
    overdue,
    escalated,
    completed,
    completionRate,
  };
}
