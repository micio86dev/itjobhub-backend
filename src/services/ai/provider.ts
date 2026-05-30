/**
 * Provider-agnostic LLM interface (SPEC 05 §4.1, backend mirror).
 *
 * The single place that talks to the Groq HTTP API. Uses the global `fetch`
 * (so tests can mock `globalThis.fetch`). Performs one round-trip and throws
 * `LLMError` on a non-OK response; retry/fallback policy lives in the router.
 */
import { config } from "../../config";
import logger from "../../utils/logger";

export interface LLMRequest {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

export class LLMError extends Error {}

export interface LLMProvider {
  complete(req: LLMRequest): Promise<LLMResponse>;
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export class GroqProvider implements LLMProvider {
  // Key resolved lazily at call time (config may be mutated, e.g. by tests).
  constructor(private readonly apiKeyOverride?: string) {}

  private resolveKey(): string {
    return this.apiKeyOverride || config.ai.apiKey || config.groq.apiKey || "";
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const apiKey = this.resolveKey();
    if (!apiKey) {
      throw new LLMError("AI provider API key not configured");
    }
    const startedAt = Date.now();
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens,
        temperature: req.temperature ?? 0.1,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user }
        ]
      })
    });

    if (!response.ok) {
      logger.warn({ status: response.status, model: req.model }, "ai.provider_non_ok");
      throw new LLMError(`Groq returned status ${response.status}`);
    }

    const json = await response.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    const usage = json?.usage ?? {};
    return {
      content,
      model: req.model,
      tokensIn: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0,
      tokensOut: typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0,
      latencyMs: Date.now() - startedAt
    };
  }
}
