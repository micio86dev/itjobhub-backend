import { describe, it, expect, mock, beforeAll, afterAll } from 'bun:test';
import { app } from '../src/app';
import { dbClient } from '../src/config/database';

// Mock the whole module before importing anything that might use it.
// IMPORTANT: getAuthorizationUrl must return real-looking URLs so the mock is
// safe if it bleeds into oauth.service.test.ts (same Bun process, shared module cache).
mock.module('../src/services/auth/oauth.service', () => {
    const AUTHORIZE_URLS: Record<string, string> = {
        google: 'https://accounts.google.com/o/oauth2/v2/auth',
        github: 'https://github.com/login/oauth/authorize',
        linkedin: 'https://www.linkedin.com/oauth/v2/authorization',
    };
    return {
        getAuthorizationUrl: (provider: string, state?: string): string => {
            const base = AUTHORIZE_URLS[provider] ?? AUTHORIZE_URLS.google;
            const params = new URLSearchParams({
                client_id: 'mock',
                redirect_uri: 'http://localhost:5173/auth/callback/mock',
                scope: 'openid profile email',
                response_type: 'code',
            });
            if (state) params.append('state', state);
            if (provider === 'google') {
                params.append('access_type', 'offline');
                params.append('prompt', 'consent');
            }
            return `${base}?${params.toString()}`;
        },
        processOAuthCallback: async (provider: string, code: string) => {
            if (code === 'invalid') throw new Error('Invalid code');
            return {
                id: '507f1f77bcf86cd799439011',
                email: 'test@gmail.com',
                first_name: 'Test',
                last_name: 'User',
                role: 'user',
                created_at: new Date(),
                profile: {
                    languages: ['italian'],
                    skills: ['Node.js'],
                    seniority: 'SENIOR',
                    availability: 'FULL_TIME'
                }
            };
        },
        isOAuthConfigured: () => true
    };
});

// Mock logger to avoid scary error logs in tests
mock.module('../src/utils/logger', () => {
    return {
        default: {
            info: () => { },
            error: () => { },
            warn: () => { },
            debug: () => { }
        }
    };
});

// Mock configuration to avoid 503 errors (missing env vars in CI)
mock.module('../src/config/oauth.config', () => {
    return {
        isOAuthConfigured: () => true,
        oauthConfig: {
            google: {
                clientId: 'mock-client',
                clientSecret: 'mock-secret',
                authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
                tokenUrl: 'https://oauth2.googleapis.com/token',
                userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
                scopes: ['openid', 'profile', 'email']
            },
            github: { clientId: 'mock', clientSecret: 'mock', authorizeUrl: '', tokenUrl: '', userInfoUrl: '', scopes: [] },
            linkedin: { clientId: 'mock', clientSecret: 'mock', authorizeUrl: '', tokenUrl: '', userInfoUrl: '', scopes: [] }
        },
        getOAuthCallbackUrl: () => 'http://localhost:5173/auth/callback'
    };
});

describe('OAuth Routes', () => {
    it.skip('GET /auth/oauth/google should redirect to Google auth URL', async () => {
        const response = await app.handle(
            new Request('http://localhost/auth/oauth/google')
        );

        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toContain('accounts.google.com');
    });

    it('GET /auth/oauth/invalid should return 400', async () => {
        const response = await app.handle(
            new Request('http://localhost/auth/oauth/invalid')
        );

        expect(response.status).toBe(400);
    });

    it('POST /auth/oauth/google/callback should return user and tokens', async () => {
        const response = await app.handle(
            new Request('http://localhost/auth/oauth/google/callback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: 'mock-code' })
            })
        );

        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.user.email).toBe('test@gmail.com');
        expect(data.data.token).toBeDefined();
        // Check for refresh token cookie
        expect(response.headers.get('set-cookie')).toContain('refresh_token');
    });

    it('POST /auth/oauth/google/callback should fail if code is missing', async () => {
        const response = await app.handle(
            new Request('http://localhost/auth/oauth/google/callback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            })
        );

        // Elysia/t.Object might return 400 or 422 depending on implementation
        expect([400, 422]).toContain(response.status);
    });

    it('POST /auth/oauth/google/callback should return 401 if callback fails', async () => {
        const response = await app.handle(
            new Request('http://localhost/auth/oauth/google/callback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: 'invalid' })
            })
        );

        expect(response.status).toBe(401);
    });
});

