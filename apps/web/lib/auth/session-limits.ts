import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import { ADMIN_ROLE } from "@/lib/auth/redirects";
import { deviceLabel } from "@/lib/auth/device-label";
import { sessionIdFromAccessToken, signedOutAt } from "@/lib/auth/session-cookie";
import { sendEmail, sessionReplacedEmailHtml } from "@/lib/email/brevo";

// Session time limits (migration 0052, .grill/scoped-admin-onboarding-decisions.md). A sign-in ends after a
// period without activity and, whatever happens, a fixed time after it started. Supabase Auth would keep
// it alive for as long as its refresh token is used, so the app keeps its own clock per sign-in
// (public.user_sessions, keyed by the access token's `session_id`) and checks it on every request.
//
// One sign-in per account (migration 0055, feature_enhancement.md requirements 18 and 32): the sign-in form
// starts the clock through `startSession`, which asks before ending another device's sign-in; a session
// that reaches the app any other way replaces the others on its first request (`touchSession`).

export type SessionClock =
  | { state: "active"; idleExpiresAt: string; absoluteExpiresAt: string; now: string }
  | { state: "expired" };

/** Another sign-in of the same account, as `live_sessions` describes it. */
export type OtherSession = {
  session_id: string;
  started_at: string;
  last_activity_at: string;
  user_agent: string | null;
  ip_address: string | null;
};

/**
 * The sign-in this request belongs to. Call it only after `auth.getUser()` has verified the token with
 * Supabase Auth: here the token is just read from the cookie.
 */
export async function currentSessionId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return sessionIdFromAccessToken(data.session?.access_token);
}

/**
 * Checks the session against the limits and, when `activity` is true, records that the person just did
 * something. A session the app cannot identify counts as expired: no clock, no access. A session seen for
 * the first time ends any other sign-in of the person (migration 0055).
 */
export async function touchSession(
  sessionId: string | null,
  userId: string,
  activity: boolean,
): Promise<SessionClock> {
  if (!sessionId) return { state: "expired" };
  const [row] = await db()<
    {
      state: string;
      idle_expires_at: Date | null;
      absolute_expires_at: Date | null;
      replaced: OtherSession[];
      now: Date;
    }[]
  >`
    select state, idle_expires_at, absolute_expires_at, replaced, clock_timestamp() as now
    from public.touch_session_single(${sessionId}, ${userId}, ${activity})`;
  if (row && row.replaced.length > 0) await warnSuperAdmin(userId, null, null);
  if (!row || row.state !== "active" || !row.idle_expires_at || !row.absolute_expires_at) {
    return { state: "expired" };
  }
  return {
    state: "active",
    idleExpiresAt: row.idle_expires_at.toISOString(),
    absoluteExpiresAt: row.absolute_expires_at.toISOString(),
    now: row.now.toISOString(),
  };
}

export type StartOutcome =
  | { outcome: "started"; replaced: OtherSession[] }
  | { outcome: "conflict"; others: OtherSession[] }
  | { outcome: "refused" };

/**
 * Starts the app's clock for a sign-in made through the form. With `replace` false and another sign-in
 * alive, nothing starts and the new Supabase session is revoked by the database; with `replace` true the
 * others end ('replaced'), are revoked, and the takeover is audited in the same transaction.
 */
export async function startSession(input: {
  sessionId: string;
  userId: string;
  replace: boolean;
  userAgent: string | null;
  ipAddress: string | null;
}): Promise<StartOutcome> {
  const [row] = await db()<{ outcome: string; others: OtherSession[] }[]>`
    select outcome, others from public.start_session(
      ${input.sessionId}, ${input.userId}, ${input.replace},
      ${input.userAgent}, ${input.ipAddress}, 'sign_in')`;
  if (!row || row.outcome === "refused") return { outcome: "refused" };
  if (row.outcome === "conflict") return { outcome: "conflict", others: row.others };
  if (row.others.length > 0) {
    await warnSuperAdmin(input.userId, input.userAgent, input.ipAddress);
  }
  return { outcome: "started", replaced: row.others };
}

/**
 * When a sign-in was taken over by another device, in the last 24 hours (older endings are not worth
 * a notice any more). Null for any other
 * ending (or none). `sessionId` may come from an unverified cookie: the answer grants nothing.
 */
export async function replacedAt(sessionId: string | null): Promise<string | null> {
  if (!sessionId) return null;
  const [row] = await db()<{ ended_at: Date }[]>`
    select ended_at from public.user_sessions
    where session_id = ${sessionId} and ended_reason = 'replaced'
      and ended_at > now() - interval '24 hours'`;
  return row ? row.ended_at.toISOString() : null;
}

/** The login notice's wording for a sign-in that was taken over. */
export function replacedNotice(at: string | null): string {
  const when = signedOutAt(at);
  return `You were signed out because this account signed in on another device${when ? ` at ${when}` : ""}.`;
}

/**
 * A Super Admin's account is the one worth watching: when it takes over a sign-in, its owner is emailed.
 * Never throws — the sign-in has already happened and must not fail over an email.
 */
async function warnSuperAdmin(
  userId: string,
  userAgent: string | null,
  ipAddress: string | null,
): Promise<void> {
  try {
    const [person] = await db()<{ email: string; display_name: string }[]>`
      select u.email, u.display_name
      from public.users u
      where u.id = ${userId} and u.deleted_at is null
        and exists (
          select 1 from public.user_org_assignments a
          join public.roles r on r.id = a.role_id
          where a.user_id = u.id and a.revoked_at is null and r.code = ${ADMIN_ROLE})`;
    if (!person) return;
    const result = await sendEmail({
      to: { email: person.email, name: person.display_name },
      subject: "EmeilSG: your Super Admin account signed in on another device",
      html: sessionReplacedEmailHtml({
        displayName: person.display_name,
        when: signedOutAt(new Date().toISOString()) ?? "just now",
        browser: deviceLabel(userAgent),
        address: ipAddress ?? "unknown",
      }),
    });
    if (!result.sent) console.warn("Super Admin takeover email not sent:", result.reason);
  } catch (error) {
    console.error("Super Admin takeover email failed", error);
  }
}

/** Closes the app's clock for one sign-in, or for every sign-in of the person (sign-out is everywhere). */
export async function endSessions(userId: string, onlySessionId?: string | null): Promise<void> {
  const sql = db();
  await sql`
    update public.user_sessions set ended_at = now(), ended_reason = 'signed_out'
    where user_id = ${userId} and ended_at is null
      ${onlySessionId ? sql`and session_id = ${onlySessionId}` : sql``}`;
  // Old rows are of no use to anyone; clearing them here keeps the table small without a job.
  await sql`
    delete from public.user_sessions
    where coalesce(ended_at, last_activity_at) < now() - interval '30 days'`;
}
