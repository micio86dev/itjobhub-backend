/**
 * OAuth Service
 * Handles OAuth authentication flow for GitHub, LinkedIn, and Google
 */

import { dbClient } from '../../config/database';
import { oauthConfig, getOAuthCallbackUrl, OAuthProvider, isOAuthConfigured } from '../../config/oauth.config';
import logger from "../../utils/logger";
import { fetchWithRetry, fetchWithTimeout } from '../../utils/fetch-utils';
import type { User, UserProfile } from '@prisma/client';

/**
 * User with optional profile relation
 */
type UserWithProfile = User & { profile: UserProfile | null };

export interface OAuthUserData {
    provider: OAuthProvider;
    providerId: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    bio?: string;
    location?: string;
    websiteUrl?: string;
    githubUrl?: string;
    linkedinUrl?: string;
    languages?: string[];
    skills?: string[];
}

/**
 * Generate the authorization URL for a provider
 */
export const getAuthorizationUrl = (provider: OAuthProvider, state?: string): string => {
    const config = oauthConfig[provider];
    const callbackUrl = getOAuthCallbackUrl(provider);

    const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: callbackUrl,
        scope: config.scopes.join(' '),
        response_type: 'code',
    });

    if (state) {
        params.append('state', state);
    }

    // LinkedIn requires response_type in a specific format
    if (provider === 'linkedin') {
        params.set('response_type', 'code');
    }

    // Google requires access_type for refresh tokens
    if (provider === 'google') {
        params.append('access_type', 'offline');
        params.append('prompt', 'consent');
    }

    return `${config.authorizeUrl}?${params.toString()}`;
};

/**
 * Exchange authorization code for access token
 */
export const exchangeCodeForTokens = async (
    provider: OAuthProvider,
    code: string
): Promise<{ accessToken: string; refreshToken?: string }> => {
    const config = oauthConfig[provider];
    const callbackUrl = getOAuthCallbackUrl(provider);

    logger.info({ provider }, 'Exchanging authorization code for tokens');

    const body = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
    });

    const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
    };

    logger.info({ provider, callbackUrl }, 'Exchanging auth code with callback URL');

    // GitHub requires Accept header for JSON response
    if (provider === 'github') {
        headers['Accept'] = 'application/json';
    }

    try {
        // Use fetchWithRetry for better error handling
        const response = await fetchWithRetry(config.tokenUrl, {
            method: 'POST',
            headers,
            body: body.toString(),
            timeout: 15000, // 15 second timeout
            maxRetries: 2,
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error({ provider, status: response.status, error: errorText }, 'Failed to exchange code for tokens');
            throw new Error(`Failed to exchange code for tokens: ${errorText}`);
        }

        const data = await response.json();
        logger.info({ provider }, 'Successfully exchanged code for tokens');

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
        };
    } catch (error) {
        logger.error({ provider, error }, 'Error exchanging code for tokens');
        throw error;
    }
};

/**
 * Fetch user data from provider
 */
export const getProviderUserData = async (
    provider: OAuthProvider,
    accessToken: string
): Promise<OAuthUserData> => {
    const config = oauthConfig[provider];

    logger.info({ provider }, 'Fetching user data from provider');

    try {
        const response = await fetchWithTimeout(config.userInfoUrl, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
            timeout: 10000, // 10 second timeout
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error({ provider, status: response.status, error: errorText }, 'Failed to fetch user data');
            throw new Error(`Failed to fetch user data: ${errorText}`);
        }

        const data = await response.json();
        logger.info({ provider }, 'Successfully fetched user data');

        // Map provider-specific data to our format
        switch (provider) {
            case 'github':
                return mapGitHubUserData(data, accessToken);
            case 'linkedin':
                return mapLinkedInUserData(data);
            case 'google':
                return mapGoogleUserData(data);
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    } catch (error) {
        logger.error({ provider, error }, 'Error fetching user data from provider');
        throw error;
    }
};

/**
 * Map GitHub user data to our format
 */
const mapGitHubUserData = async (data: Record<string, unknown>, accessToken: string): Promise<OAuthUserData> => {
    // GitHub might not return email in main request, need to fetch from emails endpoint
    let email = data.email as string;

    if (!email) {
        try {
            const emailsResponse = await fetchWithTimeout('https://api.github.com/user/emails', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/json',
                },
                timeout: 5000,
            });

            if (emailsResponse.ok) {
                const emails = await emailsResponse.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
                const primaryEmail = emails.find(e => e.primary && e.verified);
                email = primaryEmail?.email || emails[0]?.email || '';
            }
        } catch (error) {
            logger.warn({ error }, 'Failed to fetch GitHub emails');
        }
    }

    // Fetch user repos to infer skills/languages
    const languagesSet = new Set<string>();
    const skillsSet = new Set<string>();

    try {
        const reposResponse = await fetchWithTimeout('https://api.github.com/user/repos?sort=pushed&per_page=10', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
            timeout: 5000,
        });

        if (reposResponse.ok) {
            const repos = await reposResponse.json() as Array<{ language: string }>;
            repos.forEach(repo => {
                if (repo.language) {
                    const lang = repo.language.toLowerCase();
                    languagesSet.add(lang);
                    skillsSet.add(repo.language); // Use original casing for skills display initially, or normalize
                }
            });
        }
    } catch (error) {
        logger.warn({ error }, 'Failed to fetch GitHub repos for skills inference');
    }

    const name = (data.name as string) || (data.login as string) || '';
    const nameParts = name.split(' ');

    return {
        provider: 'github',
        providerId: String(data.id),
        email,
        firstName: nameParts[0] || 'GitHub',
        lastName: nameParts.slice(1).join(' ') || 'User',
        avatar: data.avatar_url as string,
        bio: data.bio as string,
        location: data.location as string,
        githubUrl: data.html_url as string,
        websiteUrl: data.blog as string,
        languages: Array.from(languagesSet),
        skills: Array.from(skillsSet),
    };
};

