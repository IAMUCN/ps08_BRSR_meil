import { z } from "zod";

/**
 * 6-Tier Corporate ESG Data Classification
 * Enforces privacy requirements before production AI access.
 */
export const dataClassificationEnum = z.enum([
  "PUBLIC_BRSR_GUIDELINES",
  "SYNTHETIC_ESG_DATA",
  "AGGREGATED_ESG_METRICS",
  "CONFIDENTIAL_INVOICES",
  "EMPLOYEE_INFORMATION",
  "FINANCIAL_RECORDS",
]);
export type DataClassification = z.infer<typeof dataClassificationEnum>;

/**
 * AI Processing Policy associated with each data classification tier.
 */
export const aiProcessingPolicyEnum = z.enum([
  "APPROVED_EXTERNAL_AI",
  "APPROVED_FOR_DEVELOPMENT",
  "EXTERNAL_AI_AFTER_APPROVAL",
  "MASK_OR_INTERNAL_UNLESS_APPROVED",
  "EXCLUDE_PII_REQUIRE_APPROVAL",
  "RESTRICTED_PROCESSING",
]);
export type AiProcessingPolicy = z.infer<typeof aiProcessingPolicyEnum>;

/**
 * Standard policy mapping mandated by corporate security rules.
 */
export const CLASSIFICATION_POLICY_MAP: Record<DataClassification, AiProcessingPolicy> = {
  PUBLIC_BRSR_GUIDELINES: "APPROVED_EXTERNAL_AI",
  SYNTHETIC_ESG_DATA: "APPROVED_FOR_DEVELOPMENT",
  AGGREGATED_ESG_METRICS: "EXTERNAL_AI_AFTER_APPROVAL",
  CONFIDENTIAL_INVOICES: "MASK_OR_INTERNAL_UNLESS_APPROVED",
  EMPLOYEE_INFORMATION: "EXCLUDE_PII_REQUIRE_APPROVAL",
  FINANCIAL_RECORDS: "RESTRICTED_PROCESSING",
};

export const providerIdEnum = z.enum(["gemini", "groq", "nvidia_nim", "local_ollama"]);
export type ProviderId = z.infer<typeof providerIdEnum>;

export const providerApprovalStatusEnum = z.enum([
  "APPROVED",
  "PENDING_APPROVAL",
  "REVOKED",
  "DEV_ONLY",
  "DISABLED",
]);
export type ProviderApprovalStatus = z.infer<typeof providerApprovalStatusEnum>;

export type ProviderRateLimits = {
  requestsPerMinute: number;
  maxTokensPerRequest: number;
  maxDailyRequests: number;
};

export type AiProviderRecord = {
  id: ProviderId;
  name: string;
  endpointType: "cloud" | "local" | "internal";
  approvalStatus: ProviderApprovalStatus;
  approvedClassifications: DataClassification[];
  rateLimits: ProviderRateLimits;
  approvedBy?: string | null;
  approvedAt?: string | null;
};

export type ChatRole = "system" | "user" | "assistant";

export type GatewayChatMessage = {
  role: ChatRole;
  content: string;
};

export type SecurityContext = {
  userId?: string | null;
  orgUnitId: string;
  dataClassification: DataClassification;
  isDevelopment?: boolean;
  explicitHumanApprovalGiven?: boolean;
  maskPiiApplied?: boolean;
};

export type GenerateTextRequest = {
  messages: GatewayChatMessage[];
  securityContext: SecurityContext;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type GenerateTextResponse = {
  content: string;
  providerId: ProviderId;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
  securityVerified: boolean;
};

export type GenerateStructuredRequest<T> = GenerateTextRequest & {
  schema: z.ZodType<T>;
  schemaName?: string;
};

export type KillSwitchState = {
  enabled: boolean;
  activatedBy: string | null;
  activatedAt: string | null;
  reason: string | null;
};
