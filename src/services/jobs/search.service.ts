/**
 * AI search reranking (SPEC 05 §4.7).
 *
 * Two-stage search = lexical retrieve (Prisma/Mongo, in job.service) → optional
 * REASON-tier rerank here. Reranking is opt-in (`config.ai.enableRerank`) and
 * cached by (query, candidate-id-set); it reorders the already-retrieved
 * candidates by relevance to the developer's intent (stack, seniority, remote,
 * skill relationships, typo tolerance) and degrades to the original order on
 * any failure. Zero AI cost when disabled or on cache hit.
 */
import { config } from "../../config";
import logger from "../../utils/logger";
import { InMemoryTTLCache } from "../ai/cache";
import { makeCacheKey } from "../ai/cache";
import {
  SEARCH_RERANK,
  buildRerankUser,
  type RerankCandidate
} from "../ai/prompts";
import { ModelRouter } from "../ai/router";

interface RerankResponse {
  ranking: { id: string; score: number }[];
  rationale?: string;
}

interface JobLike {
  id: string;
  title?: string | null;
  skills?: string[] | null;
  technical_skills?: string[] | null;
  seniority?: string | null;
  remote?: boolean | null;
  company?: { name?: string | null } | null;
}

const rerankCache = new InMemoryTTLCache(config.ai.cacheTtlMs);
const router = new ModelRouter(undefined, rerankCache);

const toCandidate = (job: JobLike): RerankCandidate => ({
  id: job.id,
  title: job.title ?? "",
  company: job.company?.name ?? "",
  skills: [...(job.technical_skills ?? []), ...(job.skills ?? [])],
  seniority: job.seniority ?? null,
  remote: Boolean(job.remote)
});

const parseRerank = (content: string): RerankResponse => {
  const parsed = JSON.parse(content) as RerankResponse;
  if (!Array.isArray(parsed.ranking)) {
    throw new Error("rerank response missing ranking[]");
  }
  return parsed;
};

/**
 * Reorder `jobs` by AI relevance to `query`. Returns the input unchanged when
 * rerank is disabled, the query is empty, there are too few candidates, or the
 * model call fails. Only the first `config.ai.rerankCandidates` are reranked.
 */
export const rerankJobs = async <T extends JobLike>(query: string, jobs: T[]): Promise<T[]> => {
  if (!config.ai.enableRerank || !query?.trim() || jobs.length < 2) {
    return jobs;
  }

  const head = jobs.slice(0, config.ai.rerankCandidates);
  const tail = jobs.slice(config.ai.rerankCandidates);
  const candidates = head.map(toCandidate);
  const cacheKey = makeCacheKey(
    SEARCH_RERANK.id,
    SEARCH_RERANK.version,
    `${query.trim().toLowerCase()}|${head.map((j) => j.id).join(",")}`
  );

  const result = await router.run<RerankResponse>({
    task: "SEARCH_RERANK",
    system: SEARCH_RERANK.system,
    user: buildRerankUser(query, candidates),
    maxTokens: config.ai.maxTokens.rerank,
    parse: parseRerank,
    cacheKey,
    traceId: cacheKey.slice(0, 12)
  });

  if (!result) {
    return jobs; // degrade to lexical order
  }

  return applyRanking(head, result.ranking).concat(tail);
};

/** Reorder `head` by the model's ranking; unranked items keep their order at the end. */
export const applyRanking = <T extends JobLike>(
  head: T[],
  ranking: { id: string; score: number }[]
): T[] => {
  const byId = new Map(head.map((j) => [j.id, j]));
  const ordered: T[] = [];
  const seen = new Set<string>();
  for (const { id } of ranking) {
    const job = byId.get(id);
    if (job && !seen.has(id)) {
      ordered.push(job);
      seen.add(id);
    }
  }
  // Any candidate the model omitted keeps its original relative position.
  for (const job of head) {
    if (!seen.has(job.id)) ordered.push(job);
  }
  if (ordered.length !== head.length) {
    logger.warn({ expected: head.length, got: ordered.length }, "search.rerank_size_mismatch");
  }
  return ordered;
};
