import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { config } from '../src/config';
import { GroqProvider, LLMError, type LLMProvider, type LLMResponse } from '../src/services/ai/provider';
import { ModelRouter } from '../src/services/ai/router';
import { InMemoryTTLCache, NullCache, makeCacheKey, type AICache } from '../src/services/ai/cache';

const originalFetch = globalThis.fetch;
const originalApiKey = config.ai.apiKey;

const groqBody = (content: string) => JSON.stringify({
  choices: [{ message: { content } }],
  usage: { prompt_tokens: 100, completion_tokens: 40 }
});

describe('AI provider', () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
    config.ai.apiKey = 'test-key';
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    config.ai.apiKey = originalApiKey;
  });

  it('returns content + token usage on success', async () => {
    globalThis.fetch = mock(async () =>
      new Response(groqBody('{"ok":true}'), { status: 200 })
    ) as unknown as typeof fetch;

    const resp = await new GroqProvider().complete({
      model: 'qwen/qwen3-32b', system: 's', user: 'u', maxTokens: 100
    });
    expect(resp.content).toBe('{"ok":true}');
    expect(resp.model).toBe('qwen/qwen3-32b');
    expect(resp.tokensIn).toBe(100);
    expect(resp.tokensOut).toBe(40);
  });

  it('throws LLMError on non-OK response', async () => {
    globalThis.fetch = mock(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    await expect(
      new GroqProvider().complete({ model: 'm', system: 's', user: 'u', maxTokens: 10 })
    ).rejects.toBeInstanceOf(LLMError);
  });
});

class FakeProvider implements LLMProvider {
  calls = 0;
  constructor(private content: string, private fail = false) {}
  async complete(): Promise<LLMResponse> {
    this.calls++;
    if (this.fail) throw new LLMError('boom');
    return { content: this.content, model: 'm', tokensIn: 1, tokensOut: 1, latencyMs: 1 };
  }
}

describe('Model router', () => {
  it('maps tasks to configured tier models', () => {
    const router = new ModelRouter(new FakeProvider('{}'));
    expect(router.modelFor('CV_EXTRACT')).toBe(config.ai.models.fast);
    expect(router.modelFor('SEARCH_RERANK')).toBe(config.ai.models.reason);
  });

  it('returns parsed result on success', async () => {
    const router = new ModelRouter(new FakeProvider('{"v":7}'));
    const out = await router.run<{ v: number }>({
      task: 'CV_EXTRACT', system: 's', user: 'u', maxTokens: 10, parse: (c) => JSON.parse(c)
    });
    expect(out).toEqual({ v: 7 });
  });

  it('returns null on provider failure', async () => {
    const router = new ModelRouter(new FakeProvider('{}', true));
    const out = await router.run({ task: 'CV_EXTRACT', system: 's', user: 'u', maxTokens: 10, parse: (c) => JSON.parse(c) });
    expect(out).toBeNull();
  });

  it('returns null on parse failure', async () => {
    const router = new ModelRouter(new FakeProvider('not json'));
    const out = await router.run({ task: 'CV_EXTRACT', system: 's', user: 'u', maxTokens: 10, parse: (c) => JSON.parse(c) });
    expect(out).toBeNull();
  });

  it('serves identical request from cache (one provider call)', async () => {
    const prov = new FakeProvider('{"v":1}');
    const router = new ModelRouter(prov, new InMemoryTTLCache());
    const opts = { task: 'SEARCH_RERANK' as const, system: 's', user: 'u', maxTokens: 10, parse: (c: string) => JSON.parse(c), cacheKey: 'k' };
    await router.run(opts);
    await router.run(opts);
    expect(prov.calls).toBe(1);
  });
});

describe('AI cache', () => {
  it('makeCacheKey is deterministic + sensitive', () => {
    expect(makeCacheKey('t', 'v1', 'p')).toBe(makeCacheKey('t', 'v1', 'p'));
    expect(makeCacheKey('t', 'v1', 'p')).not.toBe(makeCacheKey('t', 'v2', 'p'));
  });

  it('expires entries after ttl', () => {
    const cache = new InMemoryTTLCache();
    cache.put('a', 'x', 0); // already expired
    expect(cache.get('a')).toBeNull();
  });

  it('NullCache never stores', () => {
    const cache: AICache = new NullCache();
    cache.put('a', 'x');
    expect(cache.get('a')).toBeNull();
  });
});