/**
 * Map LinkedIn user data to our format (using OpenID Connect)
 */
const mapLinkedInUserData = (data: Record<string, unknown>): OAuthUserData => {
    // Map locale to language if available (e.g. "it_IT" -> "Italian")
    const languages = [];
    if (data.locale) {
        let localeStr = '';
        if (typeof data.locale === 'string') {
            localeStr = data.locale;
        } else if (typeof data.locale === 'object' && data.locale !== null) {
            // Handle structured locale object e.g. { country: 'US', language: 'en' }
            const localeObj = data.locale as { language?: string; country?: string };
            if (localeObj.language) {
                localeStr = localeObj.language;
            }
        }

        if (localeStr) {
            const langCode = localeStr.substring(0, 2).toLowerCase();
            if (langCode === 'it') languages.push('italian');
            else if (langCode === 'en') languages.push('english');
            else if (langCode === 'fr') languages.push('french');
            else if (langCode === 'de') languages.push('german');
            else if (langCode === 'es') languages.push('spanish');
        }
    }

    return {
        provider: 'linkedin',
        providerId: data.sub as string,
        email: data.email as string,
        firstName: data.given_name as string || 'LinkedIn',
        lastName: data.family_name as string || 'User',
        avatar: data.picture as string,
        linkedinUrl: `https://www.linkedin.com/in/${data.sub}`, // Note: OIDC sub might not be public ID
        languages,
    };
};

/**
 * Map Google user data to our format
 */
const mapGoogleUserData = (data: Record<string, unknown>): OAuthUserData => {
    const languages = [];
    if (data.locale) {
        const locale = (data.locale as string).substring(0, 2).toLowerCase();
        if (locale === 'it') languages.push('italian');
        else if (locale === 'en') languages.push('english');
        else if (locale === 'fr') languages.push('french');
        else if (locale === 'de') languages.push('german');
        else if (locale === 'es') languages.push('spanish');
    }

    return {
        provider: 'google',
        providerId: data.id as string,
        email: data.email as string,
        firstName: data.given_name as string || 'Google',
        lastName: data.family_name as string || 'User',
        avatar: data.picture as string,
        languages,
    };
};

/**
 * Find existing user by OAuth provider or create new one
 */
