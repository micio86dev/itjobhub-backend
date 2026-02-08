import { describe, it, expect, mock, beforeAll } from 'bun:test';
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
