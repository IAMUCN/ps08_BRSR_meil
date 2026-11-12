import { z } from "zod";
import type { AiProviderAdapter } from "./adapters/base.ts";
import { GeminiAdapter } from "./adapters/gemini.ts";
import { GroqAdapter } from "./adapters/groq.ts";
import { NvidiaNimAdapter } from "./adapters/nvidia.ts";
import { validateAiRequestSecurity } from "./security/gatekeeper.ts";
import { inspectAndSanitizeInjection } from "./security/prompt-guard.ts";
import { sanitizeContextByClassification } from "./security/sanitizer.ts";
import type {
  AiProviderRecord,
  DataClassification,
  GatewayChatMessage,
  GenerateStructuredRequest,
  GenerateTextRequest,
  GenerateTextResponse,
  KillSwitchState,
  ProviderId,
} from "./types.ts";

/**
 * Default Seed Providers and their Corporate Approval Status
 */
export const DEFAULT_AI_PROVIDERS: Record<ProviderId, AiProviderRecord> = {
  gemini: {
    id: "gemini",
    name: "Google Gemini Enterprise",
    endpointType: "cloud",
    approvalStatus: "APPROVED",
    approvedClassifications: [
      "PUBLIC_BRSR_GUIDELINES",
      "SYNTHETIC_ESG_DATA",
      "AGGREGATED_ESG_METRICS",
      "CONFIDENTIAL_INVOICES",
    ],
    rateLimits: {
      requestsPerMinute: 60,
      maxTokensPerRequest: 2048,
      maxDailyRequests: 5000,
    },
    approvedBy: "System Security Board",
    approvedAt: "2026-10-15T00:00:00Z",
  },
  nvidia_nim: {
    id: "nvidia_nim",
    name: "NVIDIA NIM Infrastructure",
    endpointType: "cloud",
    approvalStatus: "APPROVED",
    approvedClassifications: [
      "PUBLIC_BRSR_GUIDELINES",
      "SYNTHETIC_ESG_DATA",
      "AGGREGATED_ESG_METRICS",
    ],
    rateLimits: {
      requestsPerMinute: 45,
      maxTokensPerRequest: 1500,
      maxDailyRequests: 3000,
    },
    approvedBy: "Chief Information Security Officer",
    approvedAt: "2026-10-18T00:00:00Z",
  },
  groq: {
    id: "groq",
    name: "Groq Cloud LPU",
    endpointType: "cloud",
    approvalStatus: "DEV_ONLY",
    approvedClassifications: ["PUBLIC_BRSR_GUIDELINES", "SYNTHETIC_ESG_DATA"],
    rateLimits: {
      requestsPerMinute: 30,
      maxTokensPerRequest: 1024,
      maxDailyRequests: 1000,
    },
    approvedBy: "Development Lead",
    approvedAt: "2026-11-01T00:00:00Z",
  },
  local_ollama: {
    id: "local_ollama",
    name: "Local Air-Gapped LLM",
    endpointType: "local",
    approvalStatus: "APPROVED",
    approvedClassifications: [
      "PUBLIC_BRSR_GUIDELINES",
      "SYNTHETIC_ESG_DATA",
      "AGGREGATED_ESG_METRICS",
      "CONFIDENTIAL_INVOICES",
      "EMPLOYEE_INFORMATION",
      "FINANCIAL_RECORDS",
    ],
    rateLimits: {
      requestsPerMinute: 120,
      maxTokensPerRequest: 4096,
      maxDailyRequests: 10000,
    },
    approvedBy: "Data Privacy Officer",
    approvedAt: "2026-09-01T00:00:00Z",
  },
};

export class AiGatewayRouter {
  private adapters: Map<ProviderId, AiProviderAdapter> = new Map();
  private providerRecords: Map<ProviderId, AiProviderRecord> = new Map();
  private killSwitch: KillSwitchState = {
    enabled: false,
    activatedBy: null,
    activatedAt: null,
    reason: null,
  };
  private auditListener?: (event: {
    eventType: string;
    providerId: string;
    classification: DataClassification;
    success: boolean;
    error?: string;
    latencyMs?: number;
    tokens?: number;
    orgUnitId: string;
    userId?: string | null;
  }) => Promise<void> | void;

  constructor(options?: {
    customAdapters?: Record<string, AiProviderAdapter>;
    initialProviders?: Record<string, AiProviderRecord>;
    initialKillSwitch?: KillSwitchState;
    auditListener?: (event: any) => Promise<void> | void;
  }) {
    // Register default providers
    const providersToLoad = options?.initialProviders || DEFAULT_AI_PROVIDERS;
    for (const [id, rec] of Object.entries(providersToLoad)) {
      this.providerRecords.set(id as ProviderId, rec as AiProviderRecord);
    }

    // Register adapters
    if (options?.customAdapters) {
      for (const [id, adapter] of Object.entries(options.customAdapters)) {
        this.adapters.set(id as ProviderId, adapter);
      }
    } else {
      this.adapters.set("nvidia_nim", new NvidiaNimAdapter());
      this.adapters.set("groq", new GroqAdapter());
      this.adapters.set("gemini", new GeminiAdapter());
    }

    if (options?.initialKillSwitch) {
      this.killSwitch = options.initialKillSwitch;
    }
    this.auditListener = options?.auditListener;
  }

