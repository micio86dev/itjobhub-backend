import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import * as oauthService from '../src/services/auth/oauth.service';
import { oauthConfig, getOAuthCallbackUrl } from '../src/config/oauth.config';
import { dbClient } from '../src/config/database';
import { app } from '../src/app';

// Mock logger to prevent expected errors from polluting the test output
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

describe('OAuth Service', () => {
    describe('getAuthorizationUrl', () => {
        it('should generate a valid Google authorization URL', () => {
            const url = oauthService.getAuthorizationUrl('google', 'test-state');
            const parsedUrl = new URL(url);

            expect(parsedUrl.origin).toBe('https://accounts.google.com');
            expect(parsedUrl.pathname).toBe('/o/oauth2/v2/auth');
            expect(parsedUrl.searchParams.get('client_id')).toBeDefined();
            expect(parsedUrl.searchParams.get('state')).toBe('test-state');
            expect(parsedUrl.searchParams.get('access_type')).toBe('offline');
            expect(parsedUrl.searchParams.get('prompt')).toBe('consent');
        });

        it('should generate a valid GitHub authorization URL', () => {
            const url = oauthService.getAuthorizationUrl('github', 'test-state');
            const parsedUrl = new URL(url);

            expect(parsedUrl.origin).toBe('https://github.com');
            expect(parsedUrl.pathname).toBe('/login/oauth/authorize');
            expect(parsedUrl.searchParams.get('state')).toBe('test-state');
        });

        it('should generate a valid LinkedIn authorization URL', () => {
            const url = oauthService.getAuthorizationUrl('linkedin', 'test-state');
            const parsedUrl = new URL(url);

            expect(parsedUrl.origin).toBe('https://www.linkedin.com');
            expect(parsedUrl.pathname).toBe('/oauth/v2/authorization');
            expect(parsedUrl.searchParams.get('state')).toBe('test-state');
            expect(parsedUrl.searchParams.get('response_type')).toBe('code');
        });
    });

    describe('exchangeCodeForTokens', () => {
        it('should exchange code for tokens', async () => {
            const mockResponse = {
                access_token: 'mock-access-token',
                refresh_token: 'mock-refresh-token'
            };

            global.fetch = mock(() =>
                Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
            ) as any;

            const result = await oauthService.exchangeCodeForTokens('google', 'mock-code');

            expect(result.accessToken).toBe('mock-access-token');
            expect(result.refreshToken).toBe('mock-refresh-token');
        });

        it('should throw error if exchange fails', async () => {
            global.fetch = mock(() =>
                Promise.resolve(new Response('Error', { status: 400 }))
            ) as any;

            expect(oauthService.exchangeCodeForTokens('google', 'invalid-code')).rejects.toThrow();
        });
    });

    describe('getProviderUserData', () => {
        it('should fetch and map Google user data', async () => {
            const mockGoogleData = {
                id: 'google-id',
                email: 'test@gmail.com',
                given_name: 'Test',
                family_name: 'Google',
                picture: 'avatar-url',
                locale: 'it_IT'
            };

            global.fetch = mock(() =>
                Promise.resolve(new Response(JSON.stringify(mockGoogleData), { status: 200 }))
            ) as any;

            const userData = await oauthService.getProviderUserData('google', 'token');

            expect(userData.provider).toBe('google');
            expect(userData.email).toBe('test@gmail.com');
            expect(userData.languages).toContain('italian');
        });

        it('should fetch and map GitHub user data including emails if needed', async () => {
            const mockGitHubUser = {
                id: 123,
                name: 'Test User',
                login: 'testuser',
                email: null,
                avatar_url: 'avatar',
                bio: 'Bio',
                location: 'Milan',
                html_url: 'github-url',
                blog: 'website'
            };

            const mockGitHubEmails = [
                { email: 'primary@gmail.com', primary: true, verified: true }
            ];

            const mockGitHubRepos = [
                { language: 'TypeScript' },
                { language: 'JavaScript' }
            ];

            global.fetch = mock((url: any) => {
                if (url.toString().includes('user/emails')) {
                    return Promise.resolve(new Response(JSON.stringify(mockGitHubEmails), { status: 200 }));
                }
                if (url.toString().includes('user/repos')) {
                    return Promise.resolve(new Response(JSON.stringify(mockGitHubRepos), { status: 200 }));
                }
                return Promise.resolve(new Response(JSON.stringify(mockGitHubUser), { status: 200 }));
            }) as any;

            const userData = await oauthService.getProviderUserData('github', 'token');

            expect(userData.provider).toBe('github');
            expect(userData.email).toBe('primary@gmail.com');
            expect(userData.skills).toContain('TypeScript');
            expect(userData.languages).toContain('typescript');
        });
    });

    describe('findOrCreateOAuthUser', () => {
        beforeEach(async () => {
            // Cleanup database
            await dbClient.comment.deleteMany({ where: { parentId: { not: null } } });
            await dbClient.comment.deleteMany({});
            await dbClient.user.deleteMany({});
            await dbClient.userProfile.deleteMany({});
        });

        it('should create a new user and profile', async () => {
            const userData: oauthService.OAuthUserData = {
                provider: 'google',
                providerId: 'google-id',
                email: 'newuser@gmail.com',
                firstName: 'New',
                lastName: 'User',
                avatar: 'avatar',
                languages: ['italian'],
                skills: ['Node.js']
            };

            const user = await oauthService.findOrCreateOAuthUser(userData);

            expect(user?.email).toBe('newuser@gmail.com');
            expect(user?.oauth_provider).toBe('google');
            expect(user?.profile?.languages).toContain('italian');
            expect(user?.profile?.skills).toContain('Node.js');
        });

        it('should link OAuth to existing email account', async () => {
            // Create existing user first
            await dbClient.user.create({
                data: {
                    email: 'existing@gmail.com',
                    first_name: 'Existing',
                    last_name: 'User',
                    role: 'user'
                }
            });

            const userData: oauthService.OAuthUserData = {
                provider: 'github',
                providerId: 'github-id',
                email: 'existing@gmail.com',
                firstName: 'GitHub',
                lastName: 'Name',
                avatar: 'avatar'
            };

            const user = await oauthService.findOrCreateOAuthUser(userData);

            expect(user?.email).toBe('existing@gmail.com');
            expect(user?.oauth_provider).toBe('github');
            expect(user?.oauth_id).toBe('github-id');
        });

        it('should enrich existing profile with missing data', async () => {
            const existingUser = await dbClient.user.create({
                data: {
                    email: 'enrich@gmail.com',
                    first_name: 'Enrich',
                    last_name: 'User',
                    role: 'user',
                    profile: {
                        create: {
                            languages: [],
                            skills: []
                        }
                    }
                },
                include: { profile: true }
            });

            const userData: oauthService.OAuthUserData = {
                provider: 'linkedin',
                providerId: 'linkedin-id',
                email: 'enrich@gmail.com',
                firstName: 'LinkedIn',
                lastName: 'User',
                languages: ['english'],
                skills: ['React']
            };

            const user = await oauthService.findOrCreateOAuthUser(userData);

            expect(user?.profile?.languages).toContain('english');
            expect(user?.profile?.skills).toContain('React');
        });
    });
});
