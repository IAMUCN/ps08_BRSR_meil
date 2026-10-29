import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";

// Session time limits (migration 0052, .grill/scoped-admin-onboarding-decisions.md). A sign-in ends after a
// period without activity and, whatever happens, a fixed time after it started. Supabase Auth would keep
// it alive for as long as its refresh token is used, so the app keeps its own clock per sign-in
// (public.user_sessions, keyed by the access token's `session_id`) and checks it on every request.

export type SessionClock =
  | { state: "active"; idleExpiresAt: string; absoluteExpiresAt: string; now: string }
  | { state: "expired" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The sign-in this request belongs to. Call it only after `auth.getUser()` has verified the token with
 * Supabase Auth: here the token is just read from the cookie.
 */
export async function currentSessionId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const claims = data.session?.access_token.split(".")[1];
  if (!claims) return null;
  try {
    const id = JSON.parse(Buffer.from(claims, "base64url").toString("utf8")).session_id;
    return typeof id === "string" && UUID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Checks the session against the limits and, when `activity` is true, records that the person just did
 * something. A session the app cannot identify counts as expired: no clock, no access.
 */
export async function touchSession(
  sessionId: string | null,
  userId: string,
  activity: boolean,
): Promise<SessionClock> {
  if (!sessionId) return { state: "expired" };
  const [row] = await db()<
    { state: string; idle_expires_at: Date | null; absolute_expires_at: Date | null; now: Date }[]
  >`
    select state, idle_expires_at, absolute_expires_at, clock_timestamp() as now
    from public.touch_session(${sessionId}, ${userId}, ${activity})`;
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
