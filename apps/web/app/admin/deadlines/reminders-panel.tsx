"use client";

import { Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type { Schedule } from "@/lib/reminders/plan";
import type { ReminderSend } from "@/lib/trpc/routers/deadlines";
import { runRemindersAction, saveScheduleAction } from "./actions";

// Deadline reminders (feature_enhancement.md Phase 5): the schedule, today's run and what went out. Sent daily at
// 09:00 India time by Vercel Cron; a Super Admin edits the schedule and can run it now.

const PAGE = 20;
const DAYS = Array.from({ length: 15 }, (_, i) => 14 - i);
const STATUS: Record<ReminderSend["status"], { label: string; tone: StatusTone }> = {
  sending: { label: "Sending", tone: "neutral" },
  sent: { label: "Sent", tone: "success" },
  failed: { label: "Failed", tone: "error" },
};
const dayLabel = (n: number) =>
  n === 0 ? "Due day" : n === 1 ? "1 day before" : `${n} days before`;

export function RemindersPanel({
  schedule,
  log,
  canEdit,
}: {
  schedule: Schedule;
  log: ReminderSend[];
  /** Super Admin: edit the schedule and run it now. */
  canEdit: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => new Map(schedule.days.map((d) => [d.before, d.email])));
  const [pending, setPending] = useState<"save" | "run" | null>(null);
  const [shown, setShown] = useState(PAGE);
  const dirty =
    draft.size !== schedule.days.length ||
    schedule.days.some((d) => draft.get(d.before) !== d.email);

  const setDay = (day: number, state: "off" | "in_app" | "email") =>
    setDraft((current) => {
      const next = new Map(current);
      if (state === "off") next.delete(day);
      else next.set(day, state === "email");
      return next;
    });

  async function save() {
    setPending("save");
    const result = await saveScheduleAction({
      days: [...draft].map(([before, email]) => ({ before, email })),
    });
    setPending(null);
    if (!result.ok) return void toast.error(result.error);
    toast.success("Reminder schedule saved");
    router.refresh();
  }

  async function run() {
    setPending("run");
    const result = await runRemindersAction();
    setPending(null);
    if (!result.ok) return void toast.error(result.error);
    const s = result.data;
    toast.success(
      `${s.sent.inApp} in-app and ${s.sent.email} email reminder(s) sent${s.failed ? `, ${s.failed} failed` : ""}${s.skipped ? `; ${s.skipped} already sent today` : ""}.`,
    );
    router.refresh();
  }

  return (
    <section
      className="space-y-4 rounded-md border bg-card p-4"
      aria-labelledby="reminders-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="reminders-heading" className="text-base font-semibold">
            Reminders
          </h2>
          <p className="text-sm text-muted-foreground">
            Sent every morning at 9:00 (India time) to the people whose submissions are still
            missing, and a summary to the Administrators of their units. Nobody gets the same
            reminder twice.
          </p>
        </div>
        {canEdit ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending !== null}
            onClick={() => void run()}
          >
            {pending === "run" ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Play aria-hidden />
            )}
            Run now
          </Button>
        ) : null}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Schedule</legend>
        {canEdit ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
            {DAYS.map((day) => {
              const state = !draft.has(day) ? "off" : draft.get(day) ? "email" : "in_app";
              const id = `reminder-day-${day}`;
              return (
                <div key={day} className="flex min-w-0 flex-col gap-1">
                  <label htmlFor={id} className="text-xs text-muted-foreground">
                    {dayLabel(day)}
                  </label>
                  <select
                    id={id}
                    aria-label={`Reminder ${dayLabel(day).toLowerCase()}`}
                    value={state}
                    onChange={(e) => setDay(day, e.target.value as "off" | "in_app" | "email")}
                    className="min-h-8 w-full min-w-0 rounded-sm border border-input bg-background px-2 py-1 text-sm"
                  >
                    <option value="off">None</option>
                    <option value="in_app">In-app</option>
                    <option value="email">In-app and email</option>
                  </select>
                </div>
              );
            })}
          </div>
        ) : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {schedule.days.map((d) => (
              <li key={d.before} className="rounded-sm border px-2 py-1">
                {dayLabel(d.before)}: {d.email ? "In-app and email" : "In-app"}
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      {canEdit ? (
        <Button
          size="sm"
          disabled={!dirty || draft.size === 0 || pending !== null}
          onClick={() => void save()}
        >
          {pending === "save" ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Save schedule
        </Button>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Sent (newest first)</h3>
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reminders have gone out yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-table-border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-table-header text-table-header-foreground">
                <tr>
                  {["When", "Period", "To", "Kind", "Channel", "Status"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-3 py-2 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.slice(0, shown).map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-table-border bg-table-row even:bg-table-row-alt"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(r.at).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Asia/Kolkata",
                      })}
                      <span className="block text-xs text-muted-foreground">
                        {dayLabel(r.daysBefore)}
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.periodLabel}</td>
                    <td className="px-3 py-2">{r.recipient}</td>
                    <td className="px-3 py-2">
                      {r.kind === "digest" ? "Summary" : "Own submissions"}
                      <span className="block text-xs text-muted-foreground">
                        {r.missingCount} missing
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.channel === "email" ? "Email" : "In-app"}</td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={STATUS[r.status].tone}>
                        {STATUS[r.status].label}
                      </StatusBadge>
                      {r.error ? (
                        <span className="mt-1 block max-w-56 text-xs text-muted-foreground">
                          {r.error}
                          {r.attempts > 1 ? ` (tried ${r.attempts} times)` : ""}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {log.length > shown ? (
          <Button variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE)}>
            Show more ({log.length - shown} older)
          </Button>
        ) : null}
      </div>
    </section>
  );
}
