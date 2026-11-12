import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";

// Rate limiting (.grill/phase-18-audit-security-decisions.md, SECURITY_REVIEW.md, deviation D19). One
// database-backed mechanism, so it holds across serverless instances: a row per counted attempt in a
// bucket, buckets are SHA-256 hashes (no emails or addresses stored), limits come from
// org_settings.rate_limits.

export type RateLimits = {
  login_failures_per_account: number;
  login_failures_per_address: number;
  login_window_minutes: number;
  uploads_per_user: number;
  upload_window_minutes: number;
  otp_requests_per_account: number;
  otp_requests_per_address: number;
  otp_window_minutes: number;
  otp_max_attempts: number;
  chat_messages_per_user: number;
  chat_window_minutes: number;
  /** Invitation links one person may issue (Invite user, Resend, each bulk-import row). */
  invitations_per_user: number;
  /** New links for one account. */
  invitation_resends_per_account: number;
  invitation_window_minutes: number;
  /** Links that turned out not to exist, per client address: guessing, not people. */
  invitation_failures_per_address: number;
  invitation_failure_window_minutes: number;
};

const DEFAULTS: RateLimits = {
  login_failures_per_account: 5,
  login_failures_per_address: 50,
  login_window_minutes: 15,
  uploads_per_user: 60,
  upload_window_minutes: 10,
  otp_requests_per_account: 5,
  otp_requests_per_address: 20,
  otp_window_minutes: 60,
  otp_max_attempts: 5,
  chat_messages_per_user: 20,
  chat_window_minutes: 10,
  invitations_per_user: 600,
  invitation_resends_per_account: 5,
  invitation_window_minutes: 60,
  invitation_failures_per_address: 30,
  invitation_failure_window_minutes: 15,
};

export async function rateLimits(): Promise<RateLimits> {
  const [row] = await db()<{ value: Partial<RateLimits> | null }[]>`
    select value from public.org_settings where key = 'rate_limits'`;
  return { ...DEFAULTS, ...(row?.value ?? {}) };
}

/** A bucket name that identifies without storing the identity. */
export const bucket = (kind: string, value: string) =>
  `${kind}:${createHash("sha256").update(value.trim().toLowerCase()).digest("hex")}`;

/** True when the bucket already holds `limit` attempts inside the window. Old rows are cleared on the way. */
export async function exceeded(
  name: string,
  limit: number,
  windowMinutes: number,
): Promise<boolean> {
  const sql = db();
  await sql`
    delete from public.rate_limit_events
    where bucket = ${name} and created_at < now() - make_interval(mins => ${windowMinutes})`;
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from public.rate_limit_events where bucket = ${name}`;
  return row.n >= limit;
}

export async function count(name: string): Promise<void> {
  await db()`insert into public.rate_limit_events (bucket) values (${name})`;
}

export async function clear(name: string): Promise<void> {
  await db()`delete from public.rate_limit_events where bucket = ${name}`;
}

/** The client's address as the platform reports it (Vercel sets x-forwarded-for; its first entry is the client). */
export function clientAddress(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown"
  );
}
