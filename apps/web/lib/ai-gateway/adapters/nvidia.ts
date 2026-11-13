import { z } from "zod";
import type { AiProviderAdapter } from "./base.ts";
import type {
  GenerateStructuredRequest,
  GenerateTextRequest,
  GenerateTextResponse,
  ProviderId,
} from "../types.ts";

export type NvidiaConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchFn?: typeof fetch;
};

export class NvidiaNimAdapter implements AiProviderAdapter {
  readonly id: ProviderId = "nvidia_nim";
  readonly name = "NVIDIA NIM (integrate.api.nvidia.com)";
  readonly endpointType = "cloud" as const;

  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private fetchFn: typeof fetch;

  constructor(config?: NvidiaConfig) {
    this.apiKey =
      config?.apiKey ||
      process.env.NVIDIA_NIM_API_KEY ||
      (process.env.NVIDIA_NIM_BASE_URL?.includes("ngrok") ||
      process.env.NVIDIA_NIM_BASE_URL?.includes("localhost")
        ? "ollama-local"
        : "");
    let rawBaseUrl = (
      config?.baseUrl ||
      process.env.NVIDIA_NIM_BASE_URL ||
      "https://integrate.api.nvidia.com/v1"
    )
      .replace(/\/chat\/completions\/?$/, "")
      .replace(/\/+$/, "");

    if (rawBaseUrl && !rawBaseUrl.includes("/v1") && !rawBaseUrl.includes("googleapis.com")) {
      try {
        const parsed = new URL(rawBaseUrl);
        if (parsed.pathname === "" || parsed.pathname === "/") {
          rawBaseUrl = `${rawBaseUrl.replace(/\/+$/, "")}/v1`;
        }
      } catch {
        // ignore invalid url
      }
    }
    this.baseUrl = rawBaseUrl;
    this.defaultModel =
      config?.model || process.env.NVIDIA_NIM_MODEL || "meta/llama-3.1-70b-instruct";
    this.fetchFn = config?.fetchFn || fetch;
  }

  async generateText(req: GenerateTextRequest): Promise<GenerateTextResponse> {
    if (!this.apiKey) {
      throw new Error("NVIDIA NIM API key is not configured on server.");
    }

    const model = req.model || this.defaultModel;
    const startTime = Date.now();

    const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey || "ollama-local"}`,
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        model,
        messages: req.messages,
        temperature: req.temperature ?? 0.2,
        max_tokens: Math.min(req.maxTokens ?? 900, 2048),
      }),
      signal: req.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`NVIDIA NIM returned HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? "";

    return {
      content,
      providerId: this.id,
      model,
      promptTokens: data?.usage?.prompt_tokens,
      completionTokens: data?.usage?.completion_tokens,
      latencyMs: Date.now() - startTime,
      securityVerified: true,
    };
  }

  async generateStructured<T>(req: GenerateStructuredRequest<T>): Promise<T> {
    const systemPromptAddition =
      "Respond strictly with valid, well-formed JSON matching the required schema. Do not include markdown codeblocks or conversational filler.";

    const augmentedMessages = [
      ...req.messages,
      { role: "system" as const, content: systemPromptAddition },
    ];

    const result = await this.generateText({
      ...req,
      messages: augmentedMessages,
    });

    let cleaned = result.content.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\s*/i, "").replace(/```\s*$/, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\s*/, "").replace(/```\s*$/, "");
    }

    const parsedJson = JSON.parse(cleaned);
    return req.schema.parse(parsedJson);
  }
}
