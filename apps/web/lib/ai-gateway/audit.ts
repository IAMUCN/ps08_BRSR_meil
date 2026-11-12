import crypto from "node:crypto";
import type { Sql } from "postgres";
import type { DataClassification, ProviderId } from "./types.ts";

export type AiAuditEventInput = {
  eventType:
    | "ai_request_completed"
    | "ai_recommendation_generated"
    | "ai_security_alert"
    | "ai_kill_switch_toggled"
    | "ai_provider_approved"
    | "ai_provider_revoked";
  entityType?: "ai_gateway" | "ai_recommendation" | "ai_provider" | "ai_policy";
  entityId?: string;
  userId?: string | null;
  orgUnitId?: string | null;
  providerId?: ProviderId | string;
  dataClassification?: DataClassification;
  tokens?: number;
  latencyMs?: number;
  reason?: string;
  details?: Record<string, unknown>;
};

/**
 * Inserts an AI event into the existing append-only public.audit_logs architecture.
 * Strictly respects all database immutability guarantees (no UPDATE, DELETE or TRUNCATE).
 */
export async function logAiAuditEvent(
  sql: Sql,
  input: AiAuditEventInput,
): Promise<{ auditId: string }> {
  const auditEntityId = input.entityId || crypto.randomUUID();
  const entityType = input.entityType || "ai_gateway";

  const sanitizedDetails = {
    provider_id: input.providerId,
    data_classification: input.dataClassification,
    tokens: input.tokens,
    latency_ms: input.latencyMs,
    org_unit_id: input.orgUnitId,
    ...input.details,
  };

  const rows = await sql`
    insert into public.audit_logs (
      event_type,
      entity_type,
      entity_id,
      user_id,
      new_value,
      reason
    ) values (
      ${input.eventType},
      ${entityType},
      ${auditEntityId}::uuid,
      ${input.userId || null}::uuid,
      ${sql.json(sanitizedDetails)},
      ${input.reason || "Automated AI Security & Privacy Audit Trail"}
    )
    returning id
  `;

  return { auditId: rows[0].id };
}
