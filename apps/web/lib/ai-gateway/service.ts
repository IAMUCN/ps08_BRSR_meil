import "server-only";
import type { Sql } from "postgres";
import { logAiAuditEvent } from "./audit.ts";
import { AiGatewayRouter, DEFAULT_AI_PROVIDERS } from "./router.ts";
import type {
  AiProviderRecord,
  DataClassification,
  GenerateStructuredRequest,
  GenerateTextRequest,
  GenerateTextResponse,
  KillSwitchState,
  ProviderId,
} from "./types.ts";

/**
 * Loads the current AI security policy from database or returns safe defaults.
 */
export async function getAiSecurityPolicy(sql: Sql): Promise<{
  killSwitch: KillSwitchState;
  dataRetentionDays: number;
  maskConfidentialInvoices: boolean;
  excludeEmployeePii: boolean;
}> {
  const rows = await sql`
    select
      kill_switch_enabled,
      kill_switch_reason,
      kill_switch_activated_by,
      kill_switch_activated_at,
      data_retention_days,
      mask_confidential_invoices,
      exclude_employee_pii
    from public.ai_security_policies
    limit 1
  `;

  if (rows.length === 0) {
    return {
      killSwitch: { enabled: false, reason: null, activatedBy: null, activatedAt: null },
      dataRetentionDays: 90,
      maskConfidentialInvoices: true,
      excludeEmployeePii: true,
    };
  }

  const r = rows[0];
  return {
    killSwitch: {
      enabled: Boolean(r.kill_switch_enabled),
      reason: r.kill_switch_reason,
      activatedBy: r.kill_switch_activated_by,
      activatedAt: r.kill_switch_activated_at
        ? new Date(r.kill_switch_activated_at).toISOString()
        : null,
    },
    dataRetentionDays: r.data_retention_days ?? 90,
    maskConfidentialInvoices: Boolean(r.mask_confidential_invoices),
    excludeEmployeePii: Boolean(r.exclude_employee_pii),
  };
}

/**
 * Toggles the AI Emergency Kill Switch and writes an immutable audit receipt.
 */
export async function toggleAiKillSwitch(
  sql: Sql,
  input: {
    enabled: boolean;
    reason?: string;
    userId?: string;
  },
): Promise<KillSwitchState> {
  const now = new Date().toISOString();

  await sql`
    update public.ai_security_policies
    set
      kill_switch_enabled = ${input.enabled},
      kill_switch_reason = ${input.reason || (input.enabled ? "Manual emergency admin kill switch" : null)},
      kill_switch_activated_by = ${input.userId || "admin"},
      kill_switch_activated_at = ${input.enabled ? sql`now()` : null},
      updated_at = now()
  `;

  // Log in append-only audit_logs
  await logAiAuditEvent(sql, {
    eventType: "ai_kill_switch_toggled",
    entityType: "ai_policy",
    userId: input.userId,
    reason:
      input.reason ||
      (input.enabled ? "Emergency AI kill switch ACTIVATED" : "AI kill switch DEACTIVATED"),
    details: {
      kill_switch_enabled: input.enabled,
      toggled_at: now,
    },
  });

  return {
    enabled: input.enabled,
    reason: input.reason || null,
    activatedBy: input.userId || null,
    activatedAt: input.enabled ? now : null,
  };
}

/**
 * Lists registered AI providers and their live approval status from database.
 */
export async function listAiProvidersFromDb(sql: Sql): Promise<AiProviderRecord[]> {
  const rows = await sql`
    select
      id,
      name,
      endpoint_type,
      approval_status,
      approved_classifications,
      rate_limits,
      approved_by,
      approved_at
    from public.ai_providers
    order by id asc
  `;

  if (rows.length === 0) {
    return Object.values(DEFAULT_AI_PROVIDERS);
  }

  return rows.map((r) => ({
    id: r.id as ProviderId,
    name: r.name,
    endpointType: r.endpoint_type,
    approvalStatus: r.approval_status,
    approvedClassifications: r.approved_classifications as DataClassification[],
    rateLimits: r.rate_limits,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
  }));
}

/**
 * Creates an active AiGatewayRouter instance synchronized with database policies and audit trail.
 */
export async function createDatabaseAiGateway(sql: Sql, userId?: string): Promise<AiGatewayRouter> {
  const policy = await getAiSecurityPolicy(sql);
  const providers = await listAiProvidersFromDb(sql);

  const providerMap: Record<string, AiProviderRecord> = {};
  for (const p of providers) {
    providerMap[p.id] = p;
  }

  return new AiGatewayRouter({
    initialProviders: providerMap,
    initialKillSwitch: policy.killSwitch,
    auditListener: async (event) => {
      try {
        await logAiAuditEvent(sql, {
          eventType: event.success ? "ai_request_completed" : "ai_security_alert",
          entityType: "ai_gateway",
          userId: userId || event.userId,
          orgUnitId: event.orgUnitId,
          providerId: event.providerId,
          dataClassification: event.classification,
          tokens: event.tokens,
          latencyMs: event.latencyMs,
          reason: event.error ? `Provider error: ${event.error}` : "AI Gateway execution completed",
          details: {
            success: event.success,
            error: event.error,
          },
        });
      } catch (e) {
        console.error("Failed to write AI audit log:", e);
      }
    },
  });
}
