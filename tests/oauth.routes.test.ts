import { describe, it, expect, mock, beforeAll, afterAll } from 'bun:test';
import { app } from '../src/app';

// Mock the whole module before importing anything that might use it
mock.module('../src/services/auth/oauth.service', () => {
    return {
        getAuthorizationUrl: (provider: string, state?: string) => {
            if (provider === 'google') return `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`;
            return `https://${provider}.com/auth`;
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
// mock.module() bleeding into other test files in newer Bun versions.
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

        return {
            getAuthorizationUrl: (provider: string, state?: string) => {
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
            },
            exchangeCodeForTokens: async () => ({ accessToken: '', refreshToken: '' }),
            getProviderUserData: async () => { throw new Error('not mocked'); },
            findOrCreateOAuthUser: async () => null,
            processOAuthCallback: async () => null,
            isOAuthConfigured: (provider: string) => {
                const cfg = oauthConfig[provider as keyof typeof oauthConfig];
                return !!(cfg?.clientId && cfg?.clientSecret);
            },
        };
    });
});
