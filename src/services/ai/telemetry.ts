/**
 * AI telemetry + cost estimation (SPEC 05 §4.6, backend mirror).
 * Backend requests are stateless, so we log per call rather than accumulate.
 */
import logger from "../../utils/logger";

// USD per 1M tokens (input, output) — 2025 Groq public rates; unknown → fast.
const PRICING: Record<string, [number, number]> = {
  "llama-3.1-8b-instant": [0.05, 0.08],
  "qwen/qwen3-32b": [0.29, 0.59],
  "llama-3.3-70b-versatile": [0.59, 0.79]
};
const DEFAULT_PRICE: [number, number] = [0.05, 0.08];

export const costFor = (model: string, tokensIn: number, tokensOut: number): number => {
  const [pin, pout] = PRICING[model] ?? DEFAULT_PRICE;
  return (tokensIn * pin) / 1_000_000 + (tokensOut * pout) / 1_000_000;
};

export interface AICallRecord {
  task: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  cacheHit?: boolean;
  traceId?: string;
}

export const recordAICall = (rec: AICallRecord): void => {
  logger.info(
    {
      task: rec.task,
      model: rec.model,
      tokensIn: rec.tokensIn,
      tokensOut: rec.tokensOut,
      latencyMs: rec.latencyMs,
      cacheHit: rec.cacheHit ?? false,
      costUsd: rec.cacheHit ? 0 : Number(costFor(rec.model, rec.tokensIn, rec.tokensOut).toFixed(6)),
      traceId: rec.traceId ?? ""
    },
    "ai.call"
  );
};
