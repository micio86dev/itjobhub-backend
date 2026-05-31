import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { config } from '../src/config';
import { applyRanking, rerankJobs } from '../src/services/jobs/search.service';

const originalFetch = globalThis.fetch;
const originalEnable = config.ai.enableRerank;
const originalKey = config.ai.apiKey;

interface J { id: string; title: string; skills?: string[]; seniority?: string | null; remote?: boolean; company?: { name: string }; }

const jobs: J[] = [
  { id: 'a', title: 'Junior PHP Dev', skills: ['PHP'], seniority: 'junior', remote: false, company: { name: 'X' } },
  { id: 'b', title: 'Senior Go Engineer', skills: ['Go', 'Kubernetes'], seniority: 'senior', remote: true, company: { name: 'Y' } },
  { id: 'c', title: 'React Frontend', skills: ['React'], seniority: 'mid', remote: true, company: { name: 'Z' } }
];

describe('applyRanking', () => {
  it('reorders by the model ranking', () => {
    const out = applyRanking(jobs, [{ id: 'c', score: 0.9 }, { id: 'b', score: 0.8 }, { id: 'a', score: 0.1 }]);
    expect(out.map((j) => j.id)).toEqual(['c', 'b', 'a']);
  });

  it('keeps omitted candidates in original order at the end', () => {
    const out = applyRanking(jobs, [{ id: 'b', score: 0.9 }]);
    expect(out.map((j) => j.id)).toEqual(['b', 'a', 'c']);
  });

  it('ignores duplicate / unknown ids', () => {
    const out = applyRanking(jobs, [{ id: 'b', score: 1 }, { id: 'b', score: 1 }, { id: 'zzz', score: 1 }]);
    expect(out.map((j) => j.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('rerankJobs', () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
    config.ai.apiKey = 'test-key';
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    config.ai.enableRerank = originalEnable;
    config.ai.apiKey = originalKey;
  });

  it('is a no-op when rerank is disabled', async () => {
    config.ai.enableRerank = false;
    const out = await rerankJobs('go kubernetes', jobs);
    expect(out.map((j) => j.id)).toEqual(['a', 'b', 'c']);
  });

  it('is a no-op for empty query or single candidate', async () => {
    config.ai.enableRerank = true;
    expect((await rerankJobs('', jobs)).map((j) => j.id)).toEqual(['a', 'b', 'c']);
    expect((await rerankJobs('go', [jobs[0]]))[0].id).toBe('a');
  });

  it('reorders via the model when enabled', async () => {
    config.ai.enableRerank = true;
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ ranking: [{ id: 'b', score: 0.95 }, { id: 'c', score: 0.5 }, { id: 'a', score: 0.1 }], rationale: 'go match' }) } }],
        usage: { prompt_tokens: 50, completion_tokens: 20 }
      }), { status: 200 })
    ) as unknown as typeof fetch;

    const out = await rerankJobs('senior go kubernetes remote', jobs);
    expect(out.map((j) => j.id)).toEqual(['b', 'c', 'a']);
  });

  it('degrades to lexical order on provider error', async () => {
    config.ai.enableRerank = true;
    globalThis.fetch = mock(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    const out = await rerankJobs('go', jobs);
    expect(out.map((j) => j.id)).toEqual(['a', 'b', 'c']);
  });
});