// Restore real module implementations after all tests in this file to prevent
// mock.module() bleeding into other test files when Bun shares module registry across files.
afterAll(() => {
    mock.module('../src/config/oauth.config', () => {
        const githubConfig = {
            clientId: process.env.GITHUB_CLIENT_ID || '',
            clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
            authorizeUrl: 'https://github.com/login/oauth/authorize',
            tokenUrl: 'https://github.com/login/oauth/access_token',
            userInfoUrl: 'https://api.github.com/user',
            scopes: ['read:user', 'user:email'],
        };
        const linkedinConfig = {
            clientId: process.env.LINKEDIN_CLIENT_ID || '',
            clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
            authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
            tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
            userInfoUrl: 'https://api.linkedin.com/v2/userinfo',
            scopes: ['openid', 'profile', 'email'],
        };
        const googleConfig = {
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
            authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
            tokenUrl: 'https://oauth2.googleapis.com/token',
            userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
            scopes: ['openid', 'profile', 'email'],
        };
        const oauthConfig = { github: githubConfig, linkedin: linkedinConfig, google: googleConfig };
        return {
            oauthConfig,
            getOAuthCallbackUrl: (provider: string) =>
                `${process.env.CLIENT_URL || 'http://localhost:5173'}/auth/callback/${provider}`,
            isOAuthConfigured: (provider: string) => {
                const cfg = oauthConfig[provider as keyof typeof oauthConfig];
                return !!(cfg?.clientId && cfg?.clientSecret);
            },
        };
    });

    mock.module('../src/services/auth/oauth.service', () => {
        const oauthConfig = {
            github: {
                clientId: process.env.GITHUB_CLIENT_ID || '',
                clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
                authorizeUrl: 'https://github.com/login/oauth/authorize',
                tokenUrl: 'https://github.com/login/oauth/access_token',
                userInfoUrl: 'https://api.github.com/user',
                scopes: ['read:user', 'user:email'],
            },
            linkedin: {
                clientId: process.env.LINKEDIN_CLIENT_ID || '',
                clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
                authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
                tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
                userInfoUrl: 'https://api.linkedin.com/v2/userinfo',
                scopes: ['openid', 'profile', 'email'],
            },
            google: {
                clientId: process.env.GOOGLE_CLIENT_ID || '',
                clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
                authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
                tokenUrl: 'https://oauth2.googleapis.com/token',
                userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
                scopes: ['openid', 'profile', 'email'],
            },
        };

        const getOAuthCallbackUrl = (provider: string) =>
            `${process.env.CLIENT_URL || 'http://localhost:5173'}/auth/callback/${provider}`;

        const getAuthorizationUrl = (provider: string, state?: string) => {
            const config = oauthConfig[provider as keyof typeof oauthConfig];
            const params = new URLSearchParams({
                client_id: config.clientId,
                redirect_uri: getOAuthCallbackUrl(provider),
                scope: config.scopes.join(' '),
                response_type: 'code',
            });
            if (state) params.append('state', state);
            if (provider === 'linkedin') params.set('response_type', 'code');
            if (provider === 'google') {
                params.append('access_type', 'offline');
                params.append('prompt', 'consent');
            }
            return `${config.authorizeUrl}?${params.toString()}`;
        };

        const exchangeCodeForTokens = async (provider: string, code: string) => {
            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
                body: code,
            });
            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Failed to exchange code for tokens: ${err}`);
            }
            const data = await response.json() as any;
            return { accessToken: data.access_token, refreshToken: data.refresh_token };
        };

        const getProviderUserData = async (provider: string, accessToken: string) => {
            const userInfoUrls: Record<string, string> = {
                google: 'https://www.googleapis.com/oauth2/v2/userinfo',
                github: 'https://api.github.com/user',
                linkedin: 'https://api.linkedin.com/v2/userinfo',
            };
            const response = await fetch(userInfoUrls[provider] || '', {
                headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
            });
            if (!response.ok) {
                const err = await response.text();
                throw new Error(`Failed to fetch user data: ${err}`);
            }
            const data = await response.json() as Record<string, unknown>;

            if (provider === 'google') {
                const languages: string[] = [];
                if (data.locale) {
                    const lang = (data.locale as string).substring(0, 2).toLowerCase();
                    if (lang === 'it') languages.push('italian');
                    else if (lang === 'en') languages.push('english');
                    else if (lang === 'fr') languages.push('french');
                    else if (lang === 'de') languages.push('german');
                    else if (lang === 'es') languages.push('spanish');
                }
                return { provider: 'google', providerId: data.id as string, email: data.email as string, firstName: (data.given_name as string) || 'Google', lastName: (data.family_name as string) || 'User', avatar: data.picture as string, languages };
            }

            if (provider === 'github') {
                let email = data.email as string;
                if (!email) {
                    try {
                        const emailsResp = await fetch('https://api.github.com/user/emails', {
                            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
                        });
                        if (emailsResp.ok) {
                            const emails = await emailsResp.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
                            const primary = emails.find(e => e.primary && e.verified);
                            email = primary?.email || emails[0]?.email || '';
                        }
                    } catch { /* ignore */ }
                }
                const langSet = new Set<string>();
                const skillSet = new Set<string>();
                try {
                    const reposResp = await fetch('https://api.github.com/user/repos?sort=pushed&per_page=10', {
                        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
                    });
                    if (reposResp.ok) {
                        const repos = await reposResp.json() as Array<{ language: string }>;
                        repos.forEach(r => { if (r.language) { langSet.add(r.language.toLowerCase()); skillSet.add(r.language); } });
                    }
                } catch { /* ignore */ }
                const name = (data.name as string) || (data.login as string) || '';
                const parts = name.split(' ');
                return { provider: 'github', providerId: String(data.id), email, firstName: parts[0] || 'GitHub', lastName: parts.slice(1).join(' ') || 'User', avatar: data.avatar_url as string, bio: data.bio as string, location: data.location as string, githubUrl: data.html_url as string, websiteUrl: data.blog as string, languages: Array.from(langSet), skills: Array.from(skillSet) };
            }

            if (provider === 'linkedin') {
                const languages: string[] = [];
                if (data.locale) {
                    const loc = data.locale;
                    const locStr = typeof loc === 'string' ? loc : (typeof loc === 'object' && loc !== null ? ((loc as any).language || '') : '');
                    if (locStr) {
                        const lang = locStr.substring(0, 2).toLowerCase();
                        if (lang === 'it') languages.push('italian');
                        else if (lang === 'en') languages.push('english');
                        else if (lang === 'fr') languages.push('french');
                        else if (lang === 'de') languages.push('german');
                        else if (lang === 'es') languages.push('spanish');
                    }
                }
                return { provider: 'linkedin', providerId: data.sub as string, email: data.email as string, firstName: (data.given_name as string) || 'LinkedIn', lastName: (data.family_name as string) || 'User', avatar: data.picture as string, languages };
            }

            throw new Error(`Unknown provider: ${provider}`);
        };

        const findOrCreateOAuthUser = async (userData: any) => {
            let user = await dbClient.user.findFirst({
                where: { oauth_provider: userData.provider, oauth_id: userData.providerId },
                include: { profile: true },
            });
            if (user) return dbClient.user.findUnique({ where: { id: user.id }, include: { profile: true } });

            const existing = await dbClient.user.findUnique({
                where: { email: userData.email },
                include: { profile: true },
            });
            if (existing) {
                user = await dbClient.user.update({
                    where: { id: existing.id },
                    data: { oauth_provider: userData.provider, oauth_id: userData.providerId, avatar: existing.avatar || userData.avatar },
                    include: { profile: true },
                });
                if (user.profile) {
                    const upd: Record<string, unknown> = {};
                    if ((!user.profile.languages?.length) && userData.languages?.length) upd.languages = userData.languages;
                    if ((!user.profile.skills?.length) && userData.skills?.length) upd.skills = userData.skills;
                    if (Object.keys(upd).length) await dbClient.userProfile.update({ where: { id: user.profile.id }, data: upd });
                } else if (!user.profile) {
                    await dbClient.userProfile.create({ data: { user_id: user.id, languages: userData.languages || [], skills: userData.skills || [] } });
                }
                return dbClient.user.findUnique({ where: { id: user.id }, include: { profile: true } });
            }

            user = await dbClient.user.create({
                data: { email: userData.email, first_name: userData.firstName, last_name: userData.lastName, oauth_provider: userData.provider, oauth_id: userData.providerId, avatar: userData.avatar, role: 'user' },
                include: { profile: true },
            });
            await dbClient.userProfile.create({
                data: { user_id: user.id, languages: userData.languages || [], skills: userData.skills || [] },
            });
            return dbClient.user.findUnique({ where: { id: user.id }, include: { profile: true } });
        };

        return {
            getAuthorizationUrl,
            exchangeCodeForTokens,
            getProviderUserData,
            findOrCreateOAuthUser,
            processOAuthCallback: async (provider: string, code: string) => {
                const { accessToken } = await exchangeCodeForTokens(provider, code);
                const userData = await getProviderUserData(provider, accessToken);
                if (!(userData as any).email) throw new Error('Email not provided by OAuth provider');
                return findOrCreateOAuthUser(userData);
            },
            isOAuthConfigured: (provider: string) => {
                const cfg = oauthConfig[provider as keyof typeof oauthConfig];
                return !!(cfg?.clientId && cfg?.clientSecret);
            },
        };
    });
});
