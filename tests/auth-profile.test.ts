
import { describe, it, expect, beforeAll } from 'bun:test';
import { treaty } from '@elysiajs/eden';
import { setupDatabase } from "../src/config/database";
import { app } from '../src/app';
import { prisma } from '../src/config/database';

const api = treaty(app);

describe('Auth Profile Completion Tests', () => {
    const testEmail = `profile_test_${Date.now()}@test.com`;
    const testPassword = 'password123';
    let authToken: string;

    beforeAll(async () => {
        await setupDatabase();

        // Clean up if exists
        await prisma.refreshToken.deleteMany({ where: { user: { email: testEmail } } });
        await prisma.userProfile.deleteMany({ where: { user: { email: testEmail } } });
        await prisma.user.deleteMany({ where: { email: testEmail } });
    });

    it('should register a new user and return profileCompleted: false', async () => {
        const newUser = {
            email: testEmail,
            password: testPassword,
            firstName: 'Profile',
            lastName: 'Test'
        };

        const response = await api.auth.register.post(newUser);

        const responseData = response.data as any;
        expect(responseData?.status).toBe(201);
        expect(responseData?.success).toBe(true);
        // Use type assertion or check unsafe property if treaty types are not updated yet
        const userData = responseData?.data.user;
        expect(userData.profileCompleted).toBe(false);

        authToken = responseData?.data.token!;
    });

    it('should login and return profileCompleted: false when no profile exists', async () => {
        const response = await api.auth.login.post({
            email: testEmail,
            password: testPassword
        });

        expect(response.data?.status).toBe(200);
        expect(response.data?.success).toBe(true);
        const userData = response.data?.data.user as any;
        expect(userData.profileCompleted).toBe(false);
    });

    it('should create a partial profile and still return profileCompleted: false', async () => {
        // Manually create a partial profile (missing seniority and availability)
        const user = await prisma.user.findUnique({ where: { email: testEmail } });
        expect(user).toBeDefined();

        await prisma.userProfile.create({
            data: {
                user_id: user!.id,
                languages: ['en'],
                skills: ['typescript'],
                // Missing seniority and availability
            }
        });

        const response = await api.auth.login.post({
            email: testEmail,
            password: testPassword
        });

        expect(response.data?.success).toBe(true);
        const userData = response.data?.data.user as any;
        expect(userData.profileCompleted).toBe(false);
    });

    it('should complete profile and return profileCompleted: true', async () => {
        const user = await prisma.user.findUnique({ where: { email: testEmail } });

        await prisma.userProfile.update({
            where: { user_id: user!.id },
            data: {
                seniority: 'senior',
                availability: 'full-time'
            }
        });

        const response = await api.auth.login.post({
            email: testEmail,
            password: testPassword
        });

        expect(response.data?.success).toBe(true);
        const userData = response.data?.data.user as any;
        expect(userData.profileCompleted).toBe(true);
        expect(userData.languages).toContain('en');
        expect(userData.skills).toContain('typescript');
        expect(userData.seniority).toBe('senior');
        expect(userData.availability).toBe('full-time');
    });
});
