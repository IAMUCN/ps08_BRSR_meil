// Who gets which deadline reminder today (feature_enhancement.md Phase 5; owner's decisions of 2026-11-08 and, for
// overdue submissions, 2026-11-13: .grill/deadline-escalation-decisions.md). Pure: given the day, the schedule, what
// is still missing and who administers what, it lists the messages. Sending, and making sure nothing is sent twice,
// is lib/reminders/run.ts.
//
// Before the due date: the owners of each missing submission, and a summary to every Administrator above it.
// After it: the owners daily, and the alert climbs the hierarchy one step at a time, each step on its own day:
//   unit Administrator (the nearest unit above with one) -> the next Administrator up -> everyone above + Super Admins.

export type ScheduleDay = { before: number; email: boolean };
/** Days after the due date on which each step of the climb is told. */
export type Escalation = {
  unitAdminAfter: number;
  parentAdminAfter: number;
  superAdminAfter: number;
};
export type Schedule = { days: ScheduleDay[]; timezone: string; escalation: Escalation };

export const DEFAULT_ESCALATION: Escalation = {
  unitAdminAfter: 1,
  parentAdminAfter: 3,
  superAdminAfter: 7,
};

export const DEFAULT_SCHEDULE: Schedule = {
  days: [
    { before: 14, email: true },
    { before: 10, email: false },
    { before: 7, email: true },
    { before: 5, email: false },
    { before: 3, email: true },
    { before: 2, email: false },
    { before: 1, email: false },
    { before: 0, email: true },
  ],
  timezone: "Asia/Kolkata",
  escalation: DEFAULT_ESCALATION,
};

/** Escalation days read defensively: whole days from 1 to 60, in climbing order; anything else is the default. */
export function readEscalation(value: unknown): Escalation {
  const raw = value as Partial<Record<keyof Escalation, unknown>> | null;
  const a = raw?.unitAdminAfter;
  const b = raw?.parentAdminAfter;
  const c = raw?.superAdminAfter;
  const ok = (n: unknown): n is number =>
    Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 60;
  return ok(a) && ok(b) && ok(c) && a <= b && b <= c
    ? { unitAdminAfter: a, parentAdminAfter: b, superAdminAfter: c }
    : DEFAULT_ESCALATION;
}

/** A saved schedule, read defensively: anything senseless falls back to the default, never to "no reminders". */
export function readSchedule(value: unknown): Schedule {
  const raw = value as { days?: unknown; timezone?: unknown; escalation?: unknown } | null;
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
    escalation: readEscalation(raw.escalation),
  };
}

