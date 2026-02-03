
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

        const responseData = response.data;
        expect(response.status).toBe(201);
        // Use type assertion for eden treaty result
        const userData = (responseData as any)?.data.user;
        expect(userData.profileCompleted).toBe(false);

        authToken = (responseData as any)?.data.token!;
    });

    it('should login and return profileCompleted: false when no profile exists', async () => {
        const response = await api.auth.login.post({
            email: testEmail,
            password: testPassword
        });

        expect(response.status).toBe(200);
        const userData = (response.data as any)?.data.user;
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

        const userData = (response.data as any)?.data.user;
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

        const userData = (response.data as any)?.data.user;
        expect(userData.profileCompleted).toBe(true);
        expect(userData.languages).toContain('en');
        expect(userData.skills).toContain('typescript');
        expect(userData.seniority).toBe('senior');
        expect(userData.availability).toBe('full-time');
    });
});
