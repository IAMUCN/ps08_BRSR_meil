// Who gets which deadline reminder today (feature_enhancement.md Phase 5; owner's decisions of 2026-11-08). Pure:
// given the day, the schedule, what is still missing and who administers what, it lists the messages. Sending,
// and making sure nothing is sent twice, is lib/reminders/run.ts.

export type ScheduleDay = { before: number; email: boolean };
export type Schedule = { days: ScheduleDay[]; timezone: string };

export const DEFAULT_SCHEDULE: Schedule = {
  days: [
    { before: 7, email: true },
    { before: 6, email: false },
    { before: 5, email: true },
    { before: 4, email: false },
    { before: 3, email: true },
    { before: 2, email: false },
    { before: 1, email: false },
    { before: 0, email: true },
  ],
  timezone: "Asia/Kolkata",
};

/** A saved schedule, read defensively: anything senseless falls back to the default, never to "no reminders". */
export function readSchedule(value: unknown): Schedule {
  const raw = value as { days?: unknown; timezone?: unknown } | null;
  if (!raw || !Array.isArray(raw.days)) return DEFAULT_SCHEDULE;
  const days = raw.days
    .filter(
      (d): d is ScheduleDay =>
        typeof d === "object" &&
        d !== null &&
        Number.isInteger((d as ScheduleDay).before) &&
        (d as ScheduleDay).before >= 0 &&
        (d as ScheduleDay).before <= 60 &&
        typeof (d as ScheduleDay).email === "boolean",
    )
    .map((d) => ({ before: d.before, email: d.email }));
  const unique = [...new Map(days.map((d) => [d.before, d])).values()].sort(
    (a, b) => b.before - a.before,
  );
  return {
    days: unique.length ? unique : DEFAULT_SCHEDULE.days,
    timezone: typeof raw.timezone === "string" && raw.timezone ? raw.timezone : "Asia/Kolkata",
  };
}

/** Whole days from `today` to `due` (ISO dates, calendar arithmetic, no time zone involved). */
export function daysBetween(today: string, due: string): number {
  return Math.round(
    (Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
}

export type Person = { userId: string; name: string; email: string };

/** An expected submission with nothing uploaded yet, in a period that still takes uploads. */
export type MissingItem = {
  periodId: string;
  periodName: string;
  dueDate: string;
  orgUnitId: string;
  orgUnitName: string;
  metricName: string;
  owners: Person[];
};

/** Someone who administers units: an Administrator (their units and below), or a Super Admin (everything). */
export type Overseer = Person & { unitIds: ReadonlySet<string> | "all" };

export type Message = {
  kind: "owner" | "digest";
  recipient: Person;
  periodId: string;
  periodName: string;
  dueDate: string;
  daysBefore: number;
  channels: ("in_app" | "email")[];
  title: string;
  /** One line per missing submission (owner) or per unit (digest). */
  lines: string[];
  missingCount: number;
  orgUnitIds: string[];
};

const when = (daysBefore: number) =>
  daysBefore === 0 ? "today" : daysBefore === 1 ? "tomorrow" : `in ${daysBefore} days`;

/**
 * Today's messages: for every period whose due date is a schedule day away, one message per owner listing their
 * missing submissions, and one summary per Administrator for their units (the Super Admins: on email days only).
 * Nobody with nothing missing gets anything.
 */
export function planReminders(input: {
  today: string;
  schedule: Schedule;
  missing: readonly MissingItem[];
  overseers: readonly Overseer[];
  /** Super Admins' summaries go out on email days only (owner's decision). */
  superAdminIds: ReadonlySet<string>;
}): Message[] {
  const byPeriod = new Map<string, MissingItem[]>();
  for (const item of input.missing) {
    const list = byPeriod.get(item.periodId) ?? [];
    list.push(item);
    byPeriod.set(item.periodId, list);
  }
  const messages: Message[] = [];
  for (const items of byPeriod.values()) {
    const { periodId, periodName, dueDate } = items[0];
    const daysBefore = daysBetween(input.today, dueDate);
    const day = input.schedule.days.find((d) => d.before === daysBefore);
    if (!day) continue;
    const channels: Message["channels"] = day.email ? ["in_app", "email"] : ["in_app"];
    const base = { periodId, periodName, dueDate, daysBefore };

    // Owners: one message each, listing their own missing submissions.
    const byOwner = new Map<string, { person: Person; items: MissingItem[] }>();
    for (const item of items) {
      for (const owner of item.owners) {
        const entry = byOwner.get(owner.userId) ?? { person: owner, items: [] };
        entry.items.push(item);
        byOwner.set(owner.userId, entry);
      }
    }
    for (const { person, items: own } of byOwner.values()) {
      messages.push({
        ...base,
        kind: "owner",
        recipient: person,
        channels,
        title: `${own.length} submission${own.length === 1 ? "" : "s"} due ${when(daysBefore)} for ${periodName}`,
        lines: own.map((i) => `${i.metricName} — ${i.orgUnitName}`),
        missingCount: own.length,
        orgUnitIds: [...new Set(own.map((i) => i.orgUnitId))],
      });
    }

    // Administrators: one summary each, by unit, for everything missing in their units.
    for (const overseer of input.overseers) {
      const isSuper = input.superAdminIds.has(overseer.userId);
      if (isSuper && !day.email) continue;
      const theirs = items.filter(
        (i) => overseer.unitIds === "all" || overseer.unitIds.has(i.orgUnitId),
      );
      if (theirs.length === 0) continue;
      const byUnit = new Map<string, { name: string; count: number }>();
      for (const i of theirs) {
        const u = byUnit.get(i.orgUnitId) ?? { name: i.orgUnitName, count: 0 };
        u.count += 1;
        byUnit.set(i.orgUnitId, u);
      }
      messages.push({
        ...base,
        kind: "digest",
        recipient: overseer,
        channels: isSuper ? ["in_app", "email"] : channels,
        title: `${theirs.length} submission${theirs.length === 1 ? "" : "s"} still missing for ${periodName}, due ${when(daysBefore)}`,
        lines: [...byUnit.values()]
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
          .map((u) => `${u.name}: ${u.count} missing`),
        missingCount: theirs.length,
        orgUnitIds: [...byUnit.keys()],
      });
    }
  }
  return messages;
}
