/**
 * Versioned prompt registry (SPEC 05 §4.4, backend mirror).
 * Constant system strings (Groq prompt-cache friendly) + reusable builders.
 */

export interface PromptTemplate {
  id: string;
  version: string;
  system: string;
}

// -- CV extraction ----------------------------------------------------------

export const CV_EXTRACT: PromptTemplate = {
  id: "cv_extract",
  version: "v1",
  system: `You are a professional CV parser. Given the text of a CV/resume, extract the following fields and return ONLY a valid JSON object with no additional text, no markdown, no explanation.

JSON fields to extract:
- skills: array of technical skills (e.g., ["TypeScript", "React", "Node.js"])
- languages: array of spoken languages as full names (e.g., ["Italian", "English"])
- seniority: one of "junior", "mid", "senior", or null if unclear (based on years of experience or explicit mentions)
- availability: one of "full-time", "part-time", "busy", or null if not mentioned
- workModes: array containing any of "remote", "hybrid", "onsite" based on preferences mentioned
- salaryMin: annual gross salary in EUR as a number, or null if not mentioned
- bio: a concise 2-3 sentence professional summary based on the CV content
- confidence: a float between 0 and 1 indicating your confidence in the extraction quality

Respond ONLY with the JSON object.`
};

export const buildCvExtractUser = (cvText: string): string =>
  `Extract profile data from this CV:\n\n${cvText.slice(0, 8000)}`;

// -- Search rerank (REASON tier) --------------------------------------------

export const SEARCH_RERANK: PromptTemplate = {
  id: "search_rerank",
  version: "v1",
  system: `You are a job-search relevance ranker for software/IT roles. Given a developer's search query and a list of candidate jobs (each with an id, title, company, skills, seniority, remote mode), reorder them by relevance to the query's intent.

Consider: technology/stack relevance and related skills, seniority match, remote/onsite intent, and role family. Tolerate typos in the query. Return ONLY a JSON object:
{"ranking": [{"id": "<job id>", "score": <0..1 relevance>}], "rationale": "<one short sentence>"}
Include every candidate id exactly once, ordered best-first.`
};

export interface RerankCandidate {
  id: string;
  title: string;
  company: string;
  skills: string[];
  seniority: string | null;
  remote: boolean;
}

export const buildRerankUser = (query: string, candidates: RerankCandidate[]): string => {
  const lines = candidates.map(
    (c) =>
      `- id=${c.id} | ${c.title} @ ${c.company} | skills=${c.skills.slice(0, 12).join(",")} | seniority=${c.seniority ?? "unknown"} | remote=${c.remote}`
  );
  return `QUERY: ${query}\n\nCANDIDATES:\n${lines.join("\n")}\n\nReturn the JSON ranking.`;
};
