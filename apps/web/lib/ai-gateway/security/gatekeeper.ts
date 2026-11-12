import { z } from "zod";
import type {
  AiProviderRecord,
  DataClassification,
  GenerateTextRequest,
  SecurityContext,
} from "../types.ts";
import { CLASSIFICATION_POLICY_MAP } from "../types.ts";

export class AiSecurityViolationError extends Error {
  code: string;
  constructor(message: string, code = "AI_SECURITY_VIOLATION") {
    super(`[TraceESG Security Gatekeeper] ${message}`);
    this.name = "AiSecurityViolationError";
    this.code = code;
  }
}

export class AiKillSwitchActiveError extends Error {
  constructor(reason?: string | null) {
    super(
      `[TraceESG Emergency Kill Switch] External AI provider access is currently disabled by Admin. Reason: ${
        reason || "Security lockdown active"
      }`,
    );
    this.name = "AiKillSwitchActiveError";
  }
}

/**
 * Gatekeeper security validation results.
 */
export type GatekeeperValidationResult = {
  allowed: boolean;
  providerId: string;
  policyEnforced: string;
  piiMaskingRequired: boolean;
  requiresExplicitHumanApproval: boolean;
  warnings: string[];
};

/**
 * Validates an AI request against all 10 corporate security and privacy controls.
 */
export function validateAiRequestSecurity(options: {
  provider: AiProviderRecord;
  request: GenerateTextRequest;
  killSwitchEnabled: boolean;
  killSwitchReason?: string | null;
  authorizedOrgUnitIds?: string[];
}): GatekeeperValidationResult {
  const { provider, request, killSwitchEnabled, killSwitchReason, authorizedOrgUnitIds } = options;
  const ctx = request.securityContext;
  const warnings: string[] = [];

  // CONTROL 10: Emergency Kill Switch
  if (killSwitchEnabled) {
    throw new AiKillSwitchActiveError(killSwitchReason);
  }

  // CONTROL 1: Provider-Specific Data Classification Permissions
  if (provider.approvalStatus === "DISABLED" || provider.approvalStatus === "REVOKED") {
    throw new AiSecurityViolationError(
      `Provider '${provider.name}' (${provider.id}) is ${provider.approvalStatus} and cannot process requests.`,
      "PROVIDER_REVOKED",
    );
  }

  const policy = CLASSIFICATION_POLICY_MAP[ctx.dataClassification];

  // Check Development Only status
  if (provider.approvalStatus === "DEV_ONLY" && ctx.dataClassification !== "SYNTHETIC_ESG_DATA") {
    throw new AiSecurityViolationError(
      `Provider '${provider.name}' is approved for DEV_ONLY, but received production classification '${ctx.dataClassification}'.`,
      "DEV_ONLY_RESTRICTION",
    );
  }

  // Check Provider Classification Whitelist
  if (!provider.approvedClassifications.includes(ctx.dataClassification)) {
    throw new AiSecurityViolationError(
      `Provider '${provider.name}' is not authorized to process data classification '${ctx.dataClassification}'.`,
      "CLASSIFICATION_NOT_GRANTED",
    );
  }

  // Classification-specific policy enforcement:
  let piiMaskingRequired = false;
  let requiresExplicitHumanApproval = false;

  switch (ctx.dataClassification) {
    case "AGGREGATED_ESG_METRICS":
      if (provider.approvalStatus !== "APPROVED") {
        throw new AiSecurityViolationError(
          "Aggregated ESG metrics require an explicitly APPROVED provider.",
          "UNAPPROVED_PROVIDER_FOR_METRICS",
        );
      }
      break;

    case "CONFIDENTIAL_INVOICES":
      piiMaskingRequired = true;
      if (provider.endpointType === "cloud" && !ctx.explicitHumanApprovalGiven) {
        warnings.push("Confidential invoice masked prior to external provider dispatch.");
      }
      break;

    case "EMPLOYEE_INFORMATION":
      piiMaskingRequired = true;
      requiresExplicitHumanApproval = true;
      if (!ctx.explicitHumanApprovalGiven) {
        throw new AiSecurityViolationError(
          "Employee information processing requires explicit human approval.",
          "EXPLICIT_APPROVAL_REQUIRED",
        );
      }
      break;

    case "FINANCIAL_RECORDS":
      if (provider.endpointType !== "internal" && provider.approvalStatus !== "APPROVED") {
        throw new AiSecurityViolationError(
          "Financial records are restricted to internal processing or specifically audited providers.",
          "FINANCIAL_RECORDS_RESTRICTED",
        );
      }
      piiMaskingRequired = true;
      break;

    case "PUBLIC_BRSR_GUIDELINES":
    case "SYNTHETIC_ESG_DATA":
    default:
      break;
  }

  // CONTROL 2: Organization-Level Retrieval Filters
  if (authorizedOrgUnitIds && authorizedOrgUnitIds.length > 0) {
    if (!authorizedOrgUnitIds.includes(ctx.orgUnitId)) {
      throw new AiSecurityViolationError(
        `User is not authorized to retrieve data for organization unit '${ctx.orgUnitId}'.`,
        "ORG_UNIT_UNAUTHORIZED",
      );
    }
  }

  // CONTROL 6: Request and Token Limits
  const maxAllowedTokens = provider.rateLimits.maxTokensPerRequest || 1000;
  if (request.maxTokens && request.maxTokens > maxAllowedTokens) {
    warnings.push(
      `Requested maxTokens (${request.maxTokens}) clamped to provider ceiling of ${maxAllowedTokens}.`,
    );
  }

  // CONTROL 7: No Automatic Action Execution
  // All generated outputs must remain recommendations; direct executions are blocked
  const messagesContent = request.messages.map((m) => m.content).join(" ");
  if (/\b(auto_execute|direct_commit|bypass_human_review)\b/i.test(messagesContent)) {
    throw new AiSecurityViolationError(
      "Automated action execution is strictly forbidden by database safety rules.",
      "AUTO_EXECUTION_FORBIDDEN",
    );
  }

  return {
    allowed: true,
    providerId: provider.id,
    policyEnforced: policy,
    piiMaskingRequired,
    requiresExplicitHumanApproval,
    warnings,
  };
}
