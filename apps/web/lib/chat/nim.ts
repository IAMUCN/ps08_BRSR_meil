// The language-model provider (.grill/chat-analyst-decisions.md): NVIDIA NIM's OpenAI-style chat endpoint,
// or anything that speaks the same protocol (a locally served model) behind NVIDIA_NIM_BASE_URL. The one
// place that knows the key. Nothing here logs a prompt, a reply or a header. No server imports, so the
// fallback and error handling are unit-tested with a stand-in fetch; only server code may call readConfig
// with the real environment.
import { z } from "zod";

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ModelReply = { content: string | null; toolCalls: ToolCall[]; model: string };

/** Asks the model for its next step. `allowTools` false forces a worded answer. */
export type CallModel = (
  messages: ChatMessage[],
  signal: AbortSignal,
  allowTools: boolean,
) => Promise<ModelReply>;

export type ProviderFailure =
  | "config"
  | "auth"
  | "busy"
  | "rate_limit"
  | "provider_unavailable"
  | "network_error"
  | "timeout"
  | "bad_response"
  | "provider";

/** What the person is told; never the provider's own words, which can carry account details. */
export const PROVIDER_MESSAGES: Record<ProviderFailure, string> = {
  config: "The assistant is not set up on this server. Ask an Admin.",
  auth: "The AI service is not configured correctly. Please contact your administrator.",
  busy: "Tracey is receiving too many requests right now. Please retry in a few moments.",
  rate_limit: "Tracey is receiving too many requests right now. Please retry in a few moments.",
  provider_unavailable: "The AI provider is temporarily unavailable. Please try again shortly.",
  network_error: "Unable to connect to Tracey. Check your network connection and retry.",
  timeout: "The assistant took too long to respond. Try again or ask a narrower question.",
  bad_response: "The assistant could not produce an answer. Try rephrasing the question.",
  provider: "The AI provider is temporarily unavailable. Please try again shortly.",
};

export class ProviderError extends Error {
  kind: ProviderFailure;
  retryAfterSeconds?: number;
  constructor(kind: ProviderFailure, retryAfterSeconds?: number) {
    super(PROVIDER_MESSAGES[kind]);
    this.name = "ProviderError";
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type ProviderConfig = {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
};

export type ChatConfig = {
  apiKey: string;
  baseUrl: string;
  models: string[];
  databaseUrl: string;
  providers?: ProviderConfig[];
};

export function inferProviderName(url: string): string {
  if (url.includes("groq.com")) return "groq";
  if (url.includes("googleapis.com")) return "gemini";
  if (url.includes("nvidia.com")) return "nvidia";
  if (url.includes("openai.com")) return "openai";
  if (url.includes("ollama") || url.includes("ngrok") || url.includes("localhost") || url.includes("127.0.0.1")) return "ollama";
  return "custom";
}

/**
 * The chatbot's settings, or null when any is missing — the chatbot is then off and its entry points are
 * not shown. NVIDIA_NIM_MODEL is one model or a comma-separated list in order of preference.
 */
export function readConfig(env: Record<string, string | undefined>): ChatConfig | null {
  const databaseUrl = env.CHAT_DATABASE_URL?.trim();
  if (!databaseUrl) return null;

  // Primary API key:
  const apiKey = (
    env.NVIDIA_NIM_API_KEY ||
    env.GROQ_API_KEY ||
    env.OPENAI_API_KEY ||
    env.OLLAMA_API_KEY ||
    env.GEMINI_API_KEY ||
    env.GOOGLE_API_KEY ||
    (env.OLLAMA_BASE_URL ||
    env.NVIDIA_NIM_BASE_URL?.includes("ngrok") ||
    env.NVIDIA_NIM_BASE_URL?.includes("localhost") ||
    env.OPENAI_BASE_URL?.includes("ngrok") ||
    env.OPENAI_BASE_URL?.includes("localhost")
      ? "ollama-local"
      : undefined)
  )?.trim();
  if (!apiKey) return null;

  let baseUrl = (
    env.NVIDIA_NIM_BASE_URL?.trim() ||
    env.OPENAI_BASE_URL?.trim() ||
    env.OLLAMA_BASE_URL?.trim() ||
    (env.GROQ_API_KEY ? "https://api.groq.com/openai/v1" : "https://integrate.api.nvidia.com/v1")
  )
    .replace(/\/chat\/completions\/?$/, "")
    .replace(/\/+$/, "");

  // If pointing to a root endpoint without /v1 (e.g. Ollama/ngrok/localhost), ensure /v1 is appended
  if (baseUrl && !baseUrl.includes("/v1") && !baseUrl.includes("googleapis.com")) {
    try {
      const parsed = new URL(baseUrl);
      if (parsed.pathname === "" || parsed.pathname === "/") {
        baseUrl = `${baseUrl.replace(/\/+$/, "")}/v1`;
      }
    } catch {
      // ignore invalid URL
    }
  }

  const models = (env.NVIDIA_NIM_MODEL || env.OPENAI_MODEL || env.OLLAMA_MODEL || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  if (models.length === 0) return null;

  // Multi-provider fallback list:
  const providers: ProviderConfig[] = [];
  const primaryName = inferProviderName(baseUrl);
  providers.push({
    name: primaryName,
    baseUrl,
    apiKey,
    models,
  });

  // Secondary fallback: Google Gemini (if configured and distinct from primary)
  const geminiKey = (env.GEMINI_API_KEY || env.GOOGLE_API_KEY)?.trim();
  if (geminiKey && primaryName !== "gemini") {
    const geminiModels = (env.GEMINI_MODEL || "gemini-2.0-flash,gemini-1.5-flash")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    providers.push({
      name: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: geminiKey,
      models: geminiModels,
    });
  }

  // Secondary fallback: Groq (if configured and distinct from primary)
  const groqKey = env.GROQ_API_KEY?.trim();
  if (groqKey && primaryName !== "groq" && groqKey !== apiKey) {
    providers.push({
      name: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: groqKey,
      models: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
    });
  }

  // Secondary fallback: NVIDIA NIM (if configured and distinct from primary)
  const nimKey = env.NVIDIA_NIM_API_KEY?.trim();
  if (nimKey && primaryName !== "nvidia" && nimKey !== apiKey) {
    providers.push({
      name: "nvidia",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      apiKey: nimKey,
      models: ["meta/llama-3.3-70b-instruct"],
    });
  }

  const config: ChatConfig = { apiKey, baseUrl, models, databaseUrl };
  // Keep providers property present when multiple providers are configured
  if (providers.length > 1) {
    config.providers = providers;
  }
  return config;
}

const replySchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullish(),
          tool_calls: z
            .array(
              z.object({
                id: z.string().min(1).max(200),
                function: z.object({
                  name: z.string().max(200),
                  arguments: z.string().max(20_000),
                }),
              }),
            )
            .nullish(),
        }),
      }),
    )
    .min(1),
});

