"use client";

import {
  AlarmClock,
  AlertTriangle,
  BellRing,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Flame,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type {
  DeadlineFilter,
  DeadlineKPIs,
  DeadlineStatus,
  DeadlineTask,
} from "@/lib/deadlines/types";
import { fetchDeadlinesAction, remindTaskAction, runEscalationSweepAction } from "./actions";

interface DeadlinesClientProps {
  initialTasks: DeadlineTask[];
  initialKpis: DeadlineKPIs;
  periods: { id: string; name: string }[];
  orgUnits: { id: string; name: string }[];
}

export function DeadlinesClient({
  initialTasks,
  initialKpis,
  periods,
  orgUnits,
}: DeadlinesClientProps) {
  const [tasks, setTasks] = useState<DeadlineTask[]>(initialTasks);
  const [kpis, setKpis] = useState<DeadlineKPIs>(initialKpis);

  // Filters
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("all");
  const [selectedOrgUnitId, setSelectedOrgUnitId] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<DeadlineStatus | "all">("all");
  const [selectedEscalation, setSelectedEscalation] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Transition & loading states
  const [isPending, startTransition] = useTransition();
  const [isSweeping, startSweepTransition] = useTransition();
  const [remindingTaskId, setRemindingTaskId] = useState<string | null>(null);

  // Reload filtered data
  const applyFilter = (overrides?: Partial<DeadlineFilter>) => {
    const filter: DeadlineFilter = {
      periodId: selectedPeriodId !== "all" ? selectedPeriodId : undefined,
      orgUnitId: selectedOrgUnitId !== "all" ? selectedOrgUnitId : undefined,
      status: selectedStatus,
      escalationLevel: selectedEscalation !== "all" ? selectedEscalation : undefined,
      search: searchQuery.trim() || undefined,
      ...overrides,
    };

    startTransition(async () => {
      const res = await fetchDeadlinesAction(filter);
      if (res.ok) {
        setTasks(res.data.tasks);
        setKpis(res.data.kpis);
      } else {
        toast.error("Failed to load deadlines: " + res.error);
      }
    });
  };

  // Run escalation sweep
  const handleRunSweep = () => {
    startSweepTransition(async () => {
      const periodId = selectedPeriodId !== "all" ? selectedPeriodId : undefined;
      const res = await runEscalationSweepAction({ periodId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      const {
        remindersDispatched,
        escalationsL1Dispatched,
        escalationsL2Dispatched,
        alreadyNotifiedCount,
        emailsSent,
      } = res.data;

      const totalDispatched =
        remindersDispatched + escalationsL1Dispatched + escalationsL2Dispatched;

      if (totalDispatched === 0) {
        toast.message(
          alreadyNotifiedCount > 0
            ? `All eligible tasks (${alreadyNotifiedCount}) were already notified in the last 20 hours.`
            : "No pending tasks meet the criteria for reminder or escalation at this time.",
        );
      } else {
        toast.success(
          `Escalation sweep dispatched: ${remindersDispatched} reminder(s), ${escalationsL1Dispatched} Level 1 escalation(s), ${escalationsL2Dispatched} Level 2 escalation(s); ${emailsSent} email(s) sent.`,
        );
      }

      // Refresh list
      applyFilter();
    });
  };

  // Remind single task
  const handleRemindTask = (task: DeadlineTask) => {
    setRemindingTaskId(task.expectationId);
    startTransition(async () => {
      try {
        const res = await remindTaskAction({
          expectationId: task.expectationId,
          periodId: task.reportingPeriodId,
        });

        if (!res.ok) {
          toast.error(res.error);
          return;
        }

        if (res.data.success) {
          toast.success(res.data.message);
          applyFilter();
        } else {
          toast.message(res.data.message);
        }
      } finally {
        setRemindingTaskId(null);
      }
    });
  };

  // Map deadline status to StatusTone
  const getStatusTone = (status: DeadlineStatus): StatusTone => {
    switch (status) {
      case "completed":
        return "success";
      case "due_soon":
      case "due_today":
        return "warning";
      case "overdue":
      case "escalated":
        return "error";
      case "upcoming":
      default:
        return "neutral";
    }
  };

  const getStatusLabel = (status: DeadlineStatus): string => {
    switch (status) {
      case "completed":
        return "Completed";
      case "due_today":
        return "Due Today";
      case "due_soon":
        return "Due Soon";
      case "overdue":
        return "Overdue";
      case "escalated":
        return "Escalated";
      case "upcoming":
        return "Upcoming";
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Compliance Governance & Escalation Sweep
          </h2>
          <p className="text-xs text-muted-foreground">
            Deterministic rules evaluate approaching submission windows, trigger multi-tiered
            escalations (L1 to PM, L2 to Corporate ESG), and send in-app and email notices.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isPending || isSweeping}
            onClick={() => applyFilter()}
          >
            <RefreshCw className={`size-3.5 ${isPending ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </Button>
          <Button
            size="sm"
            disabled={isSweeping || isPending}
            onClick={handleRunSweep}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
          >
            {isSweeping ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <BellRing className="size-4" aria-hidden />
            )}
            Run Escalation Sweep
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {/* Total Upcoming */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Upcoming</span>
            <CalendarClock className="size-4 text-sky-500" aria-hidden />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {kpis.upcoming + kpis.dueSoon}
            </span>
            <span className="text-[11px] text-muted-foreground">tasks</span>
          </div>
          <p className="mt-1 text-[11px] text-sky-600 dark:text-sky-400">
            {kpis.dueSoon} due within 7 days
          </p>
        </div>

        {/* Due Today */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Due Today</span>
            <AlarmClock className="size-4 text-amber-500" aria-hidden />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {kpis.dueToday}
            </span>
            <span className="text-[11px] text-muted-foreground">tasks</span>
          </div>
          <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
            Closing today midnight
          </p>
        </div>

        {/* Overdue */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Overdue</span>
            <AlertTriangle className="size-4 text-rose-500" aria-hidden />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
              {kpis.overdue}
            </span>
            <span className="text-[11px] text-muted-foreground">tasks</span>
          </div>
          <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
            Past due (&lt; 3 days)
          </p>
        </div>

        {/* Escalated */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Escalated</span>
            <ShieldAlert className="size-4 text-red-600" aria-hidden />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-red-600 dark:text-red-400">
              {kpis.escalated}
            </span>
            <span className="text-[11px] text-muted-foreground">tasks</span>
          </div>
          <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
            Alerted to PM / Corporate ESG
          </p>
        </div>

        {/* Completed */}
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Completed</span>
            <CheckCircle2 className="size-4 text-emerald-500" aria-hidden />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {kpis.completed}
            </span>
            <span className="text-[11px] text-muted-foreground">
              / {kpis.totalTasks} ({kpis.completionRate}%)
            </span>
          </div>
          <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
            Filed on or before deadline
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
        {/* Search */}
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            placeholder="Search metric, entity, or owner..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              applyFilter({ search: e.target.value.trim() || undefined });
            }}
            className="pl-8 text-sm"
          />
        </div>

        {/* Reporting Period Filter */}
        <div className="w-[180px]">
          <NativeSelect
            value={selectedPeriodId}
            onChange={(e) => {
              setSelectedPeriodId(e.target.value);
              applyFilter({
                periodId: e.target.value !== "all" ? e.target.value : undefined,
              });
            }}
          >
            <option value="all">All Reporting Periods</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        {/* Org Unit Filter */}
        <div className="w-[180px]">
          <NativeSelect
            value={selectedOrgUnitId}
            onChange={(e) => {
              setSelectedOrgUnitId(e.target.value);
              applyFilter({
                orgUnitId: e.target.value !== "all" ? e.target.value : undefined,
              });
            }}
          >
            <option value="all">All Entities / Projects</option>
            {orgUnits.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        {/* Status Filter */}
        <div className="w-[150px]">
          <NativeSelect
            value={selectedStatus}
            onChange={(e) => {
              const val = e.target.value as DeadlineStatus | "all";
              setSelectedStatus(val);
              applyFilter({ status: val });
            }}
          >
            <option value="all">All Statuses</option>
            <option value="upcoming">Upcoming</option>
            <option value="due_soon">Due Soon (&le; 7d)</option>
            <option value="due_today">Due Today</option>
            <option value="overdue">Overdue</option>
            <option value="escalated">Escalated</option>
            <option value="completed">Completed</option>
          </NativeSelect>
        </div>

        {/* Escalation Level Filter */}
        <div className="w-[160px]">
          <NativeSelect
            value={selectedEscalation}
            onChange={(e) => {
              setSelectedEscalation(e.target.value);
              applyFilter({
                escalationLevel: e.target.value !== "all" ? e.target.value : undefined,
              });
            }}
          >
            <option value="all">All Escalation Levels</option>
            <option value="0">Normal (Level 0)</option>
            <option value="1">Escalated (Level 1: PM)</option>
            <option value="2">Escalated (Level 2: Admin)</option>
          </NativeSelect>
        </div>
      </div>

      {/* Reporting Tasks Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-border bg-muted/60 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Task & ESG Metric
                </th>
                <th scope="col" className="px-4 py-3">
                  Entity / Project
                </th>
                <th scope="col" className="px-4 py-3">
                  Period
                </th>
                <th scope="col" className="px-4 py-3">
                  Assigned Owner(s)
                </th>
                <th scope="col" className="px-4 py-3">
                  Statutory Due Date
                </th>
                <th scope="col" className="px-4 py-3">
                  Time Remaining
                </th>
                <th scope="col" className="px-4 py-3">
                  Status
                </th>
                <th scope="col" className="px-4 py-3">
                  Escalation Tier
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    <AlarmClock className="mx-auto mb-2 size-8 text-muted-foreground/40" />
                    <p className="text-sm font-medium">No reporting deadline tasks found</p>
                    <p className="text-xs">Try adjusting your filters or search criteria above.</p>
                  </td>
                </tr>
              ) : (
                tasks.map((task) => {
                  const isReminding = remindingTaskId === task.expectationId;
                  return (
                    <tr
                      key={`${task.expectationId}-${task.reportingPeriodId}`}
                      className="hover:bg-muted/40 transition-colors"
                    >
                      {/* Task / Metric */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{task.metricName}</div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{task.categoryName}</span>
                          {task.scopeCode ? (
                            <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.2 text-[10px] font-semibold text-muted-foreground">
                              {task.scopeCode === "SCOPE_1" ? (
                                <Flame className="size-2.5 text-orange-500" />
                              ) : task.scopeCode === "SCOPE_2" ? (
                                <Zap className="size-2.5 text-amber-500" />
                              ) : (
                                <Link2 className="size-2.5 text-sky-500" />
                              )}
                              {task.scopeCode.replace("_", " ")}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Entity / Project */}
                      <td className="px-4 py-3">
                        <div className="text-foreground">{task.orgUnitName}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {task.orgUnitType}
                        </div>
                      </td>

                      {/* Period */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs text-foreground font-medium">
                          <Calendar className="size-3 text-muted-foreground" />
                          {task.periodName}
                        </span>
                      </td>

                      {/* Assigned Owners */}
                      <td className="px-4 py-3">
                        {task.assignedOwners.length > 0 ? (
                          <div className="space-y-0.5">
                            {task.assignedOwners.slice(0, 2).map((owner) => (
                              <div
                                key={owner.userId}
                                className="text-xs text-foreground"
                                title={owner.email}
                              >
                                {owner.displayName}{" "}
                                <span className="text-[10px] text-muted-foreground">
                                  ({owner.roleName})
                                </span>
                              </div>
                            ))}
                            {task.assignedOwners.length > 2 ? (
                              <div className="text-[10px] text-muted-foreground">
                                +{task.assignedOwners.length - 2} more
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="inline-flex items-center text-[11px] font-medium text-amber-600 dark:text-amber-400">
                            ⚠️ Unassigned
                          </span>
                        )}
                      </td>

                      {/* Due Date */}
                      <td className="px-4 py-3 font-mono text-xs text-foreground">
                        {task.dueDate}
                      </td>

                      {/* Time Remaining / Days Overdue */}
                      <td className="px-4 py-3 text-xs">
                        {task.isCompleted ? (
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            Completed
                          </span>
                        ) : task.daysRemaining > 7 ? (
                          <span className="text-muted-foreground">
                            {task.daysRemaining} days left
                          </span>
                        ) : task.daysRemaining > 0 ? (
                          <span className="font-semibold text-amber-600 dark:text-amber-400">
                            {task.daysRemaining} days left
                          </span>
                        ) : task.daysRemaining === 0 ? (
                          <span className="font-bold text-amber-600 dark:text-amber-400 animate-pulse">
                            Due Today
                          </span>
                        ) : (
                          <span className="font-bold text-rose-600 dark:text-rose-400">
                            {task.daysOverdue} day{task.daysOverdue === 1 ? "" : "s"} overdue
                          </span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="px-4 py-3">
                        <StatusBadge tone={getStatusTone(task.status)}>
                          {getStatusLabel(task.status)}
                        </StatusBadge>
                      </td>

                      {/* Escalation Tier */}
                      <td className="px-4 py-3">
                        {task.escalationLevel === 2 ? (
                          <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wide">
                            <ShieldAlert className="size-3" />
                            L2: Corporate Admin
                          </span>
                        ) : task.escalationLevel === 1 ? (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                            <AlertTriangle className="size-3" />
                            L1: Project Mgr
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!task.isCompleted ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                disabled={isReminding || isPending}
                                onClick={() => handleRemindTask(task)}
                                title="Send immediate in-app and email reminder"
                              >
                                {isReminding ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <BellRing className="size-3" />
                                )}
                                Remind
                              </Button>
                              <Button
                                asChild
                                size="sm"
                                variant="default"
                                className="h-7 px-2 text-xs"
                              >
                                <Link href={task.deepLinkPath}>
                                  Submit
                                  <ExternalLink className="size-3 ml-1" />
                                </Link>
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                              ✓ Submitted
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
