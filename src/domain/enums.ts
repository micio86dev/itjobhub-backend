import type { SupportedLanguage } from "../i18n";

/**
 * Canonical taxonomies (single source of truth).
 *
 * Every categorical field that used to be hard-coded independently across the
 * backend, dashboard and frontend is defined here exactly once. Clients consume
 * the localized option lists through `GET /enums` instead of re-declaring them,
 * which is what keeps Disponibilità / Ruolo / Seniority / Modalità / Tipo di
 * lavoro consistent everywhere.
 *
 * Conventions:
 *  - Employment/availability tokens use a hyphen separator ("full-time") to
 *    match the values already stored on user profiles and exposed by the public
 *    job API. Read paths normalise legacy/scraped spellings — see
 *    `services/jobs/match.service.ts`.
 *  - Availability == the employment types a candidate is open to, plus the
 *    "busy" status, so it is derived from EMPLOYMENT_TYPES (DRY).
 */

export const ROLES = ["user", "admin"] as const;
export const SENIORITY_LEVELS = ["junior", "mid", "senior", "lead"] as const;
export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
export const EMPLOYMENT_TYPES = [
  "full-time",
  "part-time",
  "contract",
  "freelance",
  "internship",
] as const;
export const AVAILABILITY = [...EMPLOYMENT_TYPES, "busy"] as const;

export type Role = (typeof ROLES)[number];
export type SeniorityLevel = (typeof SENIORITY_LEVELS)[number];
export type WorkMode = (typeof WORK_MODES)[number];
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export type Availability = (typeof AVAILABILITY)[number];

/** Stable field keys returned by `GET /enums`. */
export const ENUM_FIELDS = [
  "role",
  "seniority",
  "workMode",
  "employmentType",
  "availability",
] as const;
export type EnumField = (typeof ENUM_FIELDS)[number];

export const ENUM_VALUES: Record<EnumField, readonly string[]> = {
  role: ROLES,
  seniority: SENIORITY_LEVELS,
  workMode: WORK_MODES,
  employmentType: EMPLOYMENT_TYPES,
  availability: AVAILABILITY,
};

/**
 * Localized labels keyed by canonical value. Values are globally unique across
 * fields (the only intentional overlap is employmentType ⊂ availability), so a
 * single flat map per language is enough and avoids repeating the shared labels.
 */
const LABELS: Record<SupportedLanguage, Record<string, string>> = {
  it: {
    user: "Utente",
    admin: "Admin",
    junior: "Junior",
    mid: "Mid",
    senior: "Senior",
    lead: "Lead",
    remote: "Remoto",
    hybrid: "Ibrido",
    onsite: "In sede",
    "full-time": "Tempo pieno",
    "part-time": "Part-time",
    contract: "A contratto",
    freelance: "Freelance",
    internship: "Stage",
    busy: "Occupato",
  },
  en: {
    user: "User",
    admin: "Admin",
    junior: "Junior",
    mid: "Mid",
    senior: "Senior",
    lead: "Lead",
    remote: "Remote",
    hybrid: "Hybrid",
    onsite: "On-site",
    "full-time": "Full-time",
    "part-time": "Part-time",
    contract: "Contract",
    freelance: "Freelance",
    internship: "Internship",
    busy: "Busy",
  },
  fr: {
    user: "Utilisateur",
    admin: "Admin",
    junior: "Junior",
    mid: "Mid",
    senior: "Senior",
    lead: "Lead",
    remote: "À distance",
    hybrid: "Hybride",
    onsite: "Sur site",
    "full-time": "Temps plein",
    "part-time": "Temps partiel",
    contract: "Contrat",
    freelance: "Freelance",
    internship: "Stage",
    busy: "Occupé",
  },
  es: {
    user: "Usuario",
    admin: "Admin",
    junior: "Junior",
    mid: "Mid",
    senior: "Senior",
    lead: "Lead",
    remote: "Remoto",
    hybrid: "Híbrido",
    onsite: "Presencial",
    "full-time": "Tiempo completo",
    "part-time": "Tiempo parcial",
    contract: "Contrato",
    freelance: "Freelance",
    internship: "Prácticas",
    busy: "Ocupado",
  },
  de: {
    user: "Benutzer",
    admin: "Admin",
    junior: "Junior",
    mid: "Mid",
    senior: "Senior",
    lead: "Lead",
    remote: "Remote",
    hybrid: "Hybrid",
    onsite: "Vor Ort",
    "full-time": "Vollzeit",
    "part-time": "Teilzeit",
    contract: "Vertrag",
    freelance: "Freelance",
    internship: "Praktikum",
    busy: "Beschäftigt",
  },
};

const resolveLang = (lang: string): SupportedLanguage =>
  (LABELS[lang as SupportedLanguage] ? lang : "en") as SupportedLanguage;

/** Localized label for a single canonical value (falls back to the value). */
export const enumLabel = (value: string, lang: string = "en"): string =>
  LABELS[resolveLang(lang)][value] ?? value;

export interface EnumOption {
  value: string;
  label: string;
}

/** All taxonomies, localized — the payload served by `GET /enums`. */
export const getEnums = (lang: string = "en"): Record<EnumField, EnumOption[]> => {
  const language = resolveLang(lang);
  const out = {} as Record<EnumField, EnumOption[]>;
  for (const field of ENUM_FIELDS) {
    out[field] = ENUM_VALUES[field].map((value) => ({
      value,
      label: LABELS[language][value] ?? value,
    }));
  }
  return out;
};

/** True when `value` is a member of the given canonical taxonomy. */
export const isValidEnumValue = (field: EnumField, value: string): boolean =>
  ENUM_VALUES[field].includes(value);