const MAX_OUTPUT_TOKENS = 900;
const PER_MODEL_TIMEOUT_MS = 25_000;

export function parseRetryAfter(response: Response): number | null {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (!Number.isNaN(seconds) && seconds >= 0) return seconds;
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) {
      const diff = (date - Date.now()) / 1000;
      return diff >= 0 ? diff : 0;
    }
  }
  const resetTokens = response.headers.get("x-ratelimit-reset-tokens");
  if (resetTokens) {
    const match = resetTokens.match(/^([\d.]+)(ms|s|m)?$/);
    if (match) {
      const val = parseFloat(match[1]);
      const unit = match[2] || "s";
      if (unit === "ms") return val / 1000;
      if (unit === "s") return val;
      if (unit === "m") return val * 60;
    }
  }
  const resetRequests = response.headers.get("x-ratelimit-reset-requests");
  if (resetRequests) {
    const match = resetRequests.match(/^([\d.]+)(ms|s|m)?$/);
    if (match) {
      const val = parseFloat(match[1]);
      const unit = match[2] || "s";
      if (unit === "ms") return val / 1000;
      if (unit === "s") return val;
      if (unit === "m") return val * 60;
    }
  }
  return null;
}

export type ObservabilityLog = {
  requestId?: string;
  orgUnitId?: string;
  provider: string;
  model: string;
  durationMs: number;
  status: "success" | "error";
  errorCategory?: ProviderFailure;
  retryCount: number;
  fallbackProvider?: string;
};

