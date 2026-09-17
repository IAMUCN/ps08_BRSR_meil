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

export async function writeAudit(tx: Tx, event: AuditEvent): Promise<void> {
  await tx`
    insert into public.audit_logs (event_type, entity_type, entity_id, user_id, old_value, new_value, reason)
    values (
      ${event.eventType},
      ${event.entityType},
      ${event.entityId},
      ${event.userId},
      ${jsonOrNull(tx, event.oldValue)},
      ${jsonOrNull(tx, event.newValue)},
      ${event.reason ?? null}
    )`;
}
