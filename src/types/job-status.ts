/**
 * Job `status` controlled vocabulary — locked contract (§I.4 of the SDD plan).
 *
 * All persisted job documents use one of these literal strings. Public listings
 * (e.g. `GET /jobs` without `include_expired=true`) MUST exclude `expired`
 * (and implicitly `rejected_*`, which never have a `published_at` and are
 * therefore filtered out upstream by the scraper).
 *
 * Adding a value here requires a coordinated PR across scraper + dashboard.
 */
export const PUBLIC_STATUSES = [
  "active",
  "expired",
  "closed",
  "draft",
  "rejected_quality",
  "rejected_prefilter"
] as const;

export type PublicJobStatus = (typeof PUBLIC_STATUSES)[number];

/**
 * Statuses hidden from public listings unless an explicit override is passed.
 */
export const HIDDEN_PUBLIC_STATUSES: readonly PublicJobStatus[] = [
  "expired",
  "rejected_quality",
  "rejected_prefilter"
] as const;