export function createModelCaller(options: {
  config: ChatConfig;
  /** The tool list in the provider's format. */
  tools: unknown[];
  fetch?: typeof fetch;
  timeoutMs?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  requestId?: string;
  orgUnitId?: string;
  /** Told which model failed and how — a status or an error name, nothing else. */
  onFailure?: (model: string, reason: string) => void;
  onProviderFallback?: (fromProvider: string, toProvider: string, reason: string) => void;
  onLog?: (log: ObservabilityLog) => void;
}): CallModel {
  const { config, tools, onFailure = () => {}, onProviderFallback = () => {}, onLog } = options;
  const send = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? PER_MODEL_TIMEOUT_MS;
  const sleep =
    options.sleep ??
    ((ms, sig) =>
      new Promise<void>((resolve, reject) => {
        if (sig?.aborted)
          return reject(new DOMException("The operation was aborted", "AbortError"));
        const timer = setTimeout(resolve, ms);
        sig?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new DOMException("The operation was aborted", "AbortError"));
          },
          { once: true },
        );
      }));

  const providers: ProviderConfig[] =
    config.providers && config.providers.length > 0
      ? config.providers
      : [
          {
            name: inferProviderName(config.baseUrl),
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            models: config.models,
          },
        ];

  return async (messages, signal, allowTools) => {
    let last: ProviderFailure = "provider";
    let totalRetries = 0;
    const initialProvider = providers[0]?.name ?? "unknown";
    let lastProvider = initialProvider;
    let lastModel = providers[0]?.models[0] ?? "unknown";
    const startTime = performance.now();

    const emitLog = (log: ObservabilityLog) => {
      onLog?.(log);
    };

    for (let pIdx = 0; pIdx < providers.length; pIdx++) {
      const provider = providers[pIdx];
      lastProvider = provider.name;

      for (const model of provider.models) {
        lastModel = model;
        let modelRetries = 0;
        const maxModelRetries = 2;

        while (modelRetries <= maxModelRetries) {
          try {
            const response = await send(`${provider.baseUrl}/chat/completions`, {
              method: "POST",
              headers: {
                authorization: `Bearer ${provider.apiKey}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                model,
                messages,
                temperature: 0.1,
                max_tokens: MAX_OUTPUT_TOKENS,
                ...(allowTools ? { tools, tool_choice: "auto" } : {}),
              }),
              signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
            });

            if (response.status === 401 || response.status === 403) {
              last = "auth";
              onFailure(model, `status ${response.status}`);
              // If there are no other fallback providers, abort immediately (invalid key)
              if (pIdx === providers.length - 1) {
                emitLog({
                  requestId: options.requestId,
                  orgUnitId: options.orgUnitId,
                  provider: provider.name,
                  model,
                  durationMs: Math.round(performance.now() - startTime),
                  status: "error",
                  errorCategory: "auth",
                  retryCount: totalRetries,
                });
                throw new ProviderError("auth");
              }
              break;
            }

            if (response.status === 429) {
              last = "busy";
              const retryAfter = parseRetryAfter(response);
              // Backoff and retry if short reset window
              if (retryAfter !== null && retryAfter <= 3 && modelRetries < maxModelRetries) {
                modelRetries++;
                totalRetries++;
                const delayMs = Math.min(
                  3000,
                  Math.max(500, retryAfter * 1000) + Math.random() * 200,
                );
                await sleep(delayMs, signal);
                continue;
              }
              onFailure(model, `status 429`);
              break;
            }

            if (response.status === 502 || response.status === 503 || response.status === 504) {
              last = "provider";
              onFailure(model, `status ${response.status}`);
              break;
            }

            if (!response.ok) {
              last = response.status >= 500 ? "provider" : "bad_response";
              onFailure(model, `status ${response.status}`);
              break;
            }

            const parsed = replySchema.safeParse(await response.json().catch(() => null));
            const message = parsed.success ? parsed.data.choices[0].message : null;
            // Some models print their reasoning inline; it is not part of the answer.
            const content =
              message?.content?.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || null;
            const toolCalls = (message?.tool_calls ?? []).map((c) => ({
              ...c,
              type: "function" as const,
            }));

            if (!message || (!content && toolCalls.length === 0)) {
              last = "bad_response";
              onFailure(model, "unusable reply");
              break;
            }

            emitLog({
              requestId: options.requestId,
              orgUnitId: options.orgUnitId,
              provider: provider.name,
              model,
              durationMs: Math.round(performance.now() - startTime),
              status: "success",
              retryCount: totalRetries,
              fallbackProvider: provider.name !== initialProvider ? provider.name : undefined,
            });

            return { content, toolCalls, model };
          } catch (error) {
            if (error instanceof ProviderError) throw error;
            // The whole question ran out of time, or the person left: stop, do not try another model.
            if (signal.aborted) {
              emitLog({
                requestId: options.requestId,
                orgUnitId: options.orgUnitId,
                provider: provider.name,
                model,
                durationMs: Math.round(performance.now() - startTime),
                status: "error",
                errorCategory: "timeout",
                retryCount: totalRetries,
              });
              throw new ProviderError("timeout");
            }
            const isTimeout = error instanceof Error && error.name === "TimeoutError";
            last = isTimeout ? "timeout" : "provider";
            onFailure(model, error instanceof Error ? error.name : "error");
            break;
          }
        }
      }

      if (pIdx < providers.length - 1) {
        const next = providers[pIdx + 1];
        onProviderFallback(provider.name, next.name, `provider exhausted with error: ${last}`);
      }
    }

    emitLog({
      requestId: options.requestId,
      orgUnitId: options.orgUnitId,
      provider: lastProvider,
      model: lastModel,
      durationMs: Math.round(performance.now() - startTime),
      status: "error",
      errorCategory: last,
      retryCount: totalRetries,
    });

    throw new ProviderError(last);
  };
}
