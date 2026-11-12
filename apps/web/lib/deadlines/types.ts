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
  /** Holds a role that uploads on behalf of the activity's owning role (migration 0049), not that role. */
  onBehalf?: boolean;
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
  /**
   * Who is asked to submit and gets the reminders: the holders of the activity's owning role at the unit or
   * above, or, when there are none, the holders of a role that uploads on its behalf (same rule as Upload).
   */
  assignedOwners: TaskOwner[];
  /** On-behalf uploaders when responsible people exist too: shown, not reminded. */
  alsoUpload: TaskOwner[];
  /** The role that owns the activity (EHS for water), for "No one at this unit holds …". */
  owningRoleName: string | null;
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