/** Whole days from `today` to `due` (ISO dates, calendar arithmetic, no time zone involved). */
export function daysBetween(today: string, due: string): number {
  return Math.round(
    (Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
}

export type Person = { userId: string; name: string; email: string };

/** Where an expected submission stands: nothing uploaded, or on file but not yet approved. */
export type PendingStatus = "missing" | "draft" | "user_verified" | "validated";

/** What an Administrator reads beside an item that is on file but not approved ("missing" needs no words). */
export const STATUS_TEXT: Record<PendingStatus, string> = {
  missing: "not started",
  draft: "uploaded, not yet verified",
  user_verified: "verified, under review",
  validated: "awaiting approval",
};

/**
 * An expected submission that is not approved yet, in a period that still takes uploads: nothing uploaded
 * (`missing`: its owners are reminded) or on file and stuck somewhere (the owners already did their part, so only
 * Administrators hear of it, and only once it is overdue).
 */
export type MissingItem = {
  status: PendingStatus;
  periodId: string;
  periodName: string;
  dueDate: string;
  orgUnitId: string;
  orgUnitName: string;
  metricName: string;
  owners: Person[];
  /**
   * The Administrators above this unit, nearest first, one list per unit that has any (the unit itself, then the
   * unit above it, and so on). A unit with no Administrator is not in the list: the climb skips it.
   */
  adminLevels: Person[][];
};

/** Someone who administers units: an Administrator (their units and below), or a Super Admin (everything). */
export type Overseer = Person & { unitIds: ReadonlySet<string> | "all" };

export type Message = {
  kind: "owner" | "digest" | "escalation";
  recipient: Person;
  periodId: string;
  periodName: string;
  dueDate: string;
  /** Negative after the due date: -3 is three days late. */
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

/** Administrators with their distance from the unit, nearest first, as one list per distance (one "level"). */
export function levelsOf(rows: readonly { depth: number; person: Person }[]): Person[][] {
  const levels: Person[][] = [];
  let last: number | null = null;
  for (const { depth, person } of rows) {
    if (depth === last) levels[levels.length - 1].push(person);
    else levels.push([person]);
    last = depth;
  }
  return levels;
}

const late = (days: number) => `${days} day${days === 1 ? "" : "s"} late`;
const names = (people: readonly Person[]) =>
  people.length ? people.map((p) => p.name).join(", ") : "no one assigned";
const isMissing = (i: MissingItem) => i.status === "missing";
/** The first few names, then how many more. */
const someNames = (people: readonly Person[], max = 3) =>
  people.length <= max
    ? names(people)
    : `${names(people.slice(0, max))} and ${people.length - max} more`;

/**
 * Overdue submissions of one period (the due date is behind us). The owners hear daily in-app, and by email on the
 * escalation days. On each escalation day the next step of the climb is told, together with the steps before it:
 * day 1 the nearest unit Administrator, day 3 also the next one up, day 7 every Administrator above and the
 * Super Admins. Each recipient gets one message listing what is overdue in their reach, with the owners' names.
 */
function planOverdue(
  items: readonly MissingItem[],
  base: { periodId: string; periodName: string; dueDate: string; daysBefore: number },
  input: { schedule: Schedule; overseers: readonly Overseer[]; superAdminIds: ReadonlySet<string> },
): Message[] {
  const days = -base.daysBefore;
  const { unitAdminAfter, parentAdminAfter, superAdminAfter } = input.schedule.escalation;
  const step = [unitAdminAfter, parentAdminAfter, superAdminAfter].lastIndexOf(days);
  const messages: Message[] = [];

  // Owners: every day, listing their own overdue submissions (what is not on file; the rest is not theirs to do).
  const byOwner = new Map<string, { person: Person; items: MissingItem[] }>();
  for (const item of items.filter(isMissing)) {
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
      channels: step >= 0 ? ["in_app", "email"] : ["in_app"],
      title: `${own.length} submission${own.length === 1 ? "" : "s"} overdue for ${base.periodName}, ${late(days)}`,
      lines: own.map((i) => `${i.metricName} — ${i.orgUnitName}`),
      missingCount: own.length,
      orgUnitIds: [...new Set(own.map((i) => i.orgUnitId))],
    });
  }
  if (step < 0) return messages;

  // The climb: who is told about each item on this step.
  const told = new Map<string, { person: Person; items: Set<MissingItem> }>();
  const tell = (person: Person, item: MissingItem) => {
    const entry = told.get(person.userId) ?? { person, items: new Set<MissingItem>() };
    entry.items.add(item);
    told.set(person.userId, entry);
  };
  for (const item of items) {
    const levels = step === 2 ? item.adminLevels : item.adminLevels.slice(0, step + 1);
    for (const level of levels) for (const person of level) tell(person, item);
  }
  if (step === 2) {
    for (const overseer of input.overseers) {
      if (!input.superAdminIds.has(overseer.userId)) continue;
      for (const item of items) tell(overseer, item);
    }
  }
  for (const { person, items: theirs } of told.values()) {
    const list = [...theirs].sort(
      (a, b) =>
        a.orgUnitName.localeCompare(b.orgUnitName) || a.metricName.localeCompare(b.metricName),
    );
    messages.push({
      ...base,
      kind: "escalation",
      recipient: person,
      channels: ["in_app", "email"],
      title: `${list.length} submission${list.length === 1 ? "" : "s"} overdue for ${base.periodName}, ${late(days)}`,
      lines: list.map(
        (i) =>
          `${i.metricName} — ${i.orgUnitName}${isMissing(i) ? "" : ` · ${STATUS_TEXT[i.status]}`} · owner: ${names(i.owners)}`,
      ),
      missingCount: list.length,
      orgUnitIds: [...new Set(list.map((i) => i.orgUnitId))],
    });
  }
  return messages;
}

/**
 * Today's messages: for every period whose due date is a schedule day away, one message per owner listing their
 * missing submissions, and one summary per Administrator for their units (the Super Admins: on email days only),
 * unit by unit with who is behind and how many more are on file but not approved. Nobody with nothing missing gets
 * anything. Past the due date, `planOverdue` takes over and also counts what is stuck.
 */
export function planReminders(input: {
  today: string;
  schedule: Schedule;
  /** Everything expected and not approved yet, with where each stands. */
  pending: readonly MissingItem[];
  overseers: readonly Overseer[];
  /** Super Admins' summaries go out on email days only (owner's decision). */
  superAdminIds: ReadonlySet<string>;
}): Message[] {
  const byPeriod = new Map<string, MissingItem[]>();
  for (const item of input.pending) {
    const list = byPeriod.get(item.periodId) ?? [];
    list.push(item);
    byPeriod.set(item.periodId, list);
  }
  const messages: Message[] = [];
  for (const items of byPeriod.values()) {
    const { periodId, periodName, dueDate } = items[0];
    const daysBefore = daysBetween(input.today, dueDate);
    if (daysBefore < 0) {
      messages.push(...planOverdue(items, { periodId, periodName, dueDate, daysBefore }, input));
      continue;
    }
    const day = input.schedule.days.find((d) => d.before === daysBefore);
    if (!day) continue;
    const channels: Message["channels"] = day.email ? ["in_app", "email"] : ["in_app"];
    const base = { periodId, periodName, dueDate, daysBefore };

    // Owners: one message each, listing their own missing submissions.
    const byOwner = new Map<string, { person: Person; items: MissingItem[] }>();
    for (const item of items.filter(isMissing)) {
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
      const inReach = items.filter(
        (i) => overseer.unitIds === "all" || overseer.unitIds.has(i.orgUnitId),
      );
      const theirs = inReach.filter(isMissing);
      if (theirs.length === 0) continue;
      // By unit: how many are not started and by whom, and how many more are on file but not approved.
      const byUnit = new Map<
        string,
        { name: string; missing: number; inProgress: number; behind: Map<string, Person> }
      >();
      for (const i of inReach) {
        const u = byUnit.get(i.orgUnitId) ?? {
          name: i.orgUnitName,
          missing: 0,
          inProgress: 0,
          behind: new Map<string, Person>(),
        };
        if (isMissing(i)) {
          u.missing += 1;
          for (const o of i.owners) u.behind.set(o.userId, o);
        } else u.inProgress += 1;
        byUnit.set(i.orgUnitId, u);
      }
      messages.push({
        ...base,
        kind: "digest",
        recipient: overseer,
        channels: isSuper ? ["in_app", "email"] : channels,
        title: `${theirs.length} submission${theirs.length === 1 ? "" : "s"} still missing for ${periodName}, due ${when(daysBefore)}`,
        lines: [...byUnit.values()]
          .filter((u) => u.missing > 0)
          .sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name))
          .map(
            (u) =>
              `${u.name}: ${u.missing} not started${u.inProgress ? `, ${u.inProgress} on file, not approved` : ""} (${someNames([...u.behind.values()])})`,
          ),
        missingCount: theirs.length,
        orgUnitIds: [...byUnit].filter(([, u]) => u.missing > 0).map(([id]) => id),
      });
    }
  }
  return messages;
}