  setKillSwitch(enabled: boolean, reason?: string, activatedBy?: string): void {
    this.killSwitch = {
      enabled,
      reason: reason || (enabled ? "Administrative security override" : null),
      activatedBy: activatedBy || null,
      activatedAt: enabled ? new Date().toISOString() : null,
    };
  }

  getKillSwitchState(): KillSwitchState {
    return { ...this.killSwitch };
  }

  listProviders(): AiProviderRecord[] {
    return Array.from(this.providerRecords.values());
  }

  updateProviderApproval(
    id: ProviderId,
    status: AiProviderRecord["approvalStatus"],
    approvedClassifications?: DataClassification[],
    approvedBy?: string,
  ): void {
    const existing = this.providerRecords.get(id);
    if (!existing) {
      throw new Error(`Provider '${id}' not registered.`);
    }
    this.providerRecords.set(id, {
      ...existing,
      approvalStatus: status,
      approvedClassifications: approvedClassifications || existing.approvedClassifications,
      approvedBy: approvedBy || existing.approvedBy,
      approvedAt: new Date().toISOString(),
    });
  }

  /**
   * Dispatches text generation through gatekeeper, privacy sanitizer, and provider failover.
   */
  async generateText(
    req: GenerateTextRequest,
    preferredProviderId?: ProviderId,
  ): Promise<GenerateTextResponse> {
    const providerId =
      preferredProviderId || this.resolveBestProvider(req.securityContext.dataClassification);
    const providerRecord = this.providerRecords.get(providerId);

    if (!providerRecord) {
      throw new Error(`Provider record for '${providerId}' not found.`);
    }

    // 1. Security Gatekeeper Validation
    const securityCheck = validateAiRequestSecurity({
      provider: providerRecord,
      request: req,
      killSwitchEnabled: this.killSwitch.enabled,
      killSwitchReason: this.killSwitch.reason,
    });

    // 2. Data Classification Sanitization & Prompt Injection Protection
    const sanitizedMessages: GatewayChatMessage[] = req.messages.map((m) => {
      // Clean injection from user and tool messages
      const injectionCleaned = inspectAndSanitizeInjection(m.content).sanitizedText;
      // Clean PII according to data classification
      const piiCleaned = sanitizeContextByClassification(
        injectionCleaned,
        req.securityContext.dataClassification,
      ).sanitized;

      return {
        role: m.role,
        content: piiCleaned,
      };
    });

    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      throw new Error(`Adapter for provider '${providerId}' is not registered.`);
    }

    const sanitizedReq: GenerateTextRequest = {
      ...req,
      messages: sanitizedMessages,
    };

    const startTime = Date.now();
    try {
      const response = await adapter.generateText(sanitizedReq);

      // Audit Log Success
      if (this.auditListener) {
        await this.auditListener({
          eventType: "ai_prompt_evaluated",
          providerId,
          classification: req.securityContext.dataClassification,
          success: true,
          latencyMs: response.latencyMs,
          tokens: (response.promptTokens || 0) + (response.completionTokens || 0),
          orgUnitId: req.securityContext.orgUnitId,
          userId: req.securityContext.userId,
        });
      }

      return response;
    } catch (err) {
      // Audit Log Error
      if (this.auditListener) {
        await this.auditListener({
          eventType: "ai_provider_failure",
          providerId,
          classification: req.securityContext.dataClassification,
          success: false,
          error: (err as Error).message,
          latencyMs: Date.now() - startTime,
          orgUnitId: req.securityContext.orgUnitId,
          userId: req.securityContext.userId,
        });
      }
      throw err;
    }
  }

  /**
   * Dispatches structured output generation validated against a strict Zod schema.
   */
  async generateStructured<T>(
    req: GenerateStructuredRequest<T>,
    preferredProviderId?: ProviderId,
  ): Promise<T> {
    const providerId =
      preferredProviderId || this.resolveBestProvider(req.securityContext.dataClassification);
    const providerRecord = this.providerRecords.get(providerId);

    if (!providerRecord) {
      throw new Error(`Provider record for '${providerId}' not found.`);
    }

    validateAiRequestSecurity({
      provider: providerRecord,
      request: req,
      killSwitchEnabled: this.killSwitch.enabled,
      killSwitchReason: this.killSwitch.reason,
    });

    const sanitizedMessages: GatewayChatMessage[] = req.messages.map((m) => {
      const injectionCleaned = inspectAndSanitizeInjection(m.content).sanitizedText;
      const piiCleaned = sanitizeContextByClassification(
        injectionCleaned,
        req.securityContext.dataClassification,
      ).sanitized;
      return { role: m.role, content: piiCleaned };
    });

    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      throw new Error(`Adapter for provider '${providerId}' is not registered.`);
    }

    return await adapter.generateStructured({
      ...req,
      messages: sanitizedMessages,
    });
  }

  private resolveBestProvider(classification: DataClassification): ProviderId {
    // 1. Look for approved cloud provider supporting this classification
    for (const [id, rec] of this.providerRecords.entries()) {
      if (
        rec.approvalStatus === "APPROVED" &&
        rec.approvedClassifications.includes(classification)
      ) {
        return id;
      }
    }

    // 2. Fallback to any provider supporting classification
    for (const [id, rec] of this.providerRecords.entries()) {
      if (
        rec.approvalStatus !== "DISABLED" &&
        rec.approvedClassifications.includes(classification)
      ) {
        return id;
      }
    }

    // Default to nvidia_nim
    return "nvidia_nim";
  }
}
