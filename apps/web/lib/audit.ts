import "server-only";
import type postgres from "postgres";
import type { Tx } from "@/lib/db";

// Master Approach §31: every material action is logged. Always called with the transaction that performs
// the change, so a mutation and its audit entry commit or roll back together (SCHEMA_DEVIATIONS D1).

export type AuditEvent = {
  eventType: string;
  entityType: string;
  entityId: string;
  /** Acting user; null for system-initiated events. */
  userId: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
};

function jsonOrNull(tx: Tx, value: unknown) {
  return value === undefined || value === null ? null : tx.json(value as postgres.JSONValue);
}

/**
 * Where a person's action came from (migration 0036): client address, browser and sign-in session. Read from
 * the current request; outside one — a script, a job after the response — every value is null.
 */
async function requestContext(): Promise<{
  ip: string | null;
  agent: string | null;
  session: string | null;
}> {
  try {
    const [{ headers }, { clientAddress }, { createSupabaseServerClient }] = await Promise.all([
      import("next/headers"),
      import("./security/rate-limit"),
      import("./supabase/server"),
    ]);
    const h = await headers();
    // The procedure already verified this token with Supabase Auth; here it is only read from the cookie.
    const { data } = await (await createSupabaseServerClient()).auth.getSession();
    const claims = data.session?.access_token.split(".")[1];
    const session = claims
      ? (JSON.parse(Buffer.from(claims, "base64url").toString("utf8")).session_id ?? null)
      : null;
    const ip = clientAddress(h);
    return {
      ip: ip === "unknown" ? null : ip,
      agent: h.get("user-agent")?.slice(0, 400) ?? null,
      session,
    };
  } catch {
    return { ip: null, agent: null, session: null };
  }
}

export async function writeAudit(tx: Tx, event: AuditEvent): Promise<void> {
  const from = event.userId ? await requestContext() : { ip: null, agent: null, session: null };
  await tx`
    insert into public.audit_logs
      (event_type, entity_type, entity_id, user_id, old_value, new_value, reason,
       ip_address, user_agent, session_id)
    values (
      ${event.eventType},
      ${event.entityType},
      ${event.entityId},
      ${event.userId},
      ${jsonOrNull(tx, event.oldValue)},
      ${jsonOrNull(tx, event.newValue)},
      ${event.reason ?? null},
      ${from.ip},
      ${from.agent},
      ${from.session}
    )`;
}
