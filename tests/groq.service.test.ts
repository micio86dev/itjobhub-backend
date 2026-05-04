import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { config } from '../src/config';

// Keep a reference to the original fetch before any mocking
const originalFetch = globalThis.fetch;
const originalApiKey = config.groq.apiKey;

const mockGroqResponse = (content: string) => ({
  choices: [{ message: { content } }]
});

describe('GROQ Service', () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
    // Ensure apiKey is set so service doesn't short-circuit before calling fetch
    config.groq.apiKey = 'test-groq-key';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    config.groq.apiKey = originalApiKey;
  });

  it('should return ExtractedProfile from valid CV text', async () => {
    const mockProfile = {
      skills: ['TypeScript', 'Node.js', 'React'],
      languages: ['Italian', 'English'],
      seniority: 'senior',
      availability: 'full-time',
      workModes: ['remote', 'hybrid'],
      salaryMin: 55000,
      bio: 'Experienced full-stack developer with 8+ years experience.',
      confidence: 0.9
    };

    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify(mockGroqResponse(JSON.stringify(mockProfile))), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    ) as unknown as typeof fetch;

    const { extractProfileFromText } = await import('../src/services/groq/groq.service');
    const result = await extractProfileFromText('Senior developer with 8 years experience in TypeScript and Node.js...');

    expect(result.skills).toContain('TypeScript');
    expect(result.languages).toContain('Italian');
    expect(result.seniority).toBe('senior');
    expect(result.availability).toBe('full-time');
    expect(result.workModes).toContain('remote');
    expect(result.salaryMin).toBe(55000);
    expect(result.confidence).toBe(0.9);
  });

  it('should return empty defaults when GROQ returns malformed JSON', async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify(mockGroqResponse('not valid json at all {{{')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    ) as unknown as typeof fetch;

    const { extractProfileFromText } = await import('../src/services/groq/groq.service');
    const result = await extractProfileFromText('some cv text');

    expect(result.skills).toEqual([]);
    expect(result.languages).toEqual([]);
    expect(result.seniority).toBeNull();
    expect(result.availability).toBeNull();
    expect(result.workModes).toEqual([]);
    expect(result.salaryMin).toBeNull();
    expect(result.bio).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('should handle markdown code fences around JSON', async () => {
    const mockProfile = {
      skills: ['Python', 'Django'],
      languages: ['English'],
      seniority: 'mid',
      availability: 'full-time',
      workModes: ['onsite'],
      salaryMin: null,
      bio: 'Python developer.',
      confidence: 0.85
    };

    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify(mockGroqResponse('```json\n' + JSON.stringify(mockProfile) + '\n```')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    ) as unknown as typeof fetch;

    const { extractProfileFromText } = await import('../src/services/groq/groq.service');
    const result = await extractProfileFromText('Python Django developer...');

    expect(result.skills).toContain('Python');
    expect(result.seniority).toBe('mid');
  });

  it('should handle GROQ API errors gracefully and return defaults', async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      })
    ) as unknown as typeof fetch;

    const { extractProfileFromText } = await import('../src/services/groq/groq.service');
    const result = await extractProfileFromText('some cv text');

    expect(result.skills).toEqual([]);
    expect(result.confidence).toBe(0);
  });

  it('should handle network errors gracefully and return defaults', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('Network error');
    }) as unknown as typeof fetch;

    const { extractProfileFromText } = await import('../src/services/groq/groq.service');
    const result = await extractProfileFromText('some cv text');

    expect(result.skills).toEqual([]);
    expect(result.confidence).toBe(0);
  });
});
