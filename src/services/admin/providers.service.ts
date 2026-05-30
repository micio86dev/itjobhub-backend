import { getMongoDb } from "../../lib/mongo";

/* ------------------------------------------------------------------ */
/* Provider catalog config — backs the dashboard "Sources config" page. */
/* Documents live in the `providers` collection, seeded by the scraper  */
/* (`scripts/seed_providers.py`) and gated at run time by               */
/* `is_provider_enabled()`. Flipping `enabled` here directly controls   */
/* which connectors the next import run executes.                       */
/* ------------------------------------------------------------------ */

export type ProviderPricingTier = "free" | "freemium" | "metered";
export type ProviderSourceType = "api" | "rss" | "ats" | "aggregator";

export interface ProviderConfig {
    slug: string;
    name: string;
    enabled: boolean;
    pricing_tier: ProviderPricingTier;
    source_type: ProviderSourceType;
    geo: string;
    source_url: string;
    notes: string;
    requires_auth: boolean;
    auth_env_vars: string[];
    credentials_present: boolean;
    updated_at: string | null;
}

interface ProviderDoc {
    slug: string;
    name?: string;
    enabled?: boolean;
    pricing_tier?: string;
    source_type?: string;
    geo?: string;
    source_url?: string;
    notes?: string;
    requires_auth?: boolean;
    auth_env_vars?: string[];
    credentials_present?: boolean;
    updated_at?: Date | string | null;
}

const TIER_ORDER: Record<ProviderPricingTier, number> = {
    free: 0,
    freemium: 1,
    metered: 2,
};

const VALID_TIERS: ReadonlySet<string> = new Set(["free", "freemium", "metered"]);
const VALID_SOURCE_TYPES: ReadonlySet<string> = new Set([
    "api",
    "rss",
    "ats",
    "aggregator",
]);

const toTier = (raw: string | undefined): ProviderPricingTier =>
    raw && VALID_TIERS.has(raw) ? (raw as ProviderPricingTier) : "free";

const toSourceType = (raw: string | undefined): ProviderSourceType =>
    raw && VALID_SOURCE_TYPES.has(raw) ? (raw as ProviderSourceType) : "api";

const toIso = (value: Date | string | null | undefined): string | null => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    return String(value);
};

const mapDoc = (doc: ProviderDoc): ProviderConfig => {
    const authEnvVars = Array.isArray(doc.auth_env_vars) ? doc.auth_env_vars : [];
    return {
        slug: doc.slug,
        name: doc.name ?? doc.slug,
        enabled: Boolean(doc.enabled),
        pricing_tier: toTier(doc.pricing_tier),
        source_type: toSourceType(doc.source_type),
        geo: doc.geo ?? "",
        source_url: doc.source_url ?? "",
        notes: doc.notes ?? "",
        requires_auth: doc.requires_auth ?? authEnvVars.length > 0,
        auth_env_vars: authEnvVars,
        credentials_present: doc.credentials_present ?? authEnvVars.length === 0,
        updated_at: toIso(doc.updated_at),
    };
};

/** All providers, ordered by pricing tier (free → freemium → metered) then name. */
export async function listProviders(): Promise<ProviderConfig[]> {
    const db = await getMongoDb();
    const docs = await db
        .collection<ProviderDoc>("providers")
        .find({}, { projection: { _id: 0 } })
        .toArray();

    return docs
        .map(mapDoc)
        .sort(
            (a, b) =>
                TIER_ORDER[a.pricing_tier] - TIER_ORDER[b.pricing_tier] ||
                a.name.localeCompare(b.name),
        );
}

/**
 * Flip a provider's `enabled` flag. Returns the updated config, or `null` when
 * no provider matches `slug` (caller maps that to 404).
 */
export async function setProviderEnabled(
    slug: string,
    enabled: boolean,
): Promise<ProviderConfig | null> {
    const db = await getMongoDb();
    const result = await db.collection<ProviderDoc>("providers").findOneAndUpdate(
        { slug },
        { $set: { enabled, updated_at: new Date() } },
        { returnDocument: "after", projection: { _id: 0 } },
    );

    if (!result) return null;
    return mapDoc(result as ProviderDoc);
}