export const findOrCreateOAuthUser = async (userData: OAuthUserData) => {
    // First, try to find by OAuth provider ID
    let user = await dbClient.user.findFirst({
        where: {
            oauth_provider: userData.provider,
            oauth_id: userData.providerId,
        },
        include: { profile: true },
    });

    // Helper to enrich profile data for existing users
    const enrichProfile = async (user: UserWithProfile): Promise<void> => {
        if (!user.profile) {
            // Should not happen usually as we create profile on signup, but for safety
            interface NewProfileData {
                user_id: string;
                languages: string[];
                skills: string[];
                bio?: string;
                github?: string;
                linkedin?: string;
                website?: string;
                location?: string;
            }
            const profileData: NewProfileData = {
                user_id: user.id,
                languages: userData.languages || [],
                skills: userData.skills || [],
                bio: userData.bio,
                github: userData.githubUrl,
                linkedin: userData.linkedinUrl,
                website: userData.websiteUrl,
                location: userData.location,
            };
            await dbClient.userProfile.create({ data: profileData });
            return;
        }

        interface ProfileUpdateData {
            languages?: string[];
            skills?: string[];
            bio?: string;
            github?: string;
            linkedin?: string;
            website?: string;
            location?: string;
        }
        const updateData: ProfileUpdateData = {};

        // Only update if field is missing in DB but present in OAuth data
        if ((!user.profile.languages || user.profile.languages.length === 0) && userData.languages && userData.languages.length > 0) {
            updateData.languages = userData.languages;
        }
        if ((!user.profile.skills || user.profile.skills.length === 0) && userData.skills && userData.skills.length > 0) {
            updateData.skills = userData.skills;
        }
        if (!user.profile.bio && userData.bio) updateData.bio = userData.bio;
        if (!user.profile.github && userData.githubUrl) updateData.github = userData.githubUrl;
        if (!user.profile.linkedin && userData.linkedinUrl) updateData.linkedin = userData.linkedinUrl;
        if (!user.profile.website && userData.websiteUrl) updateData.website = userData.websiteUrl;
        if (!user.profile.location && userData.location) updateData.location = userData.location;

        if (Object.keys(updateData).length > 0) {
            await dbClient.userProfile.update({
                where: { id: user.profile.id },
                data: updateData,
            });
            logger.info({ userId: user.id, fields: Object.keys(updateData) }, 'Enriched existing user profile with OAuth data');
        }
    };

    if (user) {
        logger.info({ userId: user.id, provider: userData.provider }, 'OAuth user found, logging in');
        await enrichProfile(user);

        // Re-fetch to get updated profile if needed
        return dbClient.user.findUnique({
            where: { id: user.id },
            include: { profile: true },
        });
    }

    // Check if user exists with same email (linking accounts)
    const existingEmailUser = await dbClient.user.findUnique({
        where: { email: userData.email },
        include: { profile: true },
    });

    if (existingEmailUser) {
        // Link OAuth to existing account
        user = await dbClient.user.update({
            where: { id: existingEmailUser.id },
            data: {
                oauth_provider: userData.provider,
                oauth_id: userData.providerId,
                // Update avatar if not set
                avatar: existingEmailUser.avatar || userData.avatar,
            },
            include: { profile: true },
        });
        logger.info({ userId: user.id, provider: userData.provider }, 'Linked OAuth to existing account');

        await enrichProfile(user);

        return dbClient.user.findUnique({
            where: { id: user.id },
            include: { profile: true },
        });
    }

    // Create new user
    user = await dbClient.user.create({
        data: {
            email: userData.email,
            first_name: userData.firstName,
            last_name: userData.lastName,
            oauth_provider: userData.provider,
            oauth_id: userData.providerId,
            avatar: userData.avatar,
            bio: userData.bio,
            location: userData.location,
            role: 'user',
        },
        include: { profile: true },
    });

    // Create profile with additional data
    const profileData: {
        user_id: string;
        bio?: string;
        github?: string;
        linkedin?: string;
        website?: string;
        location?: string;
        languages: string[];
        skills: string[];
    } = {
        user_id: user.id,
        languages: [],
        skills: [],
    };

    if (userData.bio) profileData.bio = userData.bio;
    if (userData.githubUrl) profileData.github = userData.githubUrl;
    if (userData.linkedinUrl) profileData.linkedin = userData.linkedinUrl;
    if (userData.websiteUrl) profileData.website = userData.websiteUrl;
    if (userData.location) profileData.location = userData.location;
    if (userData.languages) profileData.languages = userData.languages;
    if (userData.skills) profileData.skills = userData.skills;

    await dbClient.userProfile.create({ data: profileData });

    // Re-fetch with profile
    user = await dbClient.user.findUnique({
        where: { id: user.id },
        include: { profile: true },
    });

    logger.info({ userId: user?.id, provider: userData.provider }, 'Created new OAuth user');
    return user;
};

/**
 * Process OAuth callback: exchange code and create/login user
 */
export const processOAuthCallback = async (provider: OAuthProvider, code: string) => {
    logger.info({ provider }, 'Processing OAuth callback');

    if (!isOAuthConfigured(provider)) {
        throw new Error(`OAuth not configured for ${provider}`);
    }

    try {
        // Exchange code for tokens
        logger.debug({ provider }, 'Step 1/3: Exchanging code for tokens');
        const { accessToken } = await exchangeCodeForTokens(provider, code);

        // Get user data from provider
        logger.debug({ provider }, 'Step 2/3: Fetching user data');
        const userData = await getProviderUserData(provider, accessToken);

        if (!userData.email) {
            throw new Error('Email not provided by OAuth provider');
        }

        // Find or create user
        logger.debug({ provider }, 'Step 3/3: Finding or creating user in database');
        const user = await findOrCreateOAuthUser(userData);

        logger.info({ provider, userId: user?.id }, 'OAuth callback processed successfully');
        return user;
    } catch (error) {
        logger.error({ provider, error }, 'Failed to process OAuth callback');
        throw error;
    }
};
