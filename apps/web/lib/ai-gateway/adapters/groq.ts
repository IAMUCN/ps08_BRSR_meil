import { z } from "zod";
import type { AiProviderAdapter } from "./base.ts";
import type {
  GenerateStructuredRequest,
  GenerateTextRequest,
  GenerateTextResponse,
  ProviderId,
} from "../types.ts";

export type GroqConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchFn?: typeof fetch;
};

export class GroqAdapter implements AiProviderAdapter {
  readonly id: ProviderId = "groq";
  readonly name = "Groq Cloud LPU Engine (api.groq.com)";
  readonly endpointType = "cloud" as const;

  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private fetchFn: typeof fetch;

  constructor(config?: GroqConfig) {
    this.apiKey = config?.apiKey || process.env.GROQ_API_KEY || "";
    this.baseUrl = (config?.baseUrl || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
    this.defaultModel = config?.model || "llama-3.3-70b-versatile";
    this.fetchFn = config?.fetchFn || fetch;
  }

  async generateText(req: GenerateTextRequest): Promise<GenerateTextResponse> {
    if (!this.apiKey) {
      throw new Error("Groq API key is not configured on server.");
    }

    const model = req.model || this.defaultModel;
    const startTime = Date.now();

    const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: req.messages,
        temperature: req.temperature ?? 0.1,
        max_tokens: Math.min(req.maxTokens ?? 1024, 4096),
      }),
      signal: req.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Groq API returned HTTP ${response.status}: ${errText.slice(0, 200)}`);
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
    if (!this.apiKey) {
      throw new Error("Groq API key is not configured on server.");
    }

    const model = req.model || this.defaultModel;
    const startTime = Date.now();

    const systemPromptAddition =
      "You MUST output valid, parseable JSON conforming to the requested schema. Do NOT include markdown code blocks or conversational text.";

    const augmentedMessages = [
      ...req.messages,
      { role: "system" as const, content: systemPromptAddition },
    ];

    const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: augmentedMessages,
        temperature: 0.1,
        response_format: { type: "json_object" },
        max_tokens: Math.min(req.maxTokens ?? 1024, 4096),
      }),
      signal: req.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Groq API returned HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? "{}";

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      throw new Error(`Failed to parse Groq structured JSON output: ${(e as Error).message}`);
    }

    return req.schema.parse(parsed);
  }
}
