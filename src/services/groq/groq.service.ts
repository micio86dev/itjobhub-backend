import { config } from '../../config';
import logger from '../../utils/logger';

export interface ExtractedProfile {
  skills: string[];
  languages: string[];
  seniority: 'junior' | 'mid' | 'senior' | null;
  availability: 'full-time' | 'part-time' | 'busy' | null;
  workModes: string[];
  salaryMin: number | null;
  bio: string | null;
  confidence: number;
}

const EMPTY_PROFILE: ExtractedProfile = {
  skills: [],
  languages: [],
  seniority: null,
  availability: null,
  workModes: [],
  salaryMin: null,
  bio: null,
  confidence: 0
};

const SYSTEM_PROMPT = `You are a professional CV parser. Given the text of a CV/resume, extract the following fields and return ONLY a valid JSON object with no additional text, no markdown, no explanation.

JSON fields to extract:
- skills: array of technical skills (e.g., ["TypeScript", "React", "Node.js"])
- languages: array of spoken languages as full names (e.g., ["Italian", "English"])
- seniority: one of "junior", "mid", "senior", or null if unclear (based on years of experience or explicit mentions)
- availability: one of "full-time", "part-time", "busy", or null if not mentioned
- workModes: array containing any of "remote", "hybrid", "onsite" based on preferences mentioned
- salaryMin: annual gross salary in EUR as a number, or null if not mentioned
- bio: a concise 2-3 sentence professional summary based on the CV content
- confidence: a float between 0 and 1 indicating your confidence in the extraction quality

Respond ONLY with the JSON object.`;

const stripCodeFences = (text: string): string =>
  text.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();

export const extractProfileFromText = async (pdfText: string): Promise<ExtractedProfile> => {
  if (!config.groq.apiKey) {
    logger.warn('GROQ_API_KEY not configured, returning empty profile');
    return EMPTY_PROFILE;
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.groq.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.groq.model,
        max_tokens: config.groq.maxTokens,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Extract profile data from this CV:\n\n${pdfText.slice(0, 8000)}` }
        ],
        temperature: 0.1
      })
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, 'GROQ API returned non-OK status');
      return EMPTY_PROFILE;
    }

    const json = await response.json();
    const content: string = json?.choices?.[0]?.message?.content ?? '';
    const cleaned = stripCodeFences(content);

    const parsed = JSON.parse(cleaned) as Partial<ExtractedProfile>;

    return {
      skills: Array.isArray(parsed.skills) ? parsed.skills.filter(s => typeof s === 'string') : [],
      languages: Array.isArray(parsed.languages) ? parsed.languages.filter(l => typeof l === 'string') : [],
      seniority: (['junior', 'mid', 'senior'] as const).includes(parsed.seniority as 'junior' | 'mid' | 'senior') ? parsed.seniority as ExtractedProfile['seniority'] : null,
      availability: (['full-time', 'part-time', 'busy'] as const).includes(parsed.availability as 'full-time' | 'part-time' | 'busy') ? parsed.availability as ExtractedProfile['availability'] : null,
      workModes: Array.isArray(parsed.workModes) ? parsed.workModes.filter(m => ['remote', 'hybrid', 'onsite'].includes(m)) : [],
      salaryMin: typeof parsed.salaryMin === 'number' ? parsed.salaryMin : null,
      bio: typeof parsed.bio === 'string' ? parsed.bio : null,
      confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0
    };
  } catch (err) {
    logger.error({ err }, 'GROQ extraction failed');
    return EMPTY_PROFILE;
  }
};
