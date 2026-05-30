/**
 * Embedding abstraction — provider-agnostic and DEFERRED (SPEC 05 §4.7, C-1/C-2).
 *
 * Groq has no embeddings endpoint and the DB is self-hosted Mongo (no Atlas
 * Vector Search), so no concrete embedder is wired yet. This interface + the
 * nullable `embedding` / `embedding_model` / `search_text` schema fields make
 * the system embedding-ready: a future phase can drop in a local (fastembed)
 * or external (Voyage/OpenAI) embedder and a vector store behind this seam and
 * switch retrieval to hybrid (lexical ∪ vector) → rerank.
 */

export interface EmbeddingProvider {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

/** Placeholder that signals embeddings are not configured. */
export class NullEmbeddingProvider implements EmbeddingProvider {
  readonly model = "none";
  async embed(): Promise<number[][]> {
    return [];
  }
}

/** Build the canonical indexable text for a job (used for search_text + future embeddings). */
export const makeSearchText = (job: {
  title?: string | null;
  description?: string | null;
  skills?: string[] | null;
  technical_skills?: string[] | null;
  company?: { name?: string | null } | null;
}): string => {
  const parts = [
    job.title ?? "",
    job.company?.name ?? "",
    ...(job.technical_skills ?? []),
    ...(job.skills ?? []),
    (job.description ?? "").slice(0, 2000)
  ];
  return parts.filter(Boolean).join(" · ").trim();
};

/** The active embedder. Deferred — returns the Null provider until wired. */
export const getEmbeddingProvider = (): EmbeddingProvider => new NullEmbeddingProvider();
