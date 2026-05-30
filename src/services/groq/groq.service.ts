import { config } from '../../config';
import logger from '../../utils/logger';
import { CV_EXTRACT, buildCvExtractUser } from '../ai/prompts';
import { ModelRouter } from '../ai/router';

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

const stripCodeFences = (text: string): string =>
  text.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();

/** Normalize raw model JSON into a validated ExtractedProfile. */
const parseProfile = (content: string): ExtractedProfile => {
  const parsed = JSON.parse(stripCodeFences(content)) as Partial<ExtractedProfile>;
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
};

const router = new ModelRouter();

/**
 * Extract a candidate profile from raw CV text via the unified AI layer
 * (SPEC 05): the CV_EXTRACT task routes to the FAST tier. Returns an empty
 * profile when the key is missing or the provider/parse fails.
 */
export const extractProfileFromText = async (pdfText: string): Promise<ExtractedProfile> => {
  if (!config.ai.apiKey && !config.groq.apiKey) {
    logger.warn('GROQ_API_KEY not configured, returning empty profile');
    return EMPTY_PROFILE;
  }

  const result = await router.run<ExtractedProfile>({
    task: 'CV_EXTRACT',
    system: CV_EXTRACT.system,
    user: buildCvExtractUser(pdfText),
    maxTokens: config.ai.maxTokens.extract,
    parse: parseProfile
  });

  return result ?? EMPTY_PROFILE;
};
