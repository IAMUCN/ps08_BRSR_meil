import { z } from "zod";
import type { AiProviderAdapter } from "./base.ts";
import type {
  GenerateStructuredRequest,
  GenerateTextRequest,
  GenerateTextResponse,
  ProviderId,
} from "../types.ts";

export type GeminiConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchFn?: typeof fetch;
};

export class GeminiAdapter implements AiProviderAdapter {
  readonly id: ProviderId = "gemini";
  readonly name = "Google Gemini Enterprise (generativelanguage.googleapis.com)";
  readonly endpointType = "cloud" as const;

  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private fetchFn: typeof fetch;

  constructor(config?: GeminiConfig) {
    this.apiKey = config?.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    this.baseUrl = (config?.baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(
      /\/+$/,
      "",
    );
    this.defaultModel = config?.model || "gemini-2.5-flash";
    this.fetchFn = config?.fetchFn || fetch;
  }

  async generateText(req: GenerateTextRequest): Promise<GenerateTextResponse> {
    if (!this.apiKey) {
      throw new Error("Google Gemini API key is not configured on server.");
    }

    const model = req.model || this.defaultModel;
    const startTime = Date.now();

    // Map GatewayChatMessage[] to Gemini contents
    const systemMessages = req.messages.filter((m) => m.role === "system");
    const conversationMessages = req.messages.filter((m) => m.role !== "system");

    const contents = conversationMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: req.temperature ?? 0.2,
        maxOutputTokens: Math.min(req.maxTokens ?? 1024, 4096),
      },
    };

    if (systemMessages.length > 0) {
      body.systemInstruction = {
        parts: [{ text: systemMessages.map((m) => m.content).join("\n\n") }],
      };
    }

    const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;
    const response = await this.fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: req.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Gemini API returned HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0];
    const content = candidate?.content?.parts?.[0]?.text ?? "";

    return {
      content,
      providerId: this.id,
      model,
      promptTokens: data?.usageMetadata?.promptTokenCount,
      completionTokens: data?.usageMetadata?.candidatesTokenCount,
      latencyMs: Date.now() - startTime,
      securityVerified: true,
    };
  }

  async generateStructured<T>(req: GenerateStructuredRequest<T>): Promise<T> {
    if (!this.apiKey) {
      throw new Error("Google Gemini API key is not configured on server.");
    }

    const model = req.model || this.defaultModel;

    const systemMessages = req.messages.filter((m) => m.role === "system");
    const conversationMessages = req.messages.filter((m) => m.role !== "system");

    const contents = conversationMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const systemText = [
      ...systemMessages.map((m) => m.content),
      "You MUST return strict, valid JSON conforming to the requested schema. No surrounding markdown backticks or commentary.",
    ].join("\n\n");

    const body: Record<string, unknown> = {
      contents,
      systemInstruction: {
        parts: [{ text: systemText }],
      },
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        maxOutputTokens: Math.min(req.maxTokens ?? 1024, 4096),
      },
    };

    const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;
    const response = await this.fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: req.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Gemini API returned HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      throw new Error(`Failed to parse Gemini structured JSON output: ${(e as Error).message}`);
    }

    return req.schema.parse(parsed);
  }
}
