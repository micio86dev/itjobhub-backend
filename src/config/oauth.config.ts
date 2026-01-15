/**
 * OAuth Provider Configuration
 * Supports GitHub, LinkedIn, and Google OAuth flows
 */

export type OAuthProvider = 'github' | 'linkedin' | 'google';

interface OAuthProviderConfig {
    clientId: string;
    clientSecret: string;
    authorizeUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
    scopes: string[];
}

const githubConfig: OAuthProviderConfig = {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scopes: ['read:user', 'user:email'],
};

const linkedinConfig: OAuthProviderConfig = {
    clientId: process.env.LINKEDIN_CLIENT_ID || '',
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
    authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    userInfoUrl: 'https://api.linkedin.com/v2/userinfo',
    scopes: ['openid', 'profile', 'email'],
};

const googleConfig: OAuthProviderConfig = {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: ['openid', 'profile', 'email'],
};

export const oauthConfig: Record<OAuthProvider, OAuthProviderConfig> = {
    github: githubConfig,
    linkedin: linkedinConfig,
    google: googleConfig,
};

/**
 * Get the OAuth callback URL for a provider
 */
export const getOAuthCallbackUrl = (provider: OAuthProvider): string => {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    return `${clientUrl}/auth/callback/${provider}`;
};

/**
 * Check if OAuth is properly configured for a provider
 */
export const isOAuthConfigured = (provider: OAuthProvider): boolean => {
    const config = oauthConfig[provider];
    return !!(config.clientId && config.clientSecret);
};
