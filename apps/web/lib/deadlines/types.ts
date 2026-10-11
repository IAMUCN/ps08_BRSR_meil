export type DeadlineStatus =
  "completed" | "escalated" | "overdue" | "due_today" | "due_soon" | "upcoming";

export type EscalationLevel = 0 | 1 | 2;

export type ReminderStage =
  | "7_days_before"
  | "3_days_before"
  | "1_day_before"
  | "due_today"
  | "overdue_l1"
  | "overdue_l2"
  | "none";

export interface DeadlineRuleConfig {
  dueSoonThresholdDays: number; // default: 7
  escalationL1ThresholdDays: number; // default: 3 days overdue
  escalationL2ThresholdDays: number; // default: 7 days overdue
  timezone: string; // default: "Asia/Kolkata"
}

export interface TaskOwner {
  userId: string;
  displayName: string;
  email: string;
  roleName: string;
}

export interface EscalationRecipient {
  userId: string;
  displayName: string;
  email: string;
  roleName: string;
  level: EscalationLevel;
}

export interface DeadlineTask {
  expectationId: string;
  orgUnitId: string;
  orgUnitName: string;
  orgUnitType: string;
  reportingPeriodId: string;
  periodName: string;
  metricId: string;
  metricName: string;
  metricCode: string | null;
  frequency: string;
  categoryName: string;
  scopeCode: string | null;
  dueDate: string; // YYYY-MM-DD
  daysRemaining: number;
  daysOverdue: number;
  status: DeadlineStatus;
  escalationLevel: EscalationLevel;
  submissionStatus: "missing" | "draft" | "user_verified" | "validated" | "approved";
  isCompleted: boolean;
  assignedOwners: TaskOwner[];
  escalationRecipients: EscalationRecipient[];
  lastRemindedAt: string | null;
  deepLinkPath: string;
}

export interface DeadlineKPIs {
  totalTasks: number;
  upcoming: number;
  dueSoon: number;
  dueToday: number;
  overdue: number;
  escalated: number;
  completed: number;
  completionRate: number;
}

export interface DeadlineFilter {
  periodId?: string;
  orgUnitId?: string;
  status?: DeadlineStatus | "all";
  escalationLevel?: string; // "all" | "0" | "1" | "2"
  search?: string;
}

export interface SweepResult {
  evaluatedTasks: number;
  remindersDispatched: number;
  escalationsL1Dispatched: number;
  escalationsL2Dispatched: number;
  alreadyNotifiedCount: number;
  emailsSent: number;
  errors: string[];
}
