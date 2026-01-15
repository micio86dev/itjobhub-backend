/**
 * OAuth Service
 * Handles OAuth authentication flow for GitHub, LinkedIn, and Google
 */

import { dbClient } from '../../config/database';
import { oauthConfig, getOAuthCallbackUrl, OAuthProvider, isOAuthConfigured } from '../../config/oauth.config';
import logger from "../../utils/logger";

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

    // GitHub requires Accept header for JSON response
    if (provider === 'github') {
        headers['Accept'] = 'application/json';
    }

    const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers,
        body: body.toString(),
    });

    if (!response.ok) {
        const errorText = await response.text();
        logger.error({ provider, status: response.status, error: errorText }, 'Failed to exchange code for tokens');
        throw new Error(`Failed to exchange code for tokens: ${errorText}`);
    }

    const data = await response.json();

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
    };
};

/**
 * Fetch user data from provider
 */
export const getProviderUserData = async (
    provider: OAuthProvider,
    accessToken: string
): Promise<OAuthUserData> => {
    const config = oauthConfig[provider];

    const response = await fetch(config.userInfoUrl, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        logger.error({ provider, status: response.status, error: errorText }, 'Failed to fetch user data');
        throw new Error(`Failed to fetch user data: ${errorText}`);
    }

    const data = await response.json();

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
};

/**
 * Map GitHub user data to our format
 */
const mapGitHubUserData = async (data: Record<string, unknown>, accessToken: string): Promise<OAuthUserData> => {
    // GitHub might not return email in main request, need to fetch from emails endpoint
    let email = data.email as string;

    if (!email) {
        try {
            const emailsResponse = await fetch('https://api.github.com/user/emails', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/json',
                },
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
    };
};

/**
 * Map LinkedIn user data to our format (using OpenID Connect)
 */
const mapLinkedInUserData = (data: Record<string, unknown>): OAuthUserData => {
    return {
        provider: 'linkedin',
        providerId: data.sub as string,
        email: data.email as string,
        firstName: data.given_name as string || 'LinkedIn',
        lastName: data.family_name as string || 'User',
        avatar: data.picture as string,
        linkedinUrl: `https://www.linkedin.com/in/${data.sub}`,
    };
};

/**
 * Map Google user data to our format
 */
const mapGoogleUserData = (data: Record<string, unknown>): OAuthUserData => {
    return {
        provider: 'google',
        providerId: data.id as string,
        email: data.email as string,
        firstName: data.given_name as string || 'Google',
        lastName: data.family_name as string || 'User',
        avatar: data.picture as string,
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

    if (user) {
        logger.info({ userId: user.id, provider: userData.provider }, 'OAuth user found, logging in');
        return user;
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
        return user;
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
    if (!isOAuthConfigured(provider)) {
        throw new Error(`OAuth not configured for ${provider}`);
    }

    // Exchange code for tokens
    const { accessToken } = await exchangeCodeForTokens(provider, code);

    // Get user data from provider
    const userData = await getProviderUserData(provider, accessToken);

    if (!userData.email) {
        throw new Error('Email not provided by OAuth provider');
    }

    // Find or create user
    const user = await findOrCreateOAuthUser(userData);

    return user;
};
