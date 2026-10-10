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

export type ProviderFailure = "config" | "auth" | "busy" | "timeout" | "bad_response" | "provider";

/** What the person is told; never the provider's own words, which can carry account details. */
export const PROVIDER_MESSAGES: Record<ProviderFailure, string> = {
  config: "The assistant is not set up on this server. Ask an Admin.",
  auth: "The AI service refused the request. Ask an Admin to check the assistant's key.",
  busy: "The AI service is busy right now. Try again in a minute.",
  timeout: "The assistant took too long. Try again, or ask a narrower question.",
  bad_response: "The assistant could not produce an answer. Try rephrasing the question.",
  provider: "The AI service is not available right now. Try again in a minute.",
};

export class ProviderError extends Error {
  kind: ProviderFailure;
  constructor(kind: ProviderFailure) {
    super(PROVIDER_MESSAGES[kind]);
    this.kind = kind;
  }
}

export type ChatConfig = { apiKey: string; baseUrl: string; models: string[]; databaseUrl: string };

/**
 * The chatbot's settings, or null when any is missing — the chatbot is then off and its entry points are
 * not shown. NVIDIA_NIM_MODEL is one model or a comma-separated list in order of preference.
 */
export function readConfig(env: Record<string, string | undefined>): ChatConfig | null {
  const apiKey = env.NVIDIA_NIM_API_KEY?.trim();
  const databaseUrl = env.CHAT_DATABASE_URL?.trim();
  const models = (env.NVIDIA_NIM_MODEL ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  if (!apiKey || !databaseUrl || models.length === 0) return null;
  const baseUrl = (env.NVIDIA_NIM_BASE_URL?.trim() || "https://integrate.api.nvidia.com/v1")
    .replace(/\/chat\/completions\/?$/, "")
    .replace(/\/+$/, "");
  return { apiKey, baseUrl, models, databaseUrl };
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

export function createModelCaller(options: {
  config: ChatConfig;
  /** The tool list in the provider's format. */
  tools: unknown[];
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Told which model failed and how — a status or an error name, nothing else. */
  onFailure?: (model: string, reason: string) => void;
}): CallModel {
  const { config, tools, onFailure = () => {} } = options;
  const send = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? PER_MODEL_TIMEOUT_MS;

  return async (messages, signal, allowTools) => {
    let last: ProviderFailure = "provider";
    // A model that is rate limited, out of quota, not enabled for the account or simply down gives way to
    // the next one on the list. Only a refused key stops at once: no other model would accept it.
    for (const model of config.models) {
      try {
        const response = await send(`${config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.1,
            max_tokens: MAX_OUTPUT_TOKENS,
            ...(allowTools ? { tools, tool_choice: "auto" } : {}),
          }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
        });
        if (response.status === 401 || response.status === 403) throw new ProviderError("auth");
        if (!response.ok) {
          last = response.status === 429 ? "busy" : "provider";
          onFailure(model, `status ${response.status}`);
          continue;
        }
        const parsed = replySchema.safeParse(await response.json().catch(() => null));
        const message = parsed.success ? parsed.data.choices[0].message : null;
        // Some models print their reasoning inline; it is not part of the answer.
        const content = message?.content?.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || null;
        const toolCalls = (message?.tool_calls ?? []).map((c) => ({
          ...c,
          type: "function" as const,
        }));
        if (!message || (!content && toolCalls.length === 0)) {
          last = "bad_response";
          onFailure(model, "unusable reply");
          continue;
        }
        return { content, toolCalls, model };
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        // The whole question ran out of time, or the person left: stop, do not try another model.
        if (signal.aborted) throw new ProviderError("timeout");
        last = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "provider";
        onFailure(model, error instanceof Error ? error.name : "error");
      }
    }
    throw new ProviderError(last);
  };
}
