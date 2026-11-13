import { z } from "zod";
import type { AiProviderAdapter } from "./base.ts";
import type {
  GenerateStructuredRequest,
  GenerateTextRequest,
  GenerateTextResponse,
  ProviderId,
} from "../types.ts";

export type OllamaConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchFn?: typeof fetch;
};

export class OllamaAdapter implements AiProviderAdapter {
  readonly id: ProviderId = "local_ollama";
  readonly name = "Local Ollama LLM";
  readonly endpointType = "local" as const;

  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private fetchFn: typeof fetch;

  constructor(config?: OllamaConfig) {
    this.apiKey =
      config?.apiKey ||
      process.env.OLLAMA_API_KEY ||
      process.env.NVIDIA_NIM_API_KEY ||
      process.env.OPENAI_API_KEY ||
      "ollama-local";

    let rawBaseUrl = (
      config?.baseUrl ||
      process.env.OLLAMA_BASE_URL ||
      process.env.NVIDIA_NIM_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      "http://localhost:11434/v1"
    )
      .replace(/\/chat\/completions\/?$/, "")
      .replace(/\/+$/, "");

    if (rawBaseUrl && !rawBaseUrl.includes("/v1")) {
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
      config?.model ||
      process.env.OLLAMA_MODEL ||
      process.env.NVIDIA_NIM_MODEL ||
      process.env.OPENAI_MODEL ||
      "qwen2.5:7b";
    this.fetchFn = config?.fetchFn || fetch;
  }

  async generateText(req: GenerateTextRequest): Promise<GenerateTextResponse> {
    const model = req.model || this.defaultModel;
    const startTime = Date.now();

    const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        model,
        messages: req.messages,
        temperature: req.temperature ?? 0.2,
        max_tokens: Math.min(req.maxTokens ?? 900, 4096),
        stream: false,
      }),
      signal: req.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Ollama returned HTTP ${response.status}: ${errText.slice(0, 200)}`);
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

    const model = req.model || this.defaultModel;
    const startTime = Date.now();

    const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        model,
        messages: augmentedMessages,
        temperature: req.temperature ?? 0.1,
        max_tokens: Math.min(req.maxTokens ?? 900, 4096),
        response_format: { type: "json_object" },
        stream: false,
      }),
      signal: req.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Ollama returned HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    let cleaned = (data?.choices?.[0]?.message?.content ?? "").trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\s*/i, "").replace(/```\s*$/, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\s*/, "").replace(/```\s*$/, "");
    }

    const parsedJson = JSON.parse(cleaned);
    return req.schema.parse(parsedJson);
  }
}
