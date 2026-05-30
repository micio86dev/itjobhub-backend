/**
 * Model router (SPEC 05 §4.2, backend mirror).
 *
 * Maps a task to a tier to a concrete model (the only place model literals are
 * resolved), runs the provider call, records telemetry, and optionally serves
 * from / writes to a cache. Backend tasks are single-tier (CV extraction is
 * FAST, rerank is REASON); the escalation ladder lives in the scraper where
 * ingestion confidence matters.
 */
import { config } from "../../config";
import logger from "../../utils/logger";
import { AICache, NullCache } from "./cache";
import { GroqProvider, LLMProvider } from "./provider";
import { recordAICall } from "./telemetry";

export type Tier = "fast" | "struct" | "reason";
export type AITask = "CV_EXTRACT" | "SEARCH_RERANK";

const TASK_TIER: Record<AITask, Tier> = {
  CV_EXTRACT: "fast",
  SEARCH_RERANK: "reason"
};

export interface RunOptions<T> {
  task: AITask;
  system: string;
  user: string;
  maxTokens: number;
  parse: (content: string) => T;
  cacheKey?: string;
  traceId?: string;
}

export class ModelRouter {
  constructor(
    private readonly provider: LLMProvider = new GroqProvider(),
    private readonly cache: AICache = new NullCache()
  ) {}

  modelFor(task: AITask): string {
    return config.ai.models[TASK_TIER[task]];
  }

  /** Run a task; returns parsed result or null on provider/parse failure. */
  async run<T>(opts: RunOptions<T>): Promise<T | null> {
    const model = this.modelFor(opts.task);

    if (opts.cacheKey) {
      const cached = this.cache.get(opts.cacheKey);
      if (cached !== null) {
        try {
          const parsed = opts.parse(cached);
          recordAICall({ task: opts.task, model, tokensIn: 0, tokensOut: 0, latencyMs: 0, cacheHit: true, traceId: opts.traceId });
          return parsed;
        } catch {
          /* stale entry — fall through to a live call */
        }
      }
    }

    let content: string;
    let tokensIn = 0;
    let tokensOut = 0;
    let latencyMs = 0;
    try {
      const resp = await this.provider.complete({
        model,
        system: opts.system,
        user: opts.user,
        maxTokens: opts.maxTokens
      });
      content = resp.content;
      tokensIn = resp.tokensIn;
      tokensOut = resp.tokensOut;
      latencyMs = resp.latencyMs;
    } catch (err) {
      logger.warn({ err, task: opts.task, model }, "ai.run_provider_failed");
      return null;
    }

    recordAICall({ task: opts.task, model, tokensIn, tokensOut, latencyMs, traceId: opts.traceId });

    let parsed: T;
    try {
      parsed = opts.parse(content);
    } catch (err) {
      logger.warn({ err, task: opts.task }, "ai.run_parse_failed");
      return null;
    }

    if (opts.cacheKey) {
      this.cache.put(opts.cacheKey, content);
    }
    return parsed;
  }
}
